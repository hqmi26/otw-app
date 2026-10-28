import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MapView, { type MapMode } from './components/MapView';
import IntroScreen from './components/IntroScreen';
import LoginScreen from './components/LoginScreen';
import HomeScreen from './components/HomeScreen';
import SearchScreen, { type SearchPurpose } from './components/SearchScreen';
import RouteSheet from './components/RouteSheet';
import NavigationView from './components/NavigationView';
import LocationScreen from './components/LocationScreen';
import AccountScreen from './components/AccountScreen';
import FamilyScreen from './components/FamilyScreen';
import ReportSheet from './components/ReportSheet';
import SavePlaceSheet from './components/SavePlaceSheet';
import StepsSheet from './components/StepsSheet';
import FeedbackSheet from './components/FeedbackSheet';
import { CheckIcon } from './components/icons';
import { getRoutes, reverseGeocode, type Place, type Route } from './lib/api';
import {
  bearing,
  cumulative,
  distance,
  formatClock,
  formatDuration,
  snapToLine,
  type LngLat,
} from './lib/geo';
import { aheadPhrase, hazardPhrase, instruction, PHRASES, type Lang } from './lib/instructions';
import { rushHourFactor } from './lib/eta';
import {
  HAZARDS,
  REPORT_LIFETIME_MS,
  type HazardReport,
  type HazardType,
  type Profile,
  type SavedKind,
  type SavedPlace,
} from './lib/models';
import { speak, stopSpeaking } from './lib/voice';
import { useGeolocation } from './hooks/useGeolocation';
import { useTheme } from './hooks/useTheme';
import { useRecents } from './hooks/useRecents';
import { useStored } from './hooks/useStored';
import { usePresence } from './hooks/usePresence';
import { useNavProgress, useSimulatedDrive } from './hooks/useNavigation';
import { requestCompassPermission, useCompass } from './hooks/useCompass';

type Screen = 'home' | 'search' | 'route' | 'nav' | 'family' | 'account' | 'report' | 'save' | 'steps' | 'feedback';
/** Screens that open as a sheet over whatever is underneath. */
const MODALS: Screen[] = ['report', 'save', 'steps', 'feedback'];
/** Full-screen pages opened from home; home stays mounted underneath them. */
const HOME_OVERLAYS: Screen[] = ['search', 'account', 'family', 'report', 'save', 'feedback'];

/**
 * Add ?sim to the address to fake the drive, e.g. testing on a laptop. It also
 * lets the app open without location, starting trips from DEMO_START.
 */
const FORCE_SIM = new URLSearchParams(window.location.search).has('sim');
const DEMO_START: LngLat = [116.0762, 5.9836]; // Kota Kinabalu city centre
const DEMO_SPEEDS = [1, 4, 10];

/** A report this close to the route counts as on it. */
const HAZARD_ON_ROUTE_M = 40;
/** How far ahead a hazard on the route is shown, and how far ahead it's said out loud. */
const HAZARD_SHOW_M = 1500;
const HAZARD_SPEAK_M = 600;
/** Closer than this to the stop (e.g. parked at the school gate) counts as having reached it. */
const AT_STOP_M = 150;

/** Pixels the UI covers at the top/bottom, so the map centres in the visible gap. */
const INSETS: Partial<Record<Screen, { top: number; bottom: number }>> = {
  home: { top: 130, bottom: 300 },
  route: { top: 80, bottom: 380 },
  nav: { top: 200, bottom: 180 },
};
const NO_INSETS = { top: 0, bottom: 0 };

const isArray = (v: unknown) => Array.isArray(v);

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const geo = useGeolocation();
  const { recents, add: addRecent } = useRecents();
  const [profile, setProfile] = useStored<Profile | null>('otw-profile', null, (v) => v == null || typeof v === 'object');
  const [saved, setSaved] = useStored<SavedPlace[]>('otw-saved', [], isArray);
  const [reports, setReports] = useStored<HazardReport[]>('otw-reports', [], isArray);
  /** Language for turn instructions and voice (Account → Voice directions). */
  const [lang, setLang] = useStored<Lang>('otw-voice-lang', 'en', (v) => v === 'en' || v === 'ms');

  // --- Opening: logo intro, then login the first time. ---
  const [phase, setPhase] = useState<'intro' | 'login' | 'app'>('intro');
  const hasProfile = useRef(profile != null);
  hasProfile.current = profile != null;
  const finishIntro = useCallback(
    () => setPhase((ph) => (ph === 'intro' ? (hasProfile.current ? 'app' : 'login') : ph)),
    [],
  );

  // --- Screens. Kept in browser history so the phone's back gesture works. ---
  const [stack, setStack] = useState<Screen[]>(['home']);
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const lastMove = useRef<'push' | 'pop'>('push');
  const top = stack[stack.length - 1];
  const base = [...stack].reverse().find((s) => !MODALS.includes(s)) ?? 'home';

  useEffect(() => {
    window.history.replaceState({ depth: 0 }, '');
    const onPop = (e: PopStateEvent) => {
      const depth = typeof e.state?.depth === 'number' ? e.state.depth : 0;
      lastMove.current = 'pop';
      setStack((s) => s.slice(0, depth + 1));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = useCallback((next: Screen) => {
    const nextStack = [...stackRef.current, next];
    window.history.pushState({ depth: nextStack.length - 1 }, '');
    lastMove.current = 'push';
    setStack(nextStack);
  }, []);
  const back = useCallback(() => window.history.back(), []);
  const backTo = useCallback((depth: number) => {
    const steps = stackRef.current.length - 1 - depth;
    if (steps > 0) window.history.go(-steps);
  }, []);

  // --- Little confirmation messages ---
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const showToast = useCallback((text: string) => setToast({ text, id: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  // --- Trip state ---
  const [destination, setDestination] = useState<Place | null>(null);
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [activeRoute, setActiveRoute] = useState<Route | null>(null);
  const [recenterKey, setRecenterKey] = useState(0);
  const [muted, setMuted] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const [demoSpeedIdx, setDemoSpeedIdx] = useState(0);
  const [searchPurpose, setSearchPurpose] = useState<SearchPurpose>('go');
  const [placeToSave, setPlaceToSave] = useState<Place | null>(null);
  /** A stop on the way, e.g. fetching Adik from school on the way home. */
  const [stop, setStop] = useState<Place | null>(null);

  const realPos = geo.fix?.coord ?? null;
  const origin = realPos ?? (FORCE_SIM ? DEMO_START : null);
  // OTW needs to know where the phone is; until then a screen asks for location.
  // Once there's been a fix, a later GPS hiccup (a tunnel) doesn't lock the app.
  const locationReady = origin != null;
  const locationNote = realPos
    ? geo.error && `${geo.error} Showing where you were last.`
    : 'Demo mode: trips start from KK city centre.';

  // Forget the trip once the user has backed out of it.
  useEffect(() => {
    if (!stack.includes('route') && !stack.includes('nav')) {
      setDestination(null);
      setStop(null);
      setRoutes(null);
      setActiveRoute(null);
      stopSpeaking();
    }
  }, [stack]);

  const routeRequest = useRef<AbortController | null>(null);
  const fetchRoutes = useCallback((from: LngLat, to: Place, via: Place | null) => {
    routeRequest.current?.abort();
    const ctrl = new AbortController();
    routeRequest.current = ctrl;
    setRoutes(null);
    setRouteError(null);
    setSelected(0);
    getRoutes(from, to.coord, ctrl.signal, via)
      .then(setRoutes)
      .catch((e: Error) => {
        if (e.name === 'AbortError') return;
        setRouteError(
          e.message === 'No route found'
            ? 'No driving route found to this place.'
            : 'Couldn’t get directions. Check your internet and try again.',
        );
      });
  }, []);

  const openRoute = (place: Place, remember = true) => {
    if (!origin) return;
    if (remember) addRecent(place);
    setDestination(place);
    setStop(null);
    fetchRoutes(origin, place, null);
    go('route');
  };

  // Long-press on the map: drop a pin there and show directions to it.
  const dropPin = (coord: LngLat) => {
    if (base !== 'home') return;
    navigator.vibrate?.(25);
    const pin: Place = {
      id: `pin:${coord[1].toFixed(5)},${coord[0].toFixed(5)}`,
      name: 'Dropped pin',
      subtitle: `${coord[1].toFixed(5)}, ${coord[0].toFixed(5)}`,
      coord,
    };
    openRoute(pin, false);
    // Then find out what's there and name the pin after it.
    reverseGeocode(coord)
      .then((found) => {
        if (!found) return;
        const named = { ...pin, name: found.name, subtitle: found.subtitle };
        addRecent(named);
        setDestination((d) => (d?.id === pin.id ? named : d));
      })
      .catch(() => {
        // Offline or no result: it stays "Dropped pin" with its coordinates.
      });
  };

  const pickFromSearch = (place: Place) => {
    if (searchPurpose === 'save') {
      setPlaceToSave(place);
      go('save');
    } else if (searchPurpose === 'stop') {
      if (origin && destination) {
        setStop(place);
        fetchRoutes(origin, destination, place);
      }
      back();
    } else {
      openRoute(place);
    }
  };

  const addStop = () => {
    setSearchPurpose('stop');
    go('search');
  };
  const removeStop = () => {
    setStop(null);
    if (origin && destination) fetchRoutes(origin, destination, null);
  };

  const startTrip = () => {
    if (!routes || !destination) return;
    void requestCompassPermission(); // iPhone only asks inside a tap
    const route = routes[selected];
    spoken.current.clear();
    pace.current = null;
    tripRush.current = rushHourFactor(new Date());
    setActiveRoute(route);
    go('nav');
    if (!muted) {
      const first = route.steps[0] ? ` ${instruction(route.steps[0], lang)}.` : '';
      speak(`${PHRASES.start[lang]}${first}`, lang);
    }
  };

  const endTrip = () => {
    stopSpeaking();
    backTo(0);
  };

  // --- Saved places ---
  const savePlace = (label: string, kind: SavedKind) => {
    if (!placeToSave) return;
    const place = placeToSave;
    setSaved((list) => [
      ...list.filter((s) => s.label !== label && s.place.id !== place.id),
      { label, kind, place },
    ]);
    showToast(`Saved as ${label}`);
    if (searchPurpose === 'save') backTo(0);
    else back();
  };
  const removeSaved = (label: string) => {
    setSaved((list) => list.filter((s) => s.label !== label));
    showToast(`Removed ${label}`);
    back();
  };
  const savedAs = destination ? (saved.find((s) => s.place.id === destination.id)?.label ?? null) : null;

  // --- Send ETA: opens WhatsApp with the message ready, and the driver picks the chat. ---
  const sendEta = (secondsLeft: number) => {
    if (!destination) return;
    const place = savedAs ?? destination.name;
    const left = formatDuration(secondsLeft);
    const at = formatClock(new Date(Date.now() + secondsLeft * 1000));
    const text =
      lang === 'ms'
        ? `OTW ke ${place} 🚗 Sampai dalam ${left}, lebih kurang pukul ${at}.`
        : `OTW to ${place} 🚗 Arriving in about ${left}, around ${at}.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  // --- Where the car is while navigating ---
  const simulate = base === 'nav' && (FORCE_SIM || !realPos);
  const sim = useSimulatedDrive(activeRoute, simulate, DEMO_SPEEDS[demoSpeedIdx]);

  // Direction of travel from GPS. Ignores the few-metre wobble GPS has when
  // standing still (indoors it can jump around and spin the map).
  const lastPos = useRef<LngLat | null>(null);
  const lastMovedAt = useRef(0);
  const [courseHeading, setCourseHeading] = useState<number | null>(null);
  const accuracy = geo.fix?.accuracy ?? Infinity;
  useEffect(() => {
    if (!realPos || accuracy > 30) return;
    const prev = lastPos.current;
    if (!prev) {
      lastPos.current = realPos;
    } else if (distance(prev, realPos) > 12) {
      setCourseHeading(bearing(prev, realPos));
      lastPos.current = realPos;
      lastMovedAt.current = Date.now();
    }
  }, [realPos, accuracy]);
  const gpsHeading = geo.fix?.heading != null && (geo.fix.speed ?? 0) > 2 ? geo.fix.heading : courseHeading;
  // Driving speed (≈9 km/h+), or GPS has seen us travel in the last few seconds.
  const driving = simulate || (geo.fix?.speed ?? 0) > 2.5 || Date.now() - lastMovedAt.current < 5000;

  // The phone's compass, for when we're standing still: turn the phone and the
  // arrow and map turn with it. While driving it's ignored (compasses are
  // unreliable inside a car), and the road/GPS direction is used instead.
  const compass = useCompass(phase === 'app' && !simulate);

  const navPos = simulate ? (sim?.coord ?? null) : realPos;
  const progress = useNavProgress(base === 'nav' ? activeRoute : null, navPos);
  // Near the route: draw the car on the road and point the map along it.
  const shownNavPos = progress?.onRoad?.coord ?? navPos;
  const travelHeading = progress?.onRoad?.heading ?? (simulate ? (sim?.heading ?? null) : gpsHeading);
  const navHeading = driving ? travelHeading : (compass ?? travelHeading);

  // The stop counts as done once the route's "stop" turn is behind the car.
  const stopPassed =
    base === 'nav' &&
    activeRoute != null &&
    progress != null &&
    !activeRoute.steps.some((s, i) => s.type === 'stop' && i >= progress.stepIndex);
  const shownStop = stopPassed ? null : stop;

  // The camera follows the car until the user drags the map to look around.
  const [following, setFollowing] = useState(true);
  useEffect(() => {
    if (base === 'nav') setFollowing(true);
  }, [base]);

  // Voice: once ~400 m before a turn, once just before it.
  const spoken = useRef(new Set<string>());
  useEffect(() => {
    if (base !== 'nav' || !progress || !activeRoute || muted) return;
    if (progress.arrived) {
      if (!spoken.current.has('arrived')) {
        spoken.current.add('arrived');
        speak(PHRASES.arrived[lang], lang);
      }
      return;
    }
    const step = activeRoute.steps[progress.stepIndex];
    if (!step || progress.stepIndex === 0) return;
    const far = `${progress.stepIndex}-far`;
    const near = `${progress.stepIndex}-near`;
    if (progress.toManeuver < 60 && !spoken.current.has(near)) {
      spoken.current.add(near);
      spoken.current.add(far);
      speak(instruction(step, lang), lang);
    } else if (progress.toManeuver < 400 && !spoken.current.has(far)) {
      spoken.current.add(far);
      speak(aheadPhrase(progress.toManeuver, step, lang), lang);
    }
  }, [base, progress, activeRoute, muted, lang]);

  // --- ETA ---
  // The free routing service doesn't know about traffic, so we adjust its
  // estimate twice: for the usual Malaysian rush hours when the trip starts,
  // and then by how fast the trip is actually going compared with the plan.
  const tripRush = useRef(1);
  const pace = useRef<{ t: number; covered: number } | null>(null);
  const remainingTime = (() => {
    if (!progress || !activeRoute) return null;
    const planned = progress.remainingTime * tripRush.current;
    if (simulate) return planned;
    if (!pace.current) {
      pace.current = { t: Date.now(), covered: progress.covered };
      return planned;
    }
    const drivenM = progress.covered - pace.current.covered;
    const elapsedS = (Date.now() - pace.current.t) / 1000;
    const expectedS = (activeRoute.duration * tripRush.current * drivenM) / Math.max(1, activeRoute.distance);
    // Trust the real pace only once there's enough of it (≥400 m and a minute), and more as the trip goes on.
    if (drivenM < 400 || elapsedS < 60 || expectedS <= 0) return planned;
    const ratio = Math.min(3, Math.max(0.6, elapsedS / expectedS));
    const weight = Math.min(1, drivenM / 3000);
    return planned * (1 + (ratio - 1) * weight);
  })();

  // Off the route for a few fixes in a row: get a new one from here.
  const offRouteCount = useRef(0);
  const lastReroute = useRef(0);
  useEffect(() => {
    if (base !== 'nav' || simulate || !progress || !destination || !realPos || rerouting) return;
    offRouteCount.current = progress.offRoute ? offRouteCount.current + 1 : 0;
    if (offRouteCount.current < 3 || Date.now() - lastReroute.current < 10000) return;
    offRouteCount.current = 0;
    lastReroute.current = Date.now();
    setRerouting(true);
    // Still on the way to the stop: the new route goes through it too.
    const via = shownStop && distance(realPos, shownStop.coord) > AT_STOP_M ? shownStop : null;
    getRoutes(realPos, destination.coord, undefined, via)
      .then((list) => {
        spoken.current.clear();
        pace.current = null;
        setActiveRoute(list[0]);
        if (!via) setStop(null);
        if (!muted) speak(PHRASES.rerouted[lang], lang);
      })
      .catch(() => {
        // Keep the old route; try again on the next fixes.
      })
      .finally(() => setRerouting(false));
  }, [base, simulate, progress, destination, shownStop, realPos, rerouting, muted, lang]);

  // Keep the screen on while driving.
  useEffect(() => {
    if (base !== 'nav' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock
      .request('screen')
      .then((l) => (lock = l))
      .catch(() => {});
    return () => {
      lock?.release().catch(() => {});
    };
  }, [base]);

  // --- Hazard reports (on this phone until family sharing exists) ---
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(id);
  }, []);
  const liveReports = useMemo(() => reports.filter((r) => now - r.at < REPORT_LIFETIME_MS), [reports, now]);
  const reportPos = base === 'nav' ? shownNavPos : realPos;
  const sendReport = (type: HazardType, note: string) => {
    if (!reportPos) return;
    const report: HazardReport = { id: `${Date.now()}`, type, coord: reportPos, note, at: Date.now() };
    setReports((list) => [...list.filter((r) => Date.now() - r.at < REPORT_LIFETIME_MS), report]);
    const label = HAZARDS.find((h) => h.type === type)!.label;
    showToast(`${label} reported`);
    back();
  };

  // Reports on the road ahead: a chip from 1.5 km, and the voice once at ~600 m.
  const routeCum = useMemo(() => (activeRoute ? cumulative(activeRoute.coords) : null), [activeRoute]);
  const reportsOnRoute = useMemo(() => {
    if (!activeRoute || !routeCum) return [];
    return liveReports.flatMap((report) => {
      const snap = snapToLine(report.coord, activeRoute.coords, routeCum);
      return snap.offset < HAZARD_ON_ROUTE_M ? [{ report, along: snap.along }] : [];
    });
  }, [activeRoute, routeCum, liveReports]);
  let hazardAhead: { report: HazardReport; distance: number } | null = null;
  if (base === 'nav' && progress) {
    for (const { report, along } of reportsOnRoute) {
      const d = along - progress.covered;
      if (d > 30 && d < HAZARD_SHOW_M && (!hazardAhead || d < hazardAhead.distance)) hazardAhead = { report, distance: d };
    }
  }
  useEffect(() => {
    if (!hazardAhead || muted || hazardAhead.distance > HAZARD_SPEAK_M) return;
    const key = `hazard-${hazardAhead.report.id}`;
    if (spoken.current.has(key)) return;
    spoken.current.add(key);
    // Queued behind any turn instruction instead of cutting it off.
    speak(hazardPhrase(hazardAhead.report.type, hazardAhead.distance, lang), lang, { queue: true });
  }, [hazardAhead, muted, lang]);

  const shareApp = async () => {
    const url = window.location.origin;
    const text = 'Jom guna OTW – aplikasi trip kita!';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'OTW', text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      showToast('Link copied – paste it in the family WhatsApp');
    } catch {
      // Share sheet closed: nothing to do.
    }
  };

  // --- Leaving animations for full-screen pages ---
  const leaveStyle = lastMove.current === 'pop' ? 'pop' : 'fade';
  const searchView = usePresence(phase === 'app' && base === 'search');
  const accountView = usePresence(phase === 'app' && base === 'account');
  const familyView = usePresence(phase === 'app' && base === 'family');
  const reportView = usePresence(phase === 'app' && top === 'report', 250);
  const saveView = usePresence(phase === 'app' && top === 'save' && placeToSave != null, 250);
  const stepsRoute = base === 'nav' ? activeRoute : (routes?.[selected] ?? null);
  const stepsView = usePresence(phase === 'app' && top === 'steps' && stepsRoute != null, 250);
  const feedbackView = usePresence(phase === 'app' && top === 'feedback', 250);

  const mapMode: MapMode = base === 'nav' ? 'nav' : base === 'route' ? 'preview' : 'browse';
  // Keep the home screen alive under full-screen pages opened from it, so going
  // back is instant instead of rebuilding (and re-animating) the whole screen.
  const homeAlive = base === 'home' || (HOME_OVERLAYS.includes(base) && !stack.includes('route') && !stack.includes('nav'));

  return (
    <div className="app" data-screen={base}>
      <MapView
        theme={theme}
        mode={mapMode}
        position={base === 'nav' ? shownNavPos : realPos}
        heading={base === 'nav' ? navHeading : compass}
        routes={base === 'nav' ? (activeRoute ? [activeRoute] : null) : base === 'route' ? routes : null}
        selectedRoute={base === 'nav' ? 0 : selected}
        destination={destination?.coord ?? null}
        stop={shownStop?.coord ?? null}
        reports={liveReports}
        insets={INSETS[base] ?? NO_INSETS}
        recenterKey={recenterKey}
        follow={following}
        onSelectRoute={setSelected}
        onUserMove={() => {
          if (base === 'nav') setFollowing(false);
        }}
        onLongPress={dropPin}
      />

      {phase === 'app' && profile && !locationReady && <LocationScreen problem={geo.problem} onRetry={geo.retry} />}

      {phase === 'app' && profile && locationReady && (
        <>
          {homeAlive && (
            <div className="home-layer" inert={base !== 'home'}>
            <HomeScreen
              profile={profile}
              position={realPos}
              locationNote={locationNote}
              saved={saved}
              recents={recents}
              onSearch={() => {
                setSearchPurpose('go');
                go('search');
              }}
              onAccount={() => go('account')}
              onPick={openRoute}
              onAddSaved={() => {
                setSearchPurpose('save');
                go('search');
              }}
              onRecenter={() => {
                void requestCompassPermission();
                setRecenterKey((k) => k + 1);
              }}
              onReport={() => go('report')}
              onFamily={() => go('family')}
              onFeedback={() => go('feedback')}
            />
            </div>
          )}

          {base === 'route' && destination && (
            <RouteSheet
              destination={destination}
              originLabel={realPos ? 'your location' : 'KK city centre (demo)'}
              savedAs={savedAs}
              stop={stop}
              routes={routes}
              error={routeError}
              selected={selected}
              rush={rushHourFactor(new Date())}
              onSelect={setSelected}
              onShowSteps={() => go('steps')}
              onStart={startTrip}
              onRetry={() => origin && fetchRoutes(origin, destination, stop)}
              onAddStop={addStop}
              onRemoveStop={removeStop}
              onSave={() => {
                setSearchPurpose('go');
                setPlaceToSave(destination);
                go('save');
              }}
              onBack={back}
            />
          )}

          {base === 'nav' && activeRoute && destination && (
            <NavigationView
              route={activeRoute}
              progress={progress}
              remainingTime={remainingTime}
              destination={destination}
              lang={lang}
              muted={muted}
              rerouting={rerouting}
              demoSpeed={simulate ? DEMO_SPEEDS[demoSpeedIdx] : null}
              following={following}
              onRecenter={() => setFollowing(true)}
              onToggleMute={() => {
                if (!muted) stopSpeaking();
                setMuted((m) => !m);
              }}
              onDemoSpeed={() => setDemoSpeedIdx((i) => (i + 1) % DEMO_SPEEDS.length)}
              onShowSteps={() => go('steps')}
              onReport={() => go('report')}
              hazardAhead={hazardAhead && { type: hazardAhead.report.type, distance: hazardAhead.distance }}
              onSendEta={sendEta}
              onEnd={endTrip}
            />
          )}

          {searchView.mounted && (
            <SearchScreen
              position={realPos}
              recents={recents}
              saved={saved}
              purpose={searchPurpose}
              leaving={searchView.leaving ? leaveStyle : null}
              onPick={pickFromSearch}
              onBack={back}
            />
          )}

          {accountView.mounted && (
            <AccountScreen
              profile={profile}
              theme={theme}
              leaving={accountView.leaving ? leaveStyle : null}
              onSaveName={(name) => {
                setProfile({ ...profile, name });
                showToast(`Saved! Family sees you as ${name}`);
              }}
              onToggleTheme={toggleTheme}
              lang={lang}
              onLang={setLang}
              onTestVoice={(l) => speak(PHRASES.test[l], l)}
              onFeedback={() => go('feedback')}
              onLogout={() => {
                backTo(0);
                setProfile(null);
                setPhase('login');
              }}
              onBack={back}
            />
          )}

          {familyView.mounted && (
            <FamilyScreen
              profile={profile}
              hasLocation={realPos != null}
              leaving={familyView.leaving ? leaveStyle : null}
              onShareApp={shareApp}
              onBack={back}
            />
          )}

          {saveView.mounted && placeToSave && (
            <SavePlaceSheet
              key={placeToSave.id}
              place={placeToSave}
              saved={saved}
              leaving={saveView.leaving}
              onSave={savePlace}
              onRemove={removeSaved}
              onClose={back}
            />
          )}

          {stepsView.mounted && stepsRoute && (
            <StepsSheet
              route={stepsRoute}
              lang={lang}
              currentStep={base === 'nav' ? (progress?.stepIndex ?? null) : null}
              leaving={stepsView.leaving}
              onClose={back}
            />
          )}

          {reportView.mounted && (
            <ReportSheet
              hasLocation={reportPos != null}
              leaving={reportView.leaving}
              onSend={sendReport}
              onClose={back}
            />
          )}

          {feedbackView.mounted && <FeedbackSheet name={profile.name} leaving={feedbackView.leaving} onClose={back} />}
        </>
      )}

      {phase === 'login' && (
        <LoginScreen
          onDone={(p) => {
            setProfile(p);
            setPhase('app');
          }}
        />
      )}

      {phase === 'intro' && <IntroScreen onDone={finishIntro} />}

      {toast && (
        <div key={toast.id} className="toast" role="status">
          <CheckIcon size={18} className="toast-icon" />
          <span>{toast.text}</span>
        </div>
      )}
    </div>
  );
}
