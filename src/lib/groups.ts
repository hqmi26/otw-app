import { areaNames, type AreaNames } from './api';
import { distance, formatClock, type LngLat } from './geo';
import { SERVER_URL } from './native';

/**
 * Accounts and groups, talking to the OTW server (functions/api/account). A
 * family group sees each other's area, like Likas, never the exact spot: the
 * phone rounds the spot to about 1 km before anything is sent. A normal group
 * sees nothing until you share a trip with it.
 */

export const MAX_PEOPLE = 10;
export const MAX_NORMAL_GROUPS = 5;

export type GroupType = 'family' | 'normal';

export interface Area {
  name: string;
  lat: number;
  lng: number;
}

export interface GroupMember {
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

export interface Group {
  id: string;
  type: GroupType;
  name: string;
  /** Who started it, or took over when they left. Can remove people. */
  ownerId: string;
  invite: { code: string; expiresAt: number } | null;
  members: GroupMember[];
}

export interface GroupsState {
  /** Your own hidden ID. */
  me: string;
  /** Hidden from every group. */
  private: boolean;
  /** Signed in (with Google) means the account can be got back on another phone. */
  login: { signedIn: boolean; email: string | null };
  /** Null when Google sign-in isn't set up on the server. */
  googleClientId: string | null;
  /** Goes up each time the places kept with the account change. */
  placesVersion: number;
  /** Family group first. */
  groups: Group[];
}

export interface StatusPatch {
  name?: string;
  private?: boolean;
  area?: Area | null;
  trip?: { to: string; eta: number } | null;
  /** Normal groups this trip is shared with. Sent with the trip. */
  shareWith?: string[];
  live?: { lat: number; lng: number; heading: number | null } | null;
}

export interface NewGroup {
  type: GroupType;
  /** Your name in the group. */
  name: string;
  /** Normal groups only; a family group is just Family. */
  groupName?: string;
}

export interface InvitePreview {
  type: GroupType;
  groupName: string;
  /** Who's already in, oldest first. */
  names: string[];
  full: boolean;
  /** This phone is already in that group. */
  alreadyIn: boolean;
  /** Joining this family means leaving the one this phone is in. */
  leavesFamily: boolean;
}

export interface GoogleResult {
  /** This phone moved to an account that was already there. */
  switched: boolean;
  /** The name that account's groups see, if it has one. */
  name: string | null;
  /** First name from Google, as a starting point. Not kept on the server. */
  googleName: string | null;
  state: GroupsState;
}

/** Saved places and added places kept with a signed-in account. */
export interface AccountPlaces {
  version: number;
  saved: unknown[];
  myPlaces: unknown[];
}

export class AccountError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** What else the server said, e.g. the newer places when a save came too late. */
    readonly data?: unknown,
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
    res = await fetch(`/api/account/${path}`, {
      method: body ? 'POST' : 'GET',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new AccountError(0, 'No internet. Check your connection and try again.');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new AccountError(res.status, data.error ?? 'Something went wrong. Try again.', data);
  return data as T;
}

export const accountApi = {
  config: () => call<{ googleClientId: string | null }>('config', null),
  guest: () => call<{ token: string }>('guest', null, {}),
  google: (token: string, credential: string) => call<GoogleResult>('google', token, { credential }),
  places: (token: string) => call<AccountPlaces>('places', token),
  /** `base` is the version these were changed from; a 409 carries the newer ones. */
  savePlaces: (token: string, base: number, saved: unknown[], myPlaces: unknown[]) =>
    call<{ version: number }>('places', token, { base, saved, myPlaces }),
  state: (token: string) => call<GroupsState>('state', token),
  update: (token: string, patch: StatusPatch) => call<GroupsState>('me', token, patch),
  logout: (token: string) => call<{ ok: true }>('logout', token, {}),
  deleteAccount: (token: string) => call<{ ok: true }>('delete', token, {}),
  start: (token: string, group: NewGroup) => call<GroupsState>('groups', token, group),
  invite: (code: string, token: string | null) => call<InvitePreview>(`invite/${encodeURIComponent(code)}`, token),
  join: (token: string, code: string, name: string) => call<GroupsState>('join', token, { code, name }),
  newLink: (token: string, groupId: string) => call<GroupsState>(`groups/${groupId}/new-link`, token, {}),
  leave: (token: string, groupId: string) => call<GroupsState>(`groups/${groupId}/leave`, token, {}),
  remove: (token: string, groupId: string, userId: string) =>
    call<GroupsState>(`groups/${groupId}/remove`, token, { userId }),
};

/**
 * What this phone asks Google to write into its answer. The server works out
 * the same value from the phone's key, so a copied answer is no use elsewhere.
 */
export async function googleNonce(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`otw-google:${token}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Uses the server's address, because inside the Android app this page's own address is https://localhost. */
export const inviteLink = (code: string) => `${SERVER_URL}/join/${code}`;

export const inviteMessage = (group: Group, code: string) =>
  group.type === 'family'
    ? `Jom join family kita dalam OTW, senang tengok ETA masing-masing. Tekan link ni: ${inviteLink(code)}`
    : `Jom join group ${group.name} dalam OTW. Tekan link ni: ${inviteLink(code)}`;

/** The code from an invite link's address, e.g. /join/K7M2Q9. */
export function inviteCodeFromPath(path: string): string | null {
  const m = /^\/join\/([A-Za-z0-9]{4,12})\/?$/.exec(path);
  return m ? m[1].toUpperCase() : null;
}

/**
 * Everyone you can see, once each and without you: all of your family group,
 * then anyone in a normal group who's sharing a trip with it.
 */
export function peopleInView(state: GroupsState): GroupMember[] {
  const seen = new Map<string, GroupMember>();
  for (const group of state.groups) {
    for (const m of group.members) {
      if (m.id === state.me) continue;
      const known = seen.get(m.id);
      if (group.type === 'family' || m.trip) {
        if (!known || (m.trip && !known.trip)) seen.set(m.id, m);
      }
    }
  }
  return [...seen.values()];
}

/**
 * Colours for people on the map and in lists, by the order they joined, so
 * Mak has the same colour on every phone. You always see yourself in OTW green.
 */
const COLORS = ['#1D4ED8', '#B4436C', '#B45309', '#7C3AED', '#0369A1', '#BE123C', '#4D7C0F', '#A16207', '#9333EA', '#0F766E'];

export function memberColor(state: GroupsState, id: string): string | undefined {
  if (id === state.me) return undefined;
  const group = state.groups.find((g) => g.members.some((m) => m.id === id));
  return COLORS[Math.max(0, group?.members.findIndex((m) => m.id === id) ?? 0) % COLORS.length];
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
export function memberLine(m: GroupMember, type: GroupType = 'family', nowS = Date.now() / 1000): string {
  if (m.private) return 'Private · hidden from family';
  if (m.trip) {
    const eta = `ETA ${clock(m.trip.eta)}`;
    return m.live ? `To ${m.trip.to} · ${eta}` : `${m.area ? `${m.area.name} · ` : ''}to ${m.trip.to}, ${eta}`;
  }
  if (type === 'normal') return 'Not sharing a trip right now';
  if (!m.area) return 'Hasn’t shared an area yet';
  // Only shares while OTW is open, so say how old the area is once it's been a while.
  if (m.seenAt != null && nowS - m.seenAt > 30 * 60) return `${m.area.name} · ${ago(nowS - m.seenAt)}`;
  return m.area.since ? `${m.area.name} · since ${clock(m.area.since)}` : m.area.name;
}

// --- Area names (kawasan) ---

/** Names of buildings, not areas. */
const NOT_AN_AREA = /plaza|kompleks|complex|mall|square|centre|center|menara|wisma|hotel|tower/i;
/** "Seksyen 14" means nothing without its town. */
const NEEDS_TOWN = /^(seksyen|section|ss|usj|pju|blok)\b/i;

/** The closest name people would know, or null if all that's left is too wide. */
function closestName({ locality, district, city, county }: AreaNames): string | null {
  const near = [locality, district].find((n) => n && !NOT_AN_AREA.test(n));
  if (near) return NEEDS_TOWN.test(near) && city ? `${near}, ${city}` : near;
  // A city as wide as its whole district, like Kota Kinabalu, says too little.
  return city && !county?.startsWith(city) ? city : null;
}

type AreaRow = [name: string, lat: number, lng: number];
/** Further than this from every Sabah place we know, the list has no name for the spot. */
const LIST_REACH_M = 30000;
let areaList: Promise<AreaRow[]> | null = null;

/** The nearest town or village in the list kept in the app (scripts/sabah-areas.mjs). Sabah only. */
async function areaFromList(coord: LngLat): Promise<Area | null> {
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
  return best && bestM <= LIST_REACH_M ? { name: best[0], lat: best[1], lng: best[2] } : null;
}

/**
 * The area around a spot, for family to see. Online covers all of Malaysia;
 * the list fills in when online's answer is too wide or there's no signal.
 * Null when neither has a name (no signal outside Sabah): keep the last area.
 */
export async function areaAt(coord: LngLat): Promise<Area | null> {
  const names = await areaNames(coord).catch(() => null);
  const name = names && closestName(names);
  const [lng, lat] = coord.map((v) => Math.round(v * 100) / 100);
  if (name) return { name, lat, lng };
  const listed = await areaFromList(coord);
  if (listed) return listed;
  const wide = names?.city ?? names?.county;
  return wide ? { name: wide, lat, lng } : null;
}
