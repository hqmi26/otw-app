import type { ExpressionSpecification, FilterSpecification, Map as MapLibreMap } from 'maplibre-gl';

/*
 * OTW's own place icons, drawn on every map design that doesn't bring its own.
 * The kinds come from the `poi` layer of GrabMaps' tiles, which also holds gates,
 * traffic lights and the like, so only the kinds listed here are shown.
 */

interface PoiKind {
  id: string;
  /** Tile `class` values of this kind. */
  classes: string[];
  color: string;
  /** Drawn in white on a 24×24 grid. */
  glyph: string;
}

const KINDS: PoiKind[] = [
  {
    id: 'food',
    classes: ['restaurant', 'fast_food', 'cafe', 'bakery', 'bar', 'beer', 'ice_cream', 'food_court'],
    color: '#D9701E',
    glyph: 'M8 3v7a2 2 0 0 0 1.5 1.9V21h2v-9.1A2 2 0 0 0 13 10V3h-1.5v6h-.7V3H9.7v6H9V3zM17 3c-1.7 1-2.5 3-2.5 6v4H15v8h2z',
  },
  {
    id: 'shop',
    classes: ['shop', 'grocery', 'clothing_store', 'convenience', 'hardware'],
    color: '#8A56C2',
    glyph: 'M6 8h12l1 13H5zM9 8a3 3 0 0 1 6 0h-1.6a1.4 1.4 0 0 0-2.8 0z',
  },
  {
    id: 'fuel',
    classes: ['fuel'],
    color: '#2F78C8',
    glyph: 'M5 4h9v16H5zM7 6v5h5V6zM15 9l3 2v6.5a1 1 0 0 0 2 0V9l-3-3-1 1 2 2v.5z',
  },
  {
    id: 'worship',
    classes: ['place_of_worship'],
    color: '#0E8F78',
    glyph: 'M14.5 3.5a8.5 8.5 0 1 0 6 14.5 7 7 0 1 1 0-11.5 8.5 8.5 0 0 0-6-3z',
  },
  {
    id: 'stay',
    classes: ['lodging'],
    color: '#C2578F',
    glyph: 'M3 18V7h2v6h7V9h6a3 3 0 0 1 3 3v6h-2v-2H5v2zM8 12.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  },
  {
    id: 'health',
    classes: ['hospital', 'pharmacy'],
    color: '#D14B4B',
    glyph: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z',
  },
  {
    id: 'school',
    classes: ['school', 'college', 'university'],
    color: '#B8862A',
    glyph: 'M12 5L2 10l10 5 8-4v6h2v-7zM6 14v3c0 1.5 3 3 6 3s6-1.5 6-3v-3l-6 3z',
  },
  {
    id: 'parking',
    classes: ['parking'],
    color: '#4A6FA5',
    glyph: 'M7 3h6.5a5.5 5.5 0 0 1 0 11h-3v7H7zM10.5 6.5v4h3a2 2 0 0 0 0-4z',
  },
  {
    id: 'bank',
    classes: ['bank', 'atm'],
    color: '#4F7D3A',
    glyph: 'M12 3L3 8v2h18V8zM5 11h3v7H5zM10.5 11h3v7h-3zM16 11h3v7h-3zM3 19h18v2H3z',
  },
  {
    id: 'sight',
    classes: ['attraction', 'museum', 'park', 'garden', 'stadium'],
    color: '#2E8C9A',
    glyph: 'M12 3l2.7 5.8 6.3.7-4.7 4.2 1.3 6.3-5.6-3.2-5.6 3.2 1.3-6.3L3 9.5l6.3-.7z',
  },
];

const ICON_PX = 56; // Drawn at twice its size on screen, so it stays sharp on a phone.
const imageId = (kind: PoiKind) => `otw-poi-${kind.id}`;

function drawIcon(kind: PoiKind): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ICON_PX;
  const c = canvas.getContext('2d')!;
  c.beginPath();
  c.arc(ICON_PX / 2, ICON_PX / 2, ICON_PX / 2 - 3, 0, Math.PI * 2);
  c.fillStyle = kind.color;
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = '#FFFFFF';
  c.stroke();
  const scale = (ICON_PX - 22) / 24;
  c.translate(11, 11);
  c.scale(scale, scale);
  c.fillStyle = '#FFFFFF';
  c.fill(new Path2D(kind.glyph), 'evenodd');
  return c.getImageData(0, 0, ICON_PX, ICON_PX);
}

let drawn: Map<string, ImageData> | null = null;

/** Hands the icons to the map. A new style forgets them, so this runs after each one. */
export function addPoiImages(map: MapLibreMap) {
  drawn ??= new Map(KINDS.map((k) => [imageId(k), drawIcon(k)]));
  for (const [id, data] of drawn) {
    if (!map.hasImage(id)) map.addImage(id, data, { pixelRatio: 2 });
  }
}

const SHOWN_CLASSES = KINDS.flatMap((k) => k.classes);
/** Zoomed out, only the better-known places, or the icons would cover the map. */
const ALL_PLACES_ZOOM = 16;
const KNOWN_RANK = 20;

export const POI_FILTER: FilterSpecification = [
  'all',
  ['match', ['get', 'class'], SHOWN_CLASSES, true, false],
  ['has', 'name'],
  ['step', ['zoom'], ['<=', ['get', 'rank'], KNOWN_RANK], ALL_PLACES_ZOOM, true],
];

export const POI_ICON: ExpressionSpecification = [
  'match',
  ['get', 'class'],
  ...KINDS.flatMap((k): [string[], string] => [k.classes, imageId(k)]),
  imageId(KINDS[KINDS.length - 1]),
] as unknown as ExpressionSpecification;
