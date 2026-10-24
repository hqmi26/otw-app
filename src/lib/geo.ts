/** [longitude, latitude] – the order MapLibre and GeoJSON use. */
export type LngLat = [number, number];

const EARTH_RADIUS_M = 6371000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distance(a: LngLat, b: LngLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Compass bearing from a to b, 0–360 degrees. */
export function bearing(a: LngLat, b: LngLat): number {
  const y = Math.sin(toRad(b[0] - a[0])) * Math.cos(toRad(b[1]));
  const x =
    Math.cos(toRad(a[1])) * Math.sin(toRad(b[1])) -
    Math.sin(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.cos(toRad(b[0] - a[0]));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Running distance along a line: cum[i] is metres from the start to line[i]. */
export function cumulative(line: LngLat[]): number[] {
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + distance(line[i - 1], line[i]));
  return cum;
}

export interface Snap {
  /** Metres along the line to the closest point. */
  along: number;
  /** Metres between the point and the line. */
  offset: number;
}

/** Closest point on a line to p, using a flat projection that is accurate at city scale. */
export function snapToLine(p: LngLat, line: LngLat[], cum: number[]): Snap {
  const mx = 111320 * Math.cos(toRad(p[1]));
  const my = 110540;
  let best: Snap = { along: 0, offset: Infinity };
  for (let i = 0; i < line.length - 1; i++) {
    const ax = (line[i][0] - p[0]) * mx;
    const ay = (line[i][1] - p[1]) * my;
    const dx = (line[i + 1][0] - p[0]) * mx - ax;
    const dy = (line[i + 1][1] - p[1]) * my - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const offset = Math.hypot(ax + t * dx, ay + t * dy);
    if (offset < best.offset) best = { along: cum[i] + t * (cum[i + 1] - cum[i]), offset };
  }
  return best;
}

/** The point and heading at a given distance along a line. */
export function pointAlong(line: LngLat[], cum: number[], along: number): { coord: LngLat; heading: number } {
  const total = cum[cum.length - 1];
  const d = Math.max(0, Math.min(total, along));
  let i = 0;
  while (i < cum.length - 2 && cum[i + 1] < d) i++;
  const seg = cum[i + 1] - cum[i];
  const t = seg > 0 ? (d - cum[i]) / seg : 0;
  const a = line[i];
  const b = line[i + 1] ?? a;
  return {
    coord: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
    heading: bearing(a, b),
  };
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

export function formatDuration(seconds: number): string {
  const min = Math.max(1, Math.round(seconds / 60));
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

export function formatClock(date: Date): string {
  return date.toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' });
}
