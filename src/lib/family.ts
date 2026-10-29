import { distance, formatClock, type LngLat } from './geo';

/**
 * Family sharing, talking to the OTW server (functions/api/family). Family see
 * each other's area, like Likas, never the exact spot: the area is worked out
 * here on the phone before anything is sent.
 */

export const MAX_FAMILY = 10;

export interface Area {
  name: string;
  lat: number;
  lng: number;
}

export interface FamilyMember {
  id: string;
  name: string;
  private: boolean;
  /** Unix seconds the phone last checked in. */
  seenAt: number | null;
  area: (Area & { since: number | null }) | null;
  /** The trip in progress; eta in unix seconds. */
  trip: { to: string; eta: number } | null;
  /** The moving car, only while that person has "Share live trip" on. */
  live: { lat: number; lng: number; heading: number | null; at: number | null } | null;
}

export interface FamilyState {
  /** Your own member id. */
  me: string;
  invite: { code: string; expiresAt: number } | null;
  members: FamilyMember[];
}

export interface FamilyPatch {
  name?: string;
  private?: boolean;
  area?: Area | null;
  trip?: { to: string; eta: number } | null;
  live?: { lat: number; lng: number; heading: number | null } | null;
}

export interface InvitePreview {
  /** Who's already in, oldest first. */
  names: string[];
  full: boolean;
  /** This phone is already in that family. */
  alreadyIn: boolean;
}

export class FamilyError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, token: string | null, body?: object): Promise<T> {
  const headers: Record<string, string> = {};
  if (body) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`/api/family/${path}`, {
      method: body ? 'POST' : 'GET',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new FamilyError(0, 'No internet. Check your connection and try again.');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new FamilyError(res.status, data.error ?? 'Something went wrong. Try again.');
  return data as T;
}

type Joined = { token: string; family: FamilyState };

export const familyApi = {
  start: (name: string, token: string | null) => call<Joined>('start', token, { name }),
  invite: (code: string, token: string | null) => call<InvitePreview>(`invite/${encodeURIComponent(code)}`, token),
  join: (code: string, name: string, token: string | null) => call<Joined>('join', token, { code, name }),
  state: (token: string) => call<FamilyState>('state', token),
  update: (token: string, patch: FamilyPatch) => call<FamilyState>('me', token, patch),
  newLink: (token: string) => call<FamilyState>('new-link', token, {}),
  leave: (token: string) => call<{ ok: true }>('leave', token, {}),
};

export const inviteLink = (code: string) => `${window.location.origin}/join/${code}`;

export const inviteMessage = (code: string) =>
  `Jom join family kita dalam OTW, senang tengok ETA masing-masing. Tekan link ni: ${inviteLink(code)}`;

/** The code from an invite link's address, e.g. /join/K7M2Q9. */
export function inviteCodeFromPath(path: string): string | null {
  const m = /^\/join\/([A-Za-z0-9]{4,12})\/?$/.exec(path);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Colours for family on the map and in lists, by the order they joined, so
 * Mak has the same colour on every phone. You always see yourself in OTW green.
 */
const COLORS = ['#1D4ED8', '#B4436C', '#B45309', '#7C3AED', '#0369A1', '#BE123C', '#4D7C0F', '#A16207', '#9333EA', '#0F766E'];

export function memberColor(state: FamilyState, id: string): string | undefined {
  if (id === state.me) return undefined;
  return COLORS[Math.max(0, state.members.findIndex((m) => m.id === id)) % COLORS.length];
}

function ago(seconds: number): string {
  const min = Math.round(seconds / 60);
  if (min < 2) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

const clock = (unix: number) => formatClock(new Date(unix * 1000));

/** The line under someone's name, e.g. "Likas · since 4:10 PM". */
export function memberLine(m: FamilyMember, nowS = Date.now() / 1000): string {
  if (m.private) return 'Private · hidden from family';
  if (m.trip) {
    const eta = `ETA ${clock(m.trip.eta)}`;
    return m.live ? `To ${m.trip.to} · ${eta}` : `${m.area ? `${m.area.name} · ` : ''}to ${m.trip.to}, ${eta}`;
  }
  if (!m.area) return 'Hasn’t shared an area yet';
  // Only shares while OTW is open, so say how old the area is once it's been a while.
  if (m.seenAt != null && nowS - m.seenAt > 30 * 60) return `${m.area.name} · ${ago(nowS - m.seenAt)}`;
  return m.area.since ? `${m.area.name} · since ${clock(m.area.since)}` : m.area.name;
}

// --- Area names (kawasan) ---

type AreaRow = [name: string, lat: number, lng: number];
/** Further than this from every Sabah place we know, the area is just "Outside Sabah". */
const OUTSIDE_M = 30000;
let areaList: Promise<AreaRow[]> | null = null;

/**
 * The area around a spot, from a list of Sabah towns and villages kept in the
 * app (scripts/sabah-areas.mjs). The spot itself never leaves the phone: only
 * the area's name and its middle point are shared.
 */
export async function areaAt(coord: LngLat): Promise<Area> {
  areaList ??= import('./sabahAreas.json').then((m) => m.default as AreaRow[]);
  const list = await areaList;
  let best: AreaRow | null = null;
  let bestM = Infinity;
  for (const row of list) {
    const m = distance(coord, [row[2], row[1]]);
    if (m < bestM) {
      bestM = m;
      best = row;
    }
  }
  if (!best || bestM > OUTSIDE_M) {
    return { name: 'Outside Sabah', lat: Math.round(coord[1] * 10) / 10, lng: Math.round(coord[0] * 10) / 10 };
  }
  return { name: best[0], lat: best[1], lng: best[2] };
}
