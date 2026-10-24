import { useEffect, useRef } from 'react';
import type { FeatureCollection } from 'geojson';
import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  setWorkerUrl,
  type GeoJSONSource,
  type LngLatLike,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';

// MapLibre 6 loads its tile worker from a separate file; point it at the copy Vite serves.
setWorkerUrl(workerUrl);
import type { Route } from '../lib/api';
import type { LngLat } from '../lib/geo';
import { buildMapStyle } from '../lib/mapStyle';
import { HAZARDS, type HazardReport } from '../lib/models';
import type { Theme } from '../hooks/useTheme';

const ROUTE_COLORS: Record<Theme, { route: string; casing: string; alt: string }> = {
  light: { route: '#0E7C6B', casing: '#FFFFFF', alt: '#8E9A96' },
  dark: { route: '#34D1B2', casing: '#08100D', alt: '#7E8C87' },
};

/** Kuala Lumpur, shown before we know where the user is. */
export const DEFAULT_CENTER: LngLat = [101.6869, 3.139];

const SOURCE = 'otw-routes';
const CASING_LAYER = 'otw-route-casing';
const LINE_LAYER = 'otw-route-line';

export type MapMode = 'browse' | 'preview' | 'nav';

interface Props {
  theme: Theme;
  mode: MapMode;
  position: LngLat | null;
  heading: number | null;
  routes: Route[] | null;
  selectedRoute: number;
  destination: LngLat | null;
  reports: HazardReport[];
  /** Space covered by the UI at the top and bottom, so the map centres in what's visible. */
  insets: { top: number; bottom: number };
  /** Bump to fly back to the user. */
  recenterKey: number;
  onSelectRoute: (index: number) => void;
}

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
  map.addSource(SOURCE, { type: 'geojson', data: routeData(null, 0, 'browse') });
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

function makeUserMarker(): HTMLElement {
  const el = document.createElement('div');
  el.className = 'user-marker';
  el.innerHTML =
    '<span class="user-halo"></span><span class="user-dot"></span>' +
    '<svg class="user-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l7 19-7-4-7 4z"/></svg>';
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

export default function MapView(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const userMarker = useRef<Marker | null>(null);
  const destMarker = useRef<Marker | null>(null);
  const reportMarkers = useRef(new Map<string, Marker>());
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
    });
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
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      userMarker.current = null;
      destMarker.current = null;
      reportMarkers.current.clear();
    };
  }, []);

  // Swap the map style for light/dark.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || shownTheme.current === props.theme) return;
    shownTheme.current = props.theme;
    map.setStyle(buildMapStyle(props.theme));
  }, [props.theme]);

  // Route lines.
  useEffect(() => {
    const source = mapRef.current?.getSource(SOURCE) as GeoJSONSource | undefined;
    source?.setData(routeData(props.routes, props.selectedRoute, props.mode));
  }, [props.routes, props.selectedRoute, props.mode]);

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
        pitchAlignment: 'map',
      })
        .setLngLat(props.position)
        .addTo(map);
    }
    const marker = userMarker.current;
    marker.setLngLat(props.position);
    marker.getElement().classList.toggle('is-nav', props.mode === 'nav');
    marker.setRotation(props.mode === 'nav' ? props.heading ?? 0 : 0);

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

  // Camera while driving: follow and turn with the car.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || props.mode !== 'nav' || !props.position) return;
    map.easeTo({
      center: props.position,
      zoom: 17,
      pitch: 55,
      bearing: props.heading ?? map.getBearing(),
      padding: { top: props.insets.top, bottom: props.insets.bottom, left: 0, right: 0 },
      duration: 900,
      easing: (t) => t,
    });
  }, [props.mode, props.position, props.heading, props.insets.top, props.insets.bottom]);

  // Back on the main map after a trip: flatten it and return to the user (or KL).
  const prevMode = useRef(props.mode);
  useEffect(() => {
    const map = mapRef.current;
    const was = prevMode.current;
    prevMode.current = props.mode;
    if (!map || props.mode !== 'browse' || was === 'browse') return;
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

  return <div ref={container} className="map" />;
}
