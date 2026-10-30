import type { MultiPolygon, Polygon } from 'geojson';
import type { ExpressionSpecification, FilterSpecification, StyleSpecification } from 'maplibre-gl';
import type { Theme } from '../hooks/useTheme';
import type { PlaceGroup } from './places';

/*
 * OTW's own map style, drawn from OpenFreeMap's free OpenStreetMap tiles.
 * Colours match the design canvas: calm sage land, white roads and gold
 * highways by day; dark green-grey with clearly visible roads by night.
 */

interface Palette {
  land: string;
  residential: string;
  park: string;
  water: string;
  waterLabel: string;
  building: string;
  casing: string;
  minor: string;
  service: string;
  street: string;
  major: string;
  majorCasing: string;
  motorway: string;
  motorwayCasing: string;
  path: string;
  rail: string;
  roadText: string;
  placeText: string;
  poiText: string;
  halo: string;
}

const PALETTES: Record<Theme, Palette> = {
  light: {
    land: '#ECEEE7',
    residential: '#E7EAE2',
    park: '#D3E5CC',
    water: '#BCD7E6',
    waterLabel: '#4E7A92',
    building: '#DFE2D9',
    casing: '#CDD2C6',
    minor: '#FFFFFF',
    service: '#FAFBF8',
    street: '#FFFFFF',
    major: '#FFFFFF',
    majorCasing: '#BFC6BA',
    motorway: '#F6E3A6',
    motorwayCasing: '#DCC27A',
    path: '#D6DBD1',
    rail: '#B9C0B6',
    roadText: '#4A5550',
    placeText: '#2A3531',
    poiText: '#5B6763',
    halo: '#FFFFFF',
  },
  dark: {
    land: '#1B2220',
    residential: '#1E2624',
    park: '#1E3A2C',
    water: '#173A4A',
    waterLabel: '#7FB0C8',
    building: '#26302D',
    casing: '#0E1311',
    minor: '#4A5651',
    service: '#3C4843',
    street: '#5E6C67',
    major: '#7C8A85',
    majorCasing: '#0B0F0E',
    motorway: '#B8954A',
    motorwayCasing: '#2A2214',
    path: '#36423E',
    rail: '#3E4A46',
    roadText: '#C3CCC8',
    placeText: '#E8EEEB',
    poiText: '#9AA7A2',
    halo: '#1B2220',
  },
};

/** Text colour of our own place labels (places.ts) by kind, so a surau or petrol station stands out. */
export const PLACE_COLORS: Record<Theme, Record<PlaceGroup | 'mine', string>> = {
  light: {
    surau: '#0A6B5C',
    food: '#A4501C',
    fuel: '#2563A8',
    parking: '#2563A8',
    shop: '#7445A8',
    area: '#5B6763',
    street: '#5B6763',
    '': '#5B6763',
    mine: '#15201D',
  },
  dark: {
    surau: '#5FD0BC',
    food: '#F0A36B',
    fuel: '#7FB2EA',
    parking: '#7FB2EA',
    shop: '#C3A2EE',
    area: '#9AA7A2',
    street: '#9AA7A2',
    '': '#9AA7A2',
    mine: '#FFFFFF',
  },
};

export function labelHalo(theme: Theme): string {
  return PALETTES[theme].halo;
}

export const POI_LABEL_LAYER = 'poi-label';

/** OpenFreeMap's own shop/place labels; hidden inside `ownArea`, where our fuller list draws its own. */
export function poiLabelFilter(ownArea?: Polygon | MultiPolygon): FilterSpecification {
  const rank: FilterSpecification = ['<=', ['get', 'rank'], 12];
  return ownArea ? ['all', rank, ['!', ['within', ownArea]]] : rank;
}

const FONT_REGULAR = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];
const NAME: ExpressionSpecification = ['coalesce', ['get', 'name:latin'], ['get', 'name']];

type Stops = [zoom: number, width: number][];
function width(stops: Stops): ExpressionSpecification {
  return ['interpolate', ['exponential', 1.5], ['zoom'], ...stops.flat()];
}

const isClass = (...classes: string[]): ExpressionSpecification => [
  'match',
  ['get', 'class'],
  classes,
  true,
  false,
];
const notTunnel: ExpressionSpecification = ['!=', ['get', 'brunnel'], 'tunnel'];
const isBridge: ExpressionSpecification = ['==', ['get', 'brunnel'], 'bridge'];
const notBridgeOrTunnel: ExpressionSpecification = ['!', ['match', ['get', 'brunnel'], ['bridge', 'tunnel'], true, false]];

/** Road groups from smallest to biggest, so big roads draw on top. */
const ROADS: {
  id: string;
  classes: string[];
  minzoom: number;
  fill: Stops;
  casing: Stops;
  color: (p: Palette) => string;
  casingColor: (p: Palette) => string;
}[] = [
  {
    id: 'service',
    classes: ['service', 'track'],
    minzoom: 14,
    fill: [[14, 0.5], [16, 2.5], [18, 9]],
    casing: [[14, 1], [16, 3.8], [18, 11.5]],
    color: (p) => p.service,
    casingColor: (p) => p.casing,
  },
  {
    id: 'minor',
    classes: ['minor'],
    minzoom: 12,
    fill: [[12, 0.4], [14, 1.6], [16, 4.5], [18, 13]],
    casing: [[12, 0.8], [14, 2.6], [16, 6], [18, 16]],
    color: (p) => p.minor,
    casingColor: (p) => p.casing,
  },
  {
    id: 'secondary',
    classes: ['secondary', 'tertiary'],
    minzoom: 10,
    fill: [[10, 0.6], [13, 2], [15, 5.5], [18, 17]],
    casing: [[10, 1], [13, 3], [15, 7.5], [18, 20.5]],
    color: (p) => p.street,
    casingColor: (p) => p.casing,
  },
  {
    id: 'primary',
    classes: ['primary', 'trunk'],
    minzoom: 7,
    fill: [[7, 0.6], [10, 1.6], [13, 3.4], [15, 7.5], [18, 20]],
    casing: [[7, 1], [10, 2.4], [13, 4.8], [15, 9.5], [18, 24]],
    color: (p) => p.major,
    casingColor: (p) => p.majorCasing,
  },
  {
    id: 'motorway',
    classes: ['motorway'],
    minzoom: 5,
    fill: [[5, 0.5], [9, 1.6], [12, 3.4], [15, 8], [18, 22]],
    casing: [[5, 0.9], [9, 2.4], [12, 4.8], [15, 10], [18, 26]],
    color: (p) => p.motorway,
    casingColor: (p) => p.motorwayCasing,
  },
];

/** Layer id of the 3D buildings, hidden unless driving. */
export const BUILDINGS_3D = 'building-3d';

export function buildMapStyle(theme: Theme): StyleSpecification {
  const p = PALETTES[theme];

  const roadLayers = (suffix: string, filter: ExpressionSpecification, opacity = 1) =>
    [
      ...ROADS.map((r) => ({
        id: `road-${r.id}-casing${suffix}`,
        type: 'line' as const,
        source: 'omt',
        'source-layer': 'transportation',
        minzoom: r.minzoom,
        filter: ['all', isClass(...r.classes), filter] as ExpressionSpecification,
        layout: { 'line-join': 'round' as const, 'line-cap': 'round' as const },
        paint: { 'line-color': r.casingColor(p), 'line-width': width(r.casing), 'line-opacity': opacity },
      })),
      ...ROADS.map((r) => ({
        id: `road-${r.id}${suffix}`,
        type: 'line' as const,
        source: 'omt',
        'source-layer': 'transportation',
        minzoom: r.minzoom,
        filter: ['all', isClass(...r.classes), filter] as ExpressionSpecification,
        layout: { 'line-join': 'round' as const, 'line-cap': 'round' as const },
        paint: { 'line-color': r.color(p), 'line-width': width(r.fill), 'line-opacity': opacity },
      })),
    ];

  return {
    version: 8,
    name: `OTW ${theme}`,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      omt: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
        attribution:
          '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': p.land } },
      {
        id: 'residential',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landuse',
        filter: isClass('residential', 'suburb', 'neighbourhood'),
        paint: { 'fill-color': p.residential },
      },
      {
        id: 'greenery',
        type: 'fill',
        source: 'omt',
        'source-layer': 'landcover',
        filter: isClass('grass', 'wood', 'farmland', 'wetland'),
        paint: { 'fill-color': p.park, 'fill-opacity': 0.7 },
      },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': p.park } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': p.water } },
      {
        id: 'waterway',
        type: 'line',
        source: 'omt',
        'source-layer': 'waterway',
        paint: { 'line-color': p.water, 'line-width': width([[10, 0.5], [14, 1.5], [18, 5]]) },
      },
      {
        id: 'runway',
        type: 'line',
        source: 'omt',
        'source-layer': 'aeroway',
        minzoom: 11,
        filter: isClass('runway', 'taxiway'),
        paint: { 'line-color': p.casing, 'line-width': width([[11, 2], [15, 18], [18, 60]]) },
      },
      {
        id: 'building',
        type: 'fill',
        source: 'omt',
        'source-layer': 'building',
        minzoom: 14,
        paint: { 'fill-color': p.building, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 1] },
      },
      ...roadLayers('-tunnel', ['==', ['get', 'brunnel'], 'tunnel'], 0.45),
      {
        id: 'path',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        minzoom: 15,
        filter: ['all', isClass('path'), notTunnel],
        paint: { 'line-color': p.path, 'line-width': width([[15, 0.8], [18, 2.5]]), 'line-dasharray': [2, 1.5] },
      },
      {
        id: 'rail',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        minzoom: 12,
        filter: ['all', isClass('rail', 'transit'), notTunnel],
        paint: { 'line-color': p.rail, 'line-width': width([[12, 0.8], [18, 3]]) },
      },
      ...roadLayers('', notBridgeOrTunnel),
      ...roadLayers('-bridge', isBridge),
      {
        // Raised buildings for the tilted driving view (switched on by MapView).
        // Most buildings in Sabah have no height in OpenStreetMap, so they get a
        // low 5 m; they rise as you zoom in so they don't pop up all at once.
        id: BUILDINGS_3D,
        type: 'fill-extrusion',
        source: 'omt',
        'source-layer': 'building',
        minzoom: 15,
        layout: { visibility: 'none' },
        paint: {
          'fill-extrusion-color': p.building,
          'fill-extrusion-opacity': 0.85,
          'fill-extrusion-height': [
            'interpolate',
            ['linear'],
            ['zoom'],
            15,
            0,
            16,
            ['coalesce', ['get', 'render_height'], 5],
          ],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        },
      },
      {
        id: 'water-label',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'water_name',
        layout: { 'text-field': NAME, 'text-font': ['Noto Sans Italic'], 'text-size': 12 },
        paint: { 'text-color': p.waterLabel, 'text-halo-color': p.halo, 'text-halo-width': 1.2 },
      },
      {
        id: 'road-label',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'transportation_name',
        minzoom: 13,
        filter: ['!', isClass('path', 'track', 'rail', 'transit', 'ferry')],
        layout: {
          'symbol-placement': 'line',
          'text-field': NAME,
          'text-font': FONT_REGULAR,
          'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 17, 13],
          'text-max-angle': 30,
          'symbol-spacing': 320,
        },
        paint: { 'text-color': p.roadText, 'text-halo-color': p.halo, 'text-halo-width': 1.6 },
      },
      {
        id: POI_LABEL_LAYER,
        type: 'symbol',
        source: 'omt',
        'source-layer': 'poi',
        minzoom: 15,
        filter: poiLabelFilter(),
        layout: {
          'text-field': NAME,
          'text-font': FONT_REGULAR,
          'text-size': 11,
          'text-max-width': 8,
          'text-padding': 4,
        },
        paint: { 'text-color': p.poiText, 'text-halo-color': p.halo, 'text-halo-width': 1.4 },
      },
      {
        id: 'place-small',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        minzoom: 11,
        filter: isClass('suburb', 'quarter', 'neighbourhood', 'hamlet'),
        layout: {
          'text-field': NAME,
          'text-font': FONT_BOLD,
          'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 15, 13],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.06,
          'text-max-width': 8,
        },
        paint: { 'text-color': p.poiText, 'text-halo-color': p.halo, 'text-halo-width': 1.4 },
      },
      {
        id: 'place-town',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        minzoom: 8,
        filter: isClass('town', 'village'),
        layout: {
          'text-field': NAME,
          'text-font': FONT_BOLD,
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 14, 16],
          'text-max-width': 8,
        },
        paint: { 'text-color': p.placeText, 'text-halo-color': p.halo, 'text-halo-width': 1.6 },
      },
      {
        id: 'place-city',
        type: 'symbol',
        source: 'omt',
        'source-layer': 'place',
        minzoom: 4,
        filter: isClass('city', 'state'),
        layout: {
          'text-field': NAME,
          'text-font': FONT_BOLD,
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 12, 20],
          'text-max-width': 8,
        },
        paint: { 'text-color': p.placeText, 'text-halo-color': p.halo, 'text-halo-width': 2 },
      },
    ],
  };
}
