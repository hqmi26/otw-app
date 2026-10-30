import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  areaAt,
  familyApi,
  FamilyError,
  type Area,
  type FamilyPatch,
  type FamilyState,
} from '../lib/family';
import { distance, type LngLat } from '../lib/geo';
import { useStored } from './useStored';

/** How often the Family list refreshes: quicker while someone's car is moving. */
const POLL_MS = 30000;
const POLL_LIVE_MS = 10000;

/**
 * Your family group: who's in it and where (by area), kept fresh from the
 * server while the app is open. The phone's secret token is kept in storage.
 */
export function useFamily(enabled: boolean) {
  const [token, setToken] = useStored<string | null>('otw-family-token', null, (v) => v == null || typeof v === 'string');
  const [state, setState] = useState<FamilyState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const forget = useCallback(() => {
    setToken(null);
    setState(null);
  }, [setToken]);

  /** Runs a request; if the server no longer knows this phone, forget the family. */
  const guard = useCallback(
    async <T>(run: () => Promise<T>): Promise<T> => {
      try {
        return await run();
      } catch (e) {
        if (e instanceof FamilyError && e.status === 401) forget();
        throw e;
      }
    },
    [forget],
  );

  const refresh = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return;
    try {
      setState(await guard(() => familyApi.state(t)));
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Couldn’t load your family.');
    }
  }, [guard]);

  const someoneLive = state?.members.some((m) => m.id !== state.me && m.live) ?? false;
  useEffect(() => {
    if (!enabled || !token) return;
    void refresh();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, someoneLive ? POLL_LIVE_MS : POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, token, someoneLive, refresh]);

  const start = useCallback(
    async (name: string) => {
      const r = await familyApi.start(name, tokenRef.current);
      setToken(r.token);
      setState(r.family);
    },
    [setToken],
  );

  const join = useCallback(
    async (code: string, name: string) => {
      const r = await familyApi.join(code, name, tokenRef.current);
      setToken(r.token);
      setState(r.family);
    },
    [setToken],
  );

  const update = useCallback(
    async (patch: FamilyPatch) => {
      const t = tokenRef.current;
      if (!t) return;
      setState(await guard(() => familyApi.update(t, patch)));
    },
    [guard],
  );

  const newLink = useCallback(async () => {
    const t = tokenRef.current;
    if (t) setState(await guard(() => familyApi.newLink(t)));
  }, [guard]);

  const leave = useCallback(async () => {
    const t = tokenRef.current;
    if (t) await familyApi.leave(t).catch(() => {});
    forget();
  }, [forget]);

  const me = state?.members.find((m) => m.id === state.me) ?? null;
  return useMemo(
    () => ({ token, state, me, inFamily: token != null, loadError, refresh, start, join, update, newLink, leave }),
    [token, state, me, loadError, refresh, start, join, update, newLink, leave],
  );
}

export type Family = ReturnType<typeof useFamily>;

/** Work the area out again after moving this far. */
const AREA_RECHECK_M = 150;
/** With no name yet (no signal), try again this often even without moving. */
const AREA_RETRY_MS = 30000;

/** The area you're in (e.g. Likas). Null while off. */
export function useArea(position: LngLat | null): Area | null {
  const [area, setArea] = useState<Area | null>(null);
  const last = useRef<{ at: LngLat; time: number; found: boolean } | null>(null);
  useEffect(() => {
    if (!position) return;
    const l = last.current;
    if (l && distance(l.at, position) < AREA_RECHECK_M && (l.found || Date.now() - l.time < AREA_RETRY_MS)) return;
    const lookup = { at: position, time: Date.now(), found: false };
    last.current = lookup;
    // Not cancelled when the next fix comes in: GPS fixes arrive faster than
    // the answer does, and a nearby fix doesn't start a new lookup.
    void areaAt(position).then((a) => {
      // A newer lookup wins; with no name at all, the last area stays.
      if (last.current !== lookup || !a) return;
      lookup.found = true;
      setArea((old) => (old?.name === a.name ? old : a));
    });
  }, [position]);
  return position ? area : null;
}

export interface Sharing {
  area: Area | null;
  trip: { to: string; eta: number } | null;
  live: { lat: number; lng: number; heading: number | null } | null;
}

/** Re-send the area this often even when it hasn't changed, so family see "since" stay fresh. */
const AREA_HEARTBEAT_MS = 5 * 60 * 1000;
/** Send the moving car this often during a live trip. */
const LIVE_EVERY_MS = 10000;
/** Re-send the ETA when it moves by this much, or at least this often. */
const ETA_CHANGE_S = 90;
const TRIP_EVERY_MS = 2 * 60 * 1000;
/** After a failed send (no signal), wait this long before trying again. */
const RETRY_MS = 15000;

interface Sent {
  area: string | null;
  areaAt: number;
  trip: string | null;
  eta: number;
  tripAt: number;
  live: boolean;
  liveAt: number;
}
const NOTHING_SENT: Sent = { area: null, areaAt: 0, trip: null, eta: 0, tripAt: 0, live: false, liveAt: 0 };

/**
 * Sends your area, trip ETA and (only during a live trip) the moving car to
 * the family, without flooding the server: only when something changed, or
 * now and then to say you're still there. Nothing is sent while Private is on.
 */
export function useFamilySharing(family: Family, share: Sharing) {
  const sent = useRef<Sent>(NOTHING_SENT);
  const busyUntil = useRef(0);
  const isPrivate = family.me?.private ?? true;

  // Coming back from Private (or joining) starts afresh, so everything goes out at once.
  useEffect(() => {
    sent.current = NOTHING_SENT;
  }, [isPrivate, family.token]);

  const { area, trip, live } = share;
  useEffect(() => {
    if (!family.token || !family.me || isPrivate) return;
    const now = Date.now();
    if (now < busyUntil.current) return;
    const s = sent.current;
    const patch: FamilyPatch = {};

    if (area && (area.name !== s.area || now - s.areaAt > AREA_HEARTBEAT_MS)) patch.area = area;
    const tripTo = trip?.to ?? null;
    if (tripTo !== s.trip) {
      patch.trip = trip; // started, changed or ended (ending clears the car too)
    } else if (trip && (Math.abs(trip.eta - s.eta) >= ETA_CHANGE_S || now - s.tripAt > TRIP_EVERY_MS)) {
      patch.trip = trip;
    }
    if (live && now - s.liveAt >= LIVE_EVERY_MS) patch.live = live;
    else if (!live && s.live && patch.trip === undefined) patch.live = null;
    if (Object.keys(patch).length === 0) return;

    busyUntil.current = now + RETRY_MS;
    family
      .update(patch)
      .then(() => {
        const next = { ...sent.current };
        if (patch.area) Object.assign(next, { area: patch.area.name, areaAt: now });
        if (patch.trip !== undefined) Object.assign(next, { trip: tripTo, eta: trip?.eta ?? 0, tripAt: now });
        if (patch.live) Object.assign(next, { live: true, liveAt: now });
        if (patch.live === null || patch.trip === null) Object.assign(next, { live: false, liveAt: 0 });
        sent.current = next;
        busyUntil.current = 0;
      })
      .catch(() => {
        // No signal: keep what we had and try again after RETRY_MS.
      });
  }, [family, isPrivate, area, trip, live]);
}
