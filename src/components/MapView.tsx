import { useEffect, useRef, type MutableRefObject } from 'react';
import type { FeatureCollection, Point } from 'geojson';
import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  setWorkerUrl,
  type ExpressionSpecification,
  type GeoJSONSource,
  type LngLatLike,
  type MapLayerMouseEvent,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

// MapLibre 6 loads its tile worker from a separate file; point it at the copy Vite serves.
setWorkerUrl(workerUrl);
import type { Place, Route } from '../lib/api';
import type { LngLat } from '../lib/geo';
import { BUILDINGS_3D, buildMapStyle, labelHalo, PLACE_COLORS, POI_LABEL_LAYER, poiLabelFilter } from '../lib/mapStyle';
import { HAZARDS, myPlaceToPlace, type HazardReport, type MyPlace } from '../lib/models';
import { mapFeatures, toPlace, type PlacesIndex } from '../lib/places';
import type { Theme } from '../hooks/useTheme';

const ROUTE_COLORS: Record<Theme, { route: string; casing: string; alt: string }> = {
  light: { route: '#0E7C6B', casing: '#FFFFFF', alt: '#8E9A96' },
  dark: { route: '#34D1B2', casing: '#08100D', alt: '#7E8C87' },
};

/** Kota Kinabalu, shown for the moment before the phone's location comes in. */
export const DEFAULT_CENTER: LngLat = [116.0762, 5.9836];

const SOURCE = 'otw-routes';
const CASING_LAYER = 'otw-route-casing';
const LINE_LAYER = 'otw-route-line';

const PLACES_SOURCE = 'otw-places';
const MINE_SOURCE = 'otw-my-places';
/** Surau, petrol, parking and food: shown a little further out than the rest. */
const PLACE_KEY_LAYER = 'otw-places-key';
const PLACE_MORE_LAYER = 'otw-places-more';
const MINE_DOT_LAYER = 'otw-my-places-dot';
const MINE_LABEL_LAYER = 'otw-my-places-label';
const PLACE_LAYERS = [PLACE_KEY_LAYER, PLACE_MORE_LAYER, MINE_DOT_LAYER, MINE_LABEL_LAYER];
const KEY_GROUPS = ['surau', 'fuel', 'parking', 'food'];

/** browse: home map · preview: route choice · nav: driving · pick: placing a missing place under the pin. */
export type MapMode = 'browse' | 'preview' | 'nav' | 'pick';

/** Family on the map: a dashed circle for an area, or a moving car during a live trip. */
export interface FamilyPin {
  id: string;
  kind: 'area' | 'car';
  coord: LngLat;
  /** e.g. "Mak · Likas" or "Ayah · ETA 6:21 PM". */
  label: string;
  people: { initials: string; color: string }[];
  heading?: number | null;
}

interface Props {
  theme: Theme;
  mode: MapMode;
  position: LngLat | null;
  heading: number | null;
  routes: Route[] | null;
  selectedRoute: number;
  destination: LngLat | null;
  /** A stop on the way to the destination. */
  stop: LngLat | null;
  reports: HazardReport[];
  family: FamilyPin[];
  /** Fly to this spot when key changes, e.g. after tapping someone in Family. */
  focus: { coord: LngLat; key: number } | null;
  /** While driving: zoom out to show these points (the rest of the route) when key changes. */
  overview: { coords: LngLat[]; key: number } | null;
  /** Space covered by the UI at the top and bottom, so the map centres in what's visible. */
  insets: { top: number; bottom: number };
  /** Bump to fly back to the user. */
  recenterKey: number;
  /** While navigating: keep the camera on the car. Off after the user drags the map. */
  follow: boolean;
  onSelectRoute: (index: number) => void;
  /** The user dragged, zoomed or turned the map with their fingers. */
  onUserMove: () => void;
  /** Press and hold (or right-click) on the browse map. */
  onLongPress: (coord: LngLat) => void;
  /** Sabah's place list, drawn as labels once it has loaded. */
  places: PlacesIndex | null;
  myPlaces: MyPlace[];
  /** A place label was tapped on the browse map. */
  onPickPlace: (place: Place) => void;
  /** Where the pin starts in pick mode. */
  pickStart: LngLat | null;
  /** Set by the map in pick mode: returns the spot under the pin. */
  pickRef: MutableRefObject<(() => LngLat | null) | null>;
}

const LONG_PRESS_MS = 550;
/** A finger that wanders further than this is panning, not holding. */
const LONG_PRESS_SLOP_PX = 10;

function routeData(routes: Route[] | null, selected: number, mode: MapMode): FeatureCollection {
  const list = routes ?? [];
  return {
    type: 'FeatureCollection',
    features: list
      .map((r, i) => ({ r, i }))
      .filter(({ i }) => mode !== 'nav' || i === selected)
      .map(({ r, i }) => ({
        type: 'Feature',
        properties: { index: i, selected: i === selected },
        geometry: { type: 'LineString', coordinates: r.coords },
      })),
  };
}

function addRouteLayers(map: MapLibreMap, theme: Theme) {
  if (map.getSource(SOURCE)) return;
  const c = ROUTE_COLORS[theme];
  // Draw above every road (bridges included) but under the place and street names.
  const layers = map.getStyle().layers ?? [];
  const lastRoad = layers.reduce((last, l, i) => (l.type === 'line' ? i : last), -1);
  const firstLabel = layers.slice(lastRoad + 1).find((l) => l.type === 'symbol')?.id;
  map.addSource(SOURCE, {
    type: 'geojson',
    data: routeData(null, 0, 'browse'),
    // The FOSSGIS route server asks for this credit, a "fix the map" link and a contact email.
    attribution:
      'Routes <a href="https://valhalla1.openstreetmap.de" target="_blank">FOSSGIS Valhalla</a>, <a href="https://project-osrm.org" target="_blank">OSRM</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank">Fix the map</a> · Contact <a href="mailto:otwapp.malaysia@gmail.com">otwapp.malaysia@gmail.com</a>',
  });
  map.addLayer(
    {
      id: CASING_LAYER,
      type: 'line',
      source: SOURCE,
      layout: { 'line-join': 'round', 'line-cap': 'round', 'line-sort-key': ['case', ['get', 'selected'], 1, 0] },
      paint: {
        'line-color': c.casing,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 8, 16, 17],
      },
    },
    firstLabel,
  );
  map.addLayer(
    {
      id: LINE_LAYER,
      type: 'line',
      source: SOURCE,
      layout: { 'line-join': 'round', 'line-cap': 'round', 'line-sort-key': ['case', ['get', 'selected'], 1, 0] },
      paint: {
        'line-color': ['case', ['get', 'selected'], c.route, c.alt],
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 16, 11],
      },
    },
    firstLabel,
  );
}

const SIGNALS_SOURCE = 'otw-signals';
const SIGNALS_LAYER = 'otw-signals';
const SIGNAL_ICON = 'otw-traffic-light';
/** Traffic-light junctions (mapped spots only, no live colour), from scripts/sabah-signals.mjs. */
const SIGNALS_URL = '/map/sabah-signals.json';
let signalsData: Promise<FeatureCollection> | null = null;

function loadSignals(): Promise<FeatureCollection> {
  signalsData ??= fetch(SIGNALS_URL)
    .then((r) => (r.ok ? r.json() : { points: [] }))
    .then((d: { points: LngLat[] }) => ({
      type: 'FeatureCollection' as const,
      features: d.points.map((coordinates) => ({
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'Point' as const, coordinates },
      })),
    }))
    .catch(() => {
      signalsData = null; // try again next time
      return { type: 'FeatureCollection' as const, features: [] };
    });
  return signalsData;
}

/** A small grey traffic light: a dark rounded box with three unlit lamps. */
function signalIcon(): ImageData {
  const scale = 2;
  const [w, h] = [14, 26];
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.fillStyle = '#26302D';
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if ('roundRect' in ctx) ctx.roundRect(1, 1, w - 2, h - 2, 4);
  else (ctx as CanvasRenderingContext2D).rect(1, 1, w - 2, h - 2); // older iPhones
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#B9C4BF';
  for (const y of [6.5, 13, 19.5]) {
    ctx.beginPath();
    ctx.arc(w / 2, y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** Traffic lights, shown from street level zoom; drawn above the route, under the names. */
function addSignalLayer(map: MapLibreMap) {
  if (map.getSource(SIGNALS_SOURCE)) return;
  if (!map.hasImage(SIGNAL_ICON)) map.addImage(SIGNAL_ICON, signalIcon(), { pixelRatio: 2 });
  map.addSource(SIGNALS_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  const firstLabel = (map.getStyle().layers ?? []).find((l) => l.type === 'symbol')?.id;
  map.addLayer(
    {
      id: SIGNALS_LAYER,
      type: 'symbol',
      source: SIGNALS_SOURCE,
      minzoom: 14.5,
      layout: { 'icon-image': SIGNAL_ICON, 'icon-size': ['interpolate', ['linear'], ['zoom'], 14.5, 0.7, 17, 1] },
    },
    firstLabel,
  );
  void loadSignals().then((data) => (map.getSource(SIGNALS_SOURCE) as GeoJSONSource | undefined)?.setData(data));
}

/** Raised 3D buildings only in the tilted driving view; flat everywhere else. */
function show3dBuildings(map: MapLibreMap, mode: MapMode) {
  if (map.getLayer(BUILDINGS_3D)) map.setLayoutProperty(BUILDINGS_3D, 'visibility', mode === 'nav' ? 'visible' : 'none');
}

function myPlacesData(list: MyPlace[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: list.map((p) => ({
      type: 'Feature',
      properties: { id: p.id, name: p.name },
      geometry: { type: 'Point', coordinates: p.coord },
    })),
  };
}

/** Our own place labels: Sabah's list (once loaded) and the places the user added. */
function addPlaceLayers(map: MapLibreMap, theme: Theme, places: PlacesIndex | null, mine: MyPlace[]) {
  const c = PLACE_COLORS[theme];
  const halo = labelHalo(theme);
  if (!map.getSource(MINE_SOURCE)) {
    map.addSource(MINE_SOURCE, { type: 'geojson', data: myPlacesData(mine) });
    map.addLayer({
      id: MINE_DOT_LAYER,
      type: 'circle',
      source: MINE_SOURCE,
      paint: { 'circle-radius': 6, 'circle-color': '#0E7C6B', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2 },
    });
    map.addLayer({
      id: MINE_LABEL_LAYER,
      type: 'symbol',
      source: MINE_SOURCE,
      minzoom: 12,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 12.5,
        'text-anchor': 'top',
        'text-offset': [0, 0.8],
        'text-max-width': 9,
      },
      paint: { 'text-color': c.mine, 'text-halo-color': halo, 'text-halo-width': 1.6 },
    });
  }
  if (!places || map.getSource(PLACES_SOURCE)) return;
  const color: ExpressionSpecification = [
    'match',
    ['get', 'group'],
    'surau', c.surau,
    'food', c.food,
    'fuel', c.fuel,
    'parking', c.parking,
    'shop', c.shop,
    c[''],
  ];
  // Labels only (like the base map's), drawn under the user's own places.
  map.addSource(PLACES_SOURCE, { type: 'geojson', data: mapFeatures(places), attribution: places.file.credit, maxzoom: 16 });
  const label = (id: string, minzoom: number, keyGroups: boolean, font: string, size: number) =>
    map.addLayer(
      {
        id,
        type: 'symbol',
        source: PLACES_SOURCE,
        minzoom,
        filter: ['match', ['get', 'group'], KEY_GROUPS, keyGroups, !keyGroups],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': [font],
          'text-size': size,
          'text-max-width': 8,
          'text-padding': 3,
          // Lower index = Overture is more sure the place is real; those win when labels overlap.
          'symbol-sort-key': ['get', 'i'],
        },
        paint: { 'text-color': color, 'text-halo-color': halo, 'text-halo-width': 1.4 },
      },
      MINE_DOT_LAYER,
    );
  label(PLACE_KEY_LAYER, 14.5, true, 'Noto Sans Bold', 11.5);
  label(PLACE_MORE_LAYER, 16, false, 'Noto Sans Regular', 11);
  // Inside Sabah our list replaces the base map's shop and place labels (no doubles).
  map.setFilter(POI_LABEL_LAYER, poiLabelFilter(places.file.border));
}

/**
 * "You are here". On the map: a dot with a beam showing which way the phone
 * points. While navigating: a big arrow puck that stays upright on screen.
 */
function makeUserMarker(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'user-marker';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'Your location');
  el.innerHTML =
    '<span class="user-beam"></span><span class="user-halo"></span><span class="user-dot"></span>' +
    '<span class="user-puck"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l7.6 18.4-7.6-4.3-7.6 4.3z"/></svg></span>';
  return el;
}

function makeReportMarker(report: HazardReport): HTMLElement {
  const el = document.createElement('div');
  el.className = 'report-marker';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', `${HAZARDS.find((h) => h.type === report.type)?.label ?? 'Hazard'} reported here`);
  el.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5"/><path d="M12 18v.5"/></svg>';
  return el;
}

function makeDestinationMarker(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'dest-marker';
  el.innerHTML =
    '<svg viewBox="0 0 34 40" aria-hidden="true"><path d="M17 39s-15-13-15-23a15 15 0 0 1 30 0c0 10-15 23-15 23z"/><circle cx="17" cy="16" r="5.5"/></svg>';
  return el;
}

/** Built with text nodes, never innerHTML, because names are typed by family. */
function fillFamilyMarker(el: HTMLElement, pin: FamilyPin) {
  el.className = `family-marker is-${pin.kind}`;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', pin.label);
  el.replaceChildren();
  const spot = document.createElement('span');
  spot.className = 'family-spot';
  spot.style.setProperty('--c', pin.people[0]?.color ?? '#0e7c6b');
  if (pin.kind === 'car') {
    const arrow = document.createElement('span');
    arrow.className = 'family-arrow';
    arrow.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l7.6 18.4-7.6-4.3-7.6 4.3z"/></svg>';
    arrow.style.transform = `rotate(${pin.heading ?? 0}deg)`;
    spot.append(arrow);
  } else {
    for (const person of pin.people.slice(0, 3)) {
      const face = document.createElement('span');
      face.className = 'family-face';
      face.style.background = person.color;
      face.textContent = person.initials;
      spot.append(face);
    }
  }
  const label = document.createElement('span');
  label.className = 'family-label';
  label.textContent = pin.label;
  el.append(spot, label);
}

function makeStopMarker(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'stop-marker';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'Stop on the way');
  return el;
}

export default function MapView(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const pickPin = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const userMarker = useRef<Marker | null>(null);
  const destMarker = useRef<Marker | null>(null);
  const stopMarker = useRef<Marker | null>(null);
  const reportMarkers = useRef(new Map<string, Marker>());
  const familyMarkers = useRef(new Map<string, { marker: Marker; look: string }>());
  const latest = useRef(props);
  latest.current = props;
  const centredOnUser = useRef(false);
  const shownTheme = useRef(props.theme);

  // Create the map once.
  useEffect(() => {
    const map = new MapLibreMap({
      container: container.current!,
      style: buildMapStyle(latest.current.theme),
      center: DEFAULT_CENTER,
      zoom: 11,
      attributionControl: false,
    });
    map.addControl(new AttributionControl({ compact: true }), 'bottom-left');
    // Start the map credit folded behind its ⓘ button so it doesn't cover the controls.
    map.once('load', () => {
      container.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
    });
    map.on('style.load', () => {
      const p = latest.current;
      addRouteLayers(map, shownTheme.current);
      (map.getSource(SOURCE) as GeoJSONSource).setData(routeData(p.routes, p.selectedRoute, p.mode));
      addSignalLayer(map);
      show3dBuildings(map, p.mode);
      addPlaceLayers(map, shownTheme.current, p.places, p.myPlaces);
      showPlaceLabels(map, p.mode !== 'nav');
    });
    // Tap a place label to get directions there.
    const onPlaceTap = (e: MapLayerMouseEvent) => {
      const p = latest.current;
      const tapped = e.features?.[0]?.properties;
      if (p.mode !== 'browse' || !tapped) return;
      if (typeof tapped.i === 'number' && p.places) {
        p.onPickPlace(toPlace(p.places, tapped.i));
      } else {
        const own = p.myPlaces.find((m) => m.id === tapped.id);
        if (own) p.onPickPlace(myPlaceToPlace(own));
      }
    };
    for (const id of PLACE_LAYERS) {
      map.on('click', id, onPlaceTap);
      map.on('mouseenter', id, () => {
        if (latest.current.mode === 'browse') map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', id, () => {
        map.getCanvas().style.cursor = '';
      });
    }
    map.on('click', LINE_LAYER, (e) => {
      const index = e.features?.[0]?.properties?.index;
      if (latest.current.mode === 'preview' && typeof index === 'number') latest.current.onSelectRoute(index);
    });
    map.on('mouseenter', LINE_LAYER, () => {
      if (latest.current.mode === 'preview') map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', LINE_LAYER, () => {
      map.getCanvas().style.cursor = '';
    });
    // Only finger/mouse gestures carry an originalEvent; our own camera moves don't.
    const onGesture = (e: { originalEvent?: Event }) => {
      if (e.originalEvent) latest.current.onUserMove();
    };
    map.on('dragstart', onGesture);
    map.on('zoomstart', onGesture);
    map.on('rotatestart', onGesture);
    map.on('pitchstart', onGesture);

    // Press and hold drops a pin. iPhones never send contextmenu for a held
    // finger, so time the touch ourselves; Android sends both, so the second
    // one inside a short window is ignored.
    let press: { timer: number; x: number; y: number } | null = null;
    let lastLongPress = 0;
    const cancelPress = () => {
      if (press) window.clearTimeout(press.timer);
      press = null;
    };
    const longPress = (at: { lng: number; lat: number }) => {
      cancelPress();
      const now = Date.now();
      if (latest.current.mode !== 'browse' || now - lastLongPress < 1000) return;
      lastLongPress = now;
      latest.current.onLongPress([at.lng, at.lat]);
    };
    map.on('touchstart', (e) => {
      cancelPress();
      if (e.originalEvent.touches.length !== 1 || latest.current.mode !== 'browse') return;
      const at = e.lngLat;
      press = { x: e.point.x, y: e.point.y, timer: window.setTimeout(() => longPress(at), LONG_PRESS_MS) };
    });
    map.on('touchmove', (e) => {
      if (!press) return;
      const moved = Math.hypot(e.point.x - press.x, e.point.y - press.y);
      if (e.originalEvent.touches.length !== 1 || moved > LONG_PRESS_SLOP_PX) cancelPress();
    });
    map.on('touchend', cancelPress);
    map.on('touchcancel', cancelPress);
    map.on('dragstart', cancelPress);
    map.on('contextmenu', (e) => {
      e.originalEvent.preventDefault();
      longPress(e.lngLat);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      userMarker.current = null;
      destMarker.current = null;
      stopMarker.current = null;
      reportMarkers.current.clear();
      familyMarkers.current.clear();
    };
  }, []);

  // Swap the map style for light/dark.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || shownTheme.current === props.theme) return;
    shownTheme.current = props.theme;
    map.setStyle(buildMapStyle(props.theme));
  }, [props.theme]);

  // 3D buildings on when driving starts, off after (style.load covers a style still loading).
  useEffect(() => {
    if (mapRef.current) show3dBuildings(mapRef.current, props.mode);
  }, [props.mode]);

  // Route lines.
  useEffect(() => {
    const source = mapRef.current?.getSource(SOURCE) as GeoJSONSource | undefined;
    source?.setData(routeData(props.routes, props.selectedRoute, props.mode));
  }, [props.routes, props.selectedRoute, props.mode]);

  // Sabah's place labels, once the list has loaded (the style may still be loading: then style.load adds them).
  useEffect(() => {
    const map = mapRef.current;
    if (map?.getSource(SOURCE)) addPlaceLayers(map, shownTheme.current, props.places, latest.current.myPlaces);
  }, [props.places]);

  useEffect(() => {
    const source = mapRef.current?.getSource(MINE_SOURCE) as GeoJSONSource | undefined;
    source?.setData(myPlacesData(props.myPlaces));
  }, [props.myPlaces]);

  // While driving, only the road matters: hide shop and place labels.
  useEffect(() => {
    const map = mapRef.current;
    if (map?.getSource(SOURCE)) showPlaceLabels(map, props.mode !== 'nav');
  }, [props.mode]);

  // Pick mode: the pin stays in the middle of the visible map and the map moves under it.
  props.pickRef.current = () => {
    const map = mapRef.current;
    const pin = pickPin.current?.getBoundingClientRect();
    const box = container.current?.getBoundingClientRect();
    if (!map || !pin || !box) return null;
    const at = map.unproject([pin.left + pin.width / 2 - box.left, pin.bottom - box.top]);
    return [at.lng, at.lat];
  };
  useEffect(() => {
    const map = mapRef.current;
    if (!map || props.mode !== 'pick') return;
    // Wait two frames so the sheet has its real height and the pin its final spot.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const pin = pickPin.current?.getBoundingClientRect();
        const box = container.current?.getBoundingClientRect();
        if (!pin || !box) return;
        map.flyTo({
          center: latest.current.pickStart ?? map.getCenter(),
          zoom: Math.max(map.getZoom(), 17.5),
          offset: [0, pin.bottom - box.top - box.height / 2],
          pitch: 0,
          bearing: 0,
          duration: 700,
        });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [props.mode]);

  // The user's dot (or arrow while navigating).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!props.position) {
      userMarker.current?.remove();
      userMarker.current = null;
      return;
    }
    if (!userMarker.current) {
      userMarker.current = new Marker({
        element: makeUserMarker(),
        rotationAlignment: 'map',
        // Stays upright facing the viewer even when the map is tilted in 3D.
        pitchAlignment: 'viewport',
      })
        .setLngLat(props.position)
        .addTo(map);
    }
    const marker = userMarker.current;
    marker.setLngLat(props.position);
    const el = marker.getElement();
    el.classList.toggle('is-nav', props.mode === 'nav');
    el.classList.toggle('has-heading', props.heading != null);
    marker.setRotation(props.heading ?? 0);

    if (!centredOnUser.current && props.mode === 'browse') {
      centredOnUser.current = true;
      map.flyTo({ center: props.position, zoom: 15, duration: 1200 });
    }
  }, [props.position, props.heading, props.mode]);

  // Destination pin.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!props.destination) {
      destMarker.current?.remove();
      destMarker.current = null;
      return;
    }
    if (!destMarker.current) {
      destMarker.current = new Marker({ element: makeDestinationMarker(), anchor: 'bottom' });
    }
    destMarker.current.setLngLat(props.destination).addTo(map);
  }, [props.destination]);

  // Stop on the way.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!props.stop) {
      stopMarker.current?.remove();
      stopMarker.current = null;
      return;
    }
    if (!stopMarker.current) stopMarker.current = new Marker({ element: makeStopMarker() });
    stopMarker.current.setLngLat(props.stop).addTo(map);
  }, [props.stop]);

  // Hazard report pins.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const live = new Set(props.reports.map((r) => r.id));
    for (const [id, marker] of reportMarkers.current) {
      if (!live.has(id)) {
        marker.remove();
        reportMarkers.current.delete(id);
      }
    }
    for (const r of props.reports) {
      if (!reportMarkers.current.has(r.id)) {
        reportMarkers.current.set(r.id, new Marker({ element: makeReportMarker(r) }).setLngLat(r.coord).addTo(map));
      }
    }
  }, [props.reports]);

  // Family areas and live cars.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const shown = familyMarkers.current;
    const ids = new Set(props.family.map((p) => p.id));
    for (const [id, { marker }] of shown) {
      if (!ids.has(id)) {
        marker.remove();
        shown.delete(id);
      }
    }
    for (const pin of props.family) {
      const look = JSON.stringify([pin.kind, pin.label, pin.people, pin.heading]);
      let entry = shown.get(pin.id);
      if (!entry) {
        const el = document.createElement('div');
        fillFamilyMarker(el, pin);
        entry = { marker: new Marker({ element: el }).setLngLat(pin.coord).addTo(map), look };
        shown.set(pin.id, entry);
      } else if (entry.look !== look) {
        fillFamilyMarker(entry.marker.getElement(), pin);
        entry.look = look;
      }
      entry.marker.setLngLat(pin.coord);
    }
  }, [props.family]);

  // Fly to someone in the family. Only a new key means a new tap.
  useEffect(() => {
    const map = mapRef.current;
    const focus = latest.current.focus;
    if (!map || !focus) return;
    map.flyTo({ center: focus.coord, zoom: 14, duration: 900 });
  }, [props.focus?.key]);

  // Camera for the route preview: show every route.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || props.mode !== 'preview' || !props.routes?.length) return;
    const bounds = new LngLatBounds();
    props.routes.forEach((r) => r.coords.forEach((c) => bounds.extend(c as LngLatLike)));
    map.fitBounds(bounds, {
      padding: { top: props.insets.top + 24, bottom: props.insets.bottom + 24, left: 40, right: 40 },
      maxZoom: 16,
      pitch: 0,
      bearing: 0,
      duration: 900,
    });
  }, [props.mode, props.routes, props.insets.top, props.insets.bottom]);

  // "Whole route" while driving: what's left of it, flat and north up.
  useEffect(() => {
    const map = mapRef.current;
    const overview = latest.current.overview;
    if (!map || !overview || overview.coords.length < 2) return;
    const bounds = new LngLatBounds();
    overview.coords.forEach((c) => bounds.extend(c as LngLatLike));
    map.fitBounds(bounds, {
      // The driving camera already set the map's padding to the UI insets; this comes on top.
      padding: { top: 24, bottom: 24, left: 40, right: 72 },
      maxZoom: 16,
      pitch: 0,
      bearing: 0,
      duration: 900,
    });
  }, [props.overview?.key]);

  // Camera while driving: follow and turn with the car, unless the user is looking around.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || props.mode !== 'nav' || !props.position || !props.follow) return;
    map.easeTo({
      center: props.position,
      zoom: 17,
      pitch: 55,
      bearing: props.heading ?? map.getBearing(),
      padding: { top: props.insets.top, bottom: props.insets.bottom, left: 0, right: 0 },
      // Short enough that turning the phone (compass) feels immediate.
      duration: 500,
      easing: (t) => t,
    });
  }, [props.mode, props.position, props.heading, props.follow, props.insets.top, props.insets.bottom]);

  // Back on the main map after a trip: flatten it and return to the user.
  const prevMode = useRef(props.mode);
  useEffect(() => {
    const map = mapRef.current;
    const was = prevMode.current;
    prevMode.current = props.mode;
    // After adding a place, stay where it was put.
    if (!map || props.mode !== 'browse' || was === 'browse' || was === 'pick') return;
    const p = latest.current.position;
    map.easeTo({
      center: p ?? (was === 'nav' ? DEFAULT_CENTER : map.getCenter()),
      zoom: p ? 15 : was === 'nav' ? 12 : map.getZoom(),
      pitch: 0,
      bearing: 0,
      padding: { top: 0, bottom: 0, left: 0, right: 0 },
      duration: 700,
    });
  }, [props.mode]);

  // "Centre on me" button.
  useEffect(() => {
    const map = mapRef.current;
    const p = latest.current.position;
    if (!map || props.recenterKey === 0) return;
    map.flyTo({ center: p ?? DEFAULT_CENTER, zoom: p ? 16 : 12, duration: 800 });
  }, [props.recenterKey]);

  return (
    <>
      <div ref={container} className="map" />
      {props.mode === 'pick' && (
        <div ref={pickPin} className="pick-pin" aria-hidden="true">
          <svg viewBox="0 0 34 40">
            <path d="M17 39s-15-13-15-23a15 15 0 0 1 30 0c0 10-15 23-15 23z" />
            <circle cx="17" cy="16" r="5.5" />
          </svg>
        </div>
      )}
    </>
  );
}

function showPlaceLabels(map: MapLibreMap, visible: boolean) {
  for (const id of PLACE_LAYERS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  }
}
