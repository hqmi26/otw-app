/** The marker that shows you on the map while driving. Every drawing points up. */

export type CarShape = 'arrow' | 'car' | 'motorcycle';

export interface CarLook {
  shape: CarShape;
  color: string;
}

export const CAR_SHAPES: readonly { value: CarShape; label: string; svg: string }[] = [
  {
    value: 'arrow',
    label: 'Arrow',
    svg: '<path d="M12 2.5l7.6 18.4-7.6-4.3-7.6 4.3z"/>',
  },
  {
    value: 'car',
    label: 'Car',
    svg:
      '<path d="M8.6 2.5h6.8c1.8 0 3.1 1.3 3.2 3.1l.4 13c.1 1.6-1.2 2.9-2.8 2.9H7.8c-1.6 0-2.9-1.3-2.8-2.9l.4-13c.1-1.8 1.4-3.1 3.2-3.1z"/>' +
      '<path class="glass" d="M7.9 8.4c2.6-1 5.6-1 8.2 0l-1 3.6c-2-.5-4.2-.5-6.2 0z"/>' +
      '<path class="glass" d="M8.3 17.4c2.4.5 5 .5 7.4 0l.5 2c-2.7.6-5.7.6-8.4 0z"/>',
  },
  {
    value: 'motorcycle',
    label: 'Motorcycle',
    svg:
      '<rect x="10.6" y="1.8" width="2.8" height="6" rx="1.4"/>' +
      '<rect x="10.6" y="16.2" width="2.8" height="6" rx="1.4"/>' +
      '<path d="M5.5 7.2h13c.6 0 1 .4 1 1s-.4 1-1 1h-4l.4 7.4c0 .9-.7 1.6-1.6 1.6h-3.6c-.9 0-1.6-.7-1.6-1.6l.4-7.4h-4c-.6 0-1-.4-1-1s.4-1 1-1z"/>' +
      '<circle class="glass" cx="12" cy="12.6" r="2"/>',
  },
];

export const CAR_COLORS: readonly { value: string; label: string }[] = [
  { value: '#0E7C6B', label: 'OTW green' },
  { value: '#C62828', label: 'Red' },
  { value: '#1E62C8', label: 'Blue' },
  { value: '#E08A00', label: 'Orange' },
  { value: '#15201D', label: 'Black' },
];

export const DEFAULT_CAR: CarLook = { shape: 'arrow', color: CAR_COLORS[0].value };

export function isCarLook(v: unknown): boolean {
  const look = v as CarLook | null;
  return CAR_SHAPES.some((s) => s.value === look?.shape) && CAR_COLORS.some((c) => c.value === look?.color);
}

export const carSvg = (shape: CarShape) => CAR_SHAPES.find((s) => s.value === shape)?.svg ?? CAR_SHAPES[0].svg;
