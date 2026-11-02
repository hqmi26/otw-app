/**
 * /api/account/* – accounts and groups. Runs on Cloudflare Pages next to the app
 * and stores rows in the D1 database bound as FAMILY_DB (tables: db/family.sql).
 *
 * Every driver gets a hidden ID with no name, email or phone number. The phone
 * keeps a secret token; only its SHA-256 is stored here. Someone who drives alone
 * has nothing else on this server, and trips are never recorded.
 *
 * Family groups see each other's area, never the exact spot, and the ETA while
 * driving. Normal groups see nothing until someone shares a trip with them. The
 * only exact position kept is the moving car, and only while that person has
 * "Share live trip" on. Nothing is kept as history: each person has one status
 * row that is overwritten, and trips are cleared on arrival.
 *
 * Joining is by invite link with just a name.
 */

// Just the parts of Cloudflare's D1 API used here, so no extra type package is needed.
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
interface D1Database {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown[]>;
}

interface Env {
  FAMILY_DB?: D1Database;
}

interface Context {
  request: Request;
  env: Env;
  params: { path?: string[] | string };
}

interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
  google_id: string | null;
}

interface StatusRow {
  seen_at: number | null;
  private: number | null;
  area: string | null;
  area_lat: number | null;
  area_lng: number | null;
  area_since: number | null;
  trip_to: string | null;
  trip_eta: number | null;
  live_lat: number | null;
  live_lng: number | null;
  live_heading: number | null;
  live_at: number | null;
}

interface MemberRow extends StatusRow {
  group_id: string;
  user_id: string;
  name: string | null;
  sharing: number;
}

type GroupType = 'family' | 'normal';

interface GroupRow {
  id: string;
  type: GroupType;
  name: string;
  owner_id: string;
  invite_code: string;
  invite_expires_at: number;
}

const MAX_PEOPLE = 10;
/** One family group each, and at most this many normal ones. */
const MAX_NORMAL = 5;
const INVITE_DAYS = 7;
/** The moving car disappears if the phone stops sending for this long (app closed, no signal). */
const LIVE_STALE_S = 3 * 60;
/** A trip still showing this long after its ETA was abandoned, so it's cleared. */
const TRIP_STALE_S = 30 * 60;
/** New hidden IDs each phone (by IP, kept only in memory) can ask for a minute. */
const GUESTS_PER_MINUTE = 20;
/** No 0/O or 1/I, so the code is easy to read out. */
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Same tables as db/family.sql, made once per server instance so a new database needs no setup. */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE,
    google_id TEXT UNIQUE, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS devices (token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL,
    owner_id TEXT NOT NULL, invite_code TEXT NOT NULL UNIQUE, invite_expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS group_members (
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at INTEGER NOT NULL, sharing INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (group_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS user_status (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    seen_at INTEGER, private INTEGER NOT NULL DEFAULT 0, area TEXT, area_lat REAL, area_lng REAL, area_since INTEGER,
    trip_to TEXT, trip_eta INTEGER, live_lat REAL, live_lng REAL, live_heading REAL, live_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS devices_by_user ON devices (user_id)`,
  `CREATE INDEX IF NOT EXISTS group_members_by_user ON group_members (user_id)`,
];
let tablesReady: Promise<unknown> | null = null;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const reply = (status: number, body: object) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const now = () => Math.floor(Date.now() / 1000);

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

function num(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;
}

const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_LETTERS[b % CODE_LETTERS.length]).join('');
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const data: unknown = await request.json();
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  } catch {
    throw new HttpError(400, 'Expected JSON');
  }
}

function bearer(request: Request): string | null {
  const m = /^Bearer (\S+)$/.exec(request.headers.get('authorization') ?? '');
  return m ? m[1] : null;
}

// Rate limit kept in memory only, per server instance: enough to stop a script
// filling the database, and nothing about anyone is stored.
const recentGuests = new Map<string, number[]>();
function allowGuest(request: Request): boolean {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const t = Date.now();
  const list = (recentGuests.get(ip) ?? []).filter((x) => t - x < 60_000);
  if (list.length >= GUESTS_PER_MINUTE) return false;
  list.push(t);
  recentGuests.set(ip, list);
  if (recentGuests.size > 5000) recentGuests.delete(recentGuests.keys().next().value!);
  return true;
}

/** The person this phone's token belongs to, or null. */
async function findUser(db: D1Database, token: string | null): Promise<UserRow | null> {
  if (!token) return null;
  return db
    .prepare('SELECT u.* FROM devices d JOIN users u ON u.id = d.user_id WHERE d.token_hash = ?')
    .bind(await sha256(token))
    .first<UserRow>();
}

async function requireUser(db: D1Database, request: Request): Promise<UserRow> {
  const me = await findUser(db, bearer(request));
  if (!me) throw new HttpError(401, 'This phone isn’t signed in');
  return me;
}

async function myGroupTypes(db: D1Database, userId: string): Promise<GroupType[]> {
  const { results } = await db
    .prepare('SELECT g.type FROM group_members m JOIN groups g ON g.id = m.group_id WHERE m.user_id = ?')
    .bind(userId)
    .all<{ type: GroupType }>();
  return results.map((r) => r.type);
}

async function groupByCode(db: D1Database, code: unknown): Promise<GroupRow> {
  const clean = text(code, 12).toUpperCase();
  const group = clean
    ? await db.prepare('SELECT * FROM groups WHERE invite_code = ?').bind(clean).first<GroupRow>()
    : null;
  if (!group || group.invite_expires_at < now()) throw new HttpError(404, 'This invite link has expired');
  return group;
}

/** A group this person is in, or a 404. */
async function myGroup(db: D1Database, me: UserRow, groupId: string): Promise<GroupRow> {
  const group = await db
    .prepare('SELECT g.* FROM groups g JOIN group_members m ON m.group_id = g.id WHERE g.id = ? AND m.user_id = ?')
    .bind(groupId, me.id)
    .first<GroupRow>();
  if (!group) throw new HttpError(404, 'You’re not in this group');
  return group;
}

/** Takes someone out of a group. The last one out closes it, and the owner's role passes on. */
async function dropMember(db: D1Database, groupId: string, userId: string) {
  await db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').bind(groupId, userId).run();
  const next = await db
    .prepare('SELECT user_id FROM group_members WHERE group_id = ? ORDER BY joined_at, rowid LIMIT 1')
    .bind(groupId)
    .first<{ user_id: string }>();
  if (!next) {
    await db.prepare('DELETE FROM groups WHERE id = ?').bind(groupId).run();
    return;
  }
  await db
    .prepare('UPDATE groups SET owner_id = ? WHERE id = ? AND owner_id = ?')
    .bind(next.user_id, groupId, userId)
    .run();
}

/** After leaving a group: keep nothing that the groups still left don't need. */
async function forgetUnneeded(db: D1Database, userId: string) {
  const types = await myGroupTypes(db, userId);
  if (types.length === 0) {
    await db.batch([
      db.prepare('DELETE FROM user_status WHERE user_id = ?').bind(userId),
      db.prepare('UPDATE users SET name = NULL WHERE id = ?').bind(userId),
    ]);
  } else if (!types.includes('family')) {
    await db
      .prepare('UPDATE user_status SET area = NULL, area_lat = NULL, area_lng = NULL, area_since = NULL WHERE user_id = ?')
      .bind(userId)
      .run();
  }
}

/** Erases a person. Their groups carry on without them; road reports never had a link to them. */
async function deleteUser(db: D1Database, userId: string) {
  const { results } = await db
    .prepare('SELECT group_id FROM group_members WHERE user_id = ?')
    .bind(userId)
    .all<{ group_id: string }>();
  for (const { group_id } of results) await dropMember(db, group_id, userId);
  await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
}

const CLEAR_LIVE = 'live_lat = NULL, live_lng = NULL, live_heading = NULL, live_at = NULL';
const IN_MY_GROUPS = `user_id IN (SELECT o.user_id FROM group_members o
  JOIN group_members m ON m.group_id = o.group_id WHERE m.user_id = ?)`;

/** Everything the Groups pages show. Clears cars and trips that have gone stale first. */
async function stateFor(db: D1Database, me: UserRow) {
  const t = now();
  await db.batch([
    db.prepare(`UPDATE user_status SET ${CLEAR_LIVE} WHERE live_at < ? AND ${IN_MY_GROUPS}`).bind(t - LIVE_STALE_S, me.id),
    db
      .prepare(`UPDATE user_status SET trip_to = NULL, trip_eta = NULL, ${CLEAR_LIVE} WHERE trip_eta < ? AND ${IN_MY_GROUPS}`)
      .bind(t - TRIP_STALE_S, me.id),
  ]);
  const { results: groups } = await db
    .prepare(
      `SELECT g.* FROM group_members m JOIN groups g ON g.id = m.group_id WHERE m.user_id = ?
        ORDER BY g.type = 'family' DESC, m.joined_at, m.rowid`,
    )
    .bind(me.id)
    .all<GroupRow>();
  const { results: rows } = await db
    .prepare(
      `SELECT m.group_id, m.user_id, m.sharing, u.name, s.seen_at, s.private, s.area, s.area_lat, s.area_lng,
        s.area_since, s.trip_to, s.trip_eta, s.live_lat, s.live_lng, s.live_heading, s.live_at
        FROM group_members m JOIN users u ON u.id = m.user_id LEFT JOIN user_status s ON s.user_id = m.user_id
        WHERE m.group_id IN (SELECT group_id FROM group_members WHERE user_id = ?)
        ORDER BY m.joined_at, m.rowid`,
    )
    .bind(me.id)
    .all<MemberRow>();
  const status = await db.prepare('SELECT private FROM user_status WHERE user_id = ?').bind(me.id).first<{ private: number }>();

  const memberView = (m: MemberRow, type: GroupType) => {
    const hidden = m.private === 1;
    const family = type === 'family';
    // A normal group sees nothing until the trip is shared with it, not even whether someone is on Private.
    const showTrip = !hidden && (family || m.sharing === 1);
    return {
      id: m.user_id,
      name: m.name ?? 'Guest',
      private: family && hidden,
      seenAt: family ? m.seen_at : null,
      area:
        family && !hidden && m.area != null && m.area_lat != null && m.area_lng != null
          ? { name: m.area, lat: m.area_lat, lng: m.area_lng, since: m.area_since }
          : null,
      trip: showTrip && m.trip_to != null && m.trip_eta != null ? { to: m.trip_to, eta: m.trip_eta } : null,
      live:
        showTrip && m.live_lat != null && m.live_lng != null
          ? { lat: m.live_lat, lng: m.live_lng, heading: m.live_heading, at: m.live_at }
          : null,
    };
  };

  return {
    me: me.id,
    private: status?.private === 1,
    groups: groups.map((g) => ({
      id: g.id,
      type: g.type,
      name: g.name,
      ownerId: g.owner_id,
      invite: { code: g.invite_code, expiresAt: g.invite_expires_at },
      members: rows.filter((r) => r.group_id === g.id).map((r) => memberView(r, g.type)),
    })),
  };
}

const EMPTY_STATUS: StatusRow = {
  seen_at: null,
  private: 0,
  area: null,
  area_lat: null,
  area_lng: null,
  area_since: null,
  trip_to: null,
  trip_eta: null,
  live_lat: null,
  live_lng: null,
  live_heading: null,
  live_at: null,
};

/** Applies what the phone sent: name, Private, area, trip and the live car. */
async function updateMe(db: D1Database, me: UserRow, data: Record<string, unknown>) {
  const types = await myGroupTypes(db, me.id);
  // Someone with no groups has nothing to share, so nothing is kept.
  if (types.length === 0) return;
  const inFamily = types.includes('family');
  const old = await db.prepare('SELECT * FROM user_status WHERE user_id = ?').bind(me.id).first<StatusRow>();
  const next: StatusRow = { ...EMPTY_STATUS, ...old };
  const t = now();
  const writes: D1Statement[] = [];

  const name = text(data.name, 20);
  if (name) writes.push(db.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, me.id));
  if (typeof data.private === 'boolean') next.private = data.private ? 1 : 0;

  const clearTrip = () => Object.assign(next, { trip_to: null, trip_eta: null });
  const clearLive = () => Object.assign(next, { live_lat: null, live_lng: null, live_heading: null, live_at: null });
  const stopSharing = () => writes.push(db.prepare('UPDATE group_members SET sharing = 0 WHERE user_id = ?').bind(me.id));

  if (next.private) {
    // Private hides you completely, so nothing about you is kept.
    Object.assign(next, { area: null, area_lat: null, area_lng: null, area_since: null });
    clearTrip();
    clearLive();
    stopSharing();
  } else {
    if ('area' in data && inFamily) {
      const a = data.area as Record<string, unknown> | null;
      const areaName = a ? text(a.name, 40) : '';
      const lat = a ? num(a.lat, -90, 90) : null;
      const lng = a ? num(a.lng, -180, 180) : null;
      if (areaName && lat != null && lng != null) {
        if (areaName !== next.area) next.area_since = t;
        // About 1 km, so even the middle of the area is rough.
        Object.assign(next, { area: areaName, area_lat: round(lat, 2), area_lng: round(lng, 2) });
      } else if (a === null) {
        Object.assign(next, { area: null, area_lat: null, area_lng: null, area_since: null });
      }
    }
    if ('trip' in data) {
      const trip = data.trip as Record<string, unknown> | null;
      const to = trip ? text(trip.to, 60) : '';
      const eta = trip ? num(trip.eta, t - TRIP_STALE_S, t + 24 * 3600) : null;
      if (to && eta != null) {
        Object.assign(next, { trip_to: to, trip_eta: Math.round(eta) });
        // Every trip says afresh who it's for, so a normal group is never left seeing the next one.
        stopSharing();
        const shareWith = Array.isArray(data.shareWith) ? data.shareWith.filter((id) => typeof id === 'string') : [];
        for (const id of shareWith.slice(0, MAX_NORMAL)) {
          writes.push(db.prepare('UPDATE group_members SET sharing = 1 WHERE group_id = ? AND user_id = ?').bind(id, me.id));
        }
      } else if (trip === null) {
        // Arrived or ended: the trip and the live car go together.
        clearTrip();
        clearLive();
        stopSharing();
      }
    }
    if ('live' in data) {
      const live = data.live as Record<string, unknown> | null;
      const lat = live ? num(live.lat, -90, 90) : null;
      const lng = live ? num(live.lng, -180, 180) : null;
      if (live && lat != null && lng != null && next.trip_to != null) {
        const heading = num(live.heading, -360, 360);
        Object.assign(next, {
          live_lat: round(lat, 5),
          live_lng: round(lng, 5),
          live_heading: heading == null ? null : Math.round(heading),
          live_at: t,
        });
      } else if (live === null) {
        clearLive();
      }
    }
  }

  writes.push(
    db
      .prepare(
        `INSERT INTO user_status (user_id, seen_at, private, area, area_lat, area_lng, area_since,
          trip_to, trip_eta, live_lat, live_lng, live_heading, live_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (user_id) DO UPDATE SET seen_at = excluded.seen_at, private = excluded.private,
          area = excluded.area, area_lat = excluded.area_lat, area_lng = excluded.area_lng, area_since = excluded.area_since,
          trip_to = excluded.trip_to, trip_eta = excluded.trip_eta, live_lat = excluded.live_lat,
          live_lng = excluded.live_lng, live_heading = excluded.live_heading, live_at = excluded.live_at`,
      )
      .bind(
        me.id,
        t,
        next.private,
        next.area,
        next.area_lat,
        next.area_lng,
        next.area_since,
        next.trip_to,
        next.trip_eta,
        next.live_lat,
        next.live_lng,
        next.live_heading,
        next.live_at,
      ),
  );
  await db.batch(writes);
}

async function newInvite(db: D1Database, groupId: string) {
  await db
    .prepare('UPDATE groups SET invite_code = ?, invite_expires_at = ? WHERE id = ?')
    .bind(randomCode(), now() + INVITE_DAYS * 86400, groupId)
    .run();
}

const FULL_MESSAGE = `This group already has ${MAX_PEOPLE} people`;
const TOO_MANY_GROUPS = `You can be in ${MAX_NORMAL} normal groups at most`;

async function handle(db: D1Database, method: string, path: string[], request: Request): Promise<Response> {
  const [action, arg, sub] = path;

  // A new driver: a hidden ID and this phone's key. Nothing about the person.
  if (method === 'POST' && action === 'guest') {
    if (!allowGuest(request)) throw new HttpError(429, 'Too many new accounts from here. Try again in a minute.');
    const id = crypto.randomUUID();
    const token = randomToken();
    await db.batch([
      db.prepare('INSERT INTO users (id, created_at) VALUES (?, ?)').bind(id, now()),
      db.prepare('INSERT INTO devices (token_hash, user_id, created_at) VALUES (?, ?, ?)').bind(await sha256(token), id, now()),
    ]);
    return reply(201, { token });
  }

  // What's behind an invite link, for the invite page. Names only.
  if (method === 'GET' && action === 'invite' && arg) {
    const group = await groupByCode(db, arg);
    const { results } = await db
      .prepare(
        `SELECT m.user_id, u.name FROM group_members m JOIN users u ON u.id = m.user_id
          WHERE m.group_id = ? ORDER BY m.joined_at, m.rowid`,
      )
      .bind(group.id)
      .all<{ user_id: string; name: string | null }>();
    const me = await findUser(db, bearer(request));
    const types = me ? await myGroupTypes(db, me.id) : [];
    const alreadyIn = results.some((r) => r.user_id === me?.id);
    return reply(200, {
      type: group.type,
      groupName: group.name,
      names: results.map((r) => r.name ?? 'Guest'),
      full: results.length >= MAX_PEOPLE,
      alreadyIn,
      // Joining this family means leaving the one this phone is in.
      leavesFamily: group.type === 'family' && !alreadyIn && types.includes('family'),
    });
  }

  // Everything below needs this phone's key.
  const me = await requireUser(db, request);

  if (method === 'GET' && action === 'state') {
    return reply(200, await stateFor(db, me));
  }

  if (method === 'POST' && action === 'me') {
    await updateMe(db, me, await readJson(request));
    return reply(200, await stateFor(db, me));
  }

  // Signs this phone out. With no other phone and no linked login there'd be
  // no way back to this account, so it isn't left behind in anyone's group.
  if (method === 'POST' && action === 'logout') {
    await db.prepare('DELETE FROM devices WHERE token_hash = ?').bind(await sha256(bearer(request)!)).run();
    const other = await db.prepare('SELECT 1 AS yes FROM devices WHERE user_id = ? LIMIT 1').bind(me.id).first();
    if (!other && !me.email && !me.google_id) await deleteUser(db, me.id);
    return reply(200, { ok: true });
  }

  if (method === 'POST' && action === 'delete') {
    await deleteUser(db, me.id);
    return reply(200, { ok: true });
  }

  // Start a new group, with this person as the first member and its owner.
  if (method === 'POST' && action === 'groups' && !arg) {
    const data = await readJson(request);
    const type = data.type;
    if (type !== 'family' && type !== 'normal') throw new HttpError(400, 'Choose a family or a normal group');
    const name = text(data.name, 20) || me.name;
    if (!name) throw new HttpError(400, 'Missing name');
    const groupName = type === 'family' ? 'Family' : text(data.groupName, 30);
    if (!groupName) throw new HttpError(400, 'Give the group a name');
    const types = await myGroupTypes(db, me.id);
    if (type === 'family' && types.includes('family')) throw new HttpError(409, 'You’re already in a family group');
    if (type === 'normal' && types.filter((x) => x === 'normal').length >= MAX_NORMAL) throw new HttpError(409, TOO_MANY_GROUPS);
    const groupId = crypto.randomUUID();
    await db.batch([
      db
        .prepare(
          'INSERT INTO groups (id, type, name, owner_id, invite_code, invite_expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .bind(groupId, type, groupName, me.id, randomCode(), now() + INVITE_DAYS * 86400, now()),
      db.prepare('INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)').bind(groupId, me.id, now()),
      db.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, me.id),
    ]);
    return reply(201, await stateFor(db, me));
  }

  // Join with the invite link and a name. A new family replaces the old one.
  if (method === 'POST' && action === 'join') {
    const data = await readJson(request);
    const name = text(data.name, 20) || me.name;
    if (!name) throw new HttpError(400, 'Missing name');
    const group = await groupByCode(db, data.code);
    const { results: members } = await db
      .prepare('SELECT user_id FROM group_members WHERE group_id = ?')
      .bind(group.id)
      .all<{ user_id: string }>();
    if (!members.some((m) => m.user_id === me.id)) {
      if (members.length >= MAX_PEOPLE) throw new HttpError(409, FULL_MESSAGE);
      const types = await myGroupTypes(db, me.id);
      if (group.type === 'normal' && types.filter((x) => x === 'normal').length >= MAX_NORMAL) {
        throw new HttpError(409, TOO_MANY_GROUPS);
      }
      if (group.type === 'family' && types.includes('family')) {
        const { results } = await db
          .prepare(
            `SELECT g.id FROM group_members m JOIN groups g ON g.id = m.group_id
              WHERE m.user_id = ? AND g.type = 'family'`,
          )
          .bind(me.id)
          .all<{ id: string }>();
        for (const { id } of results) await dropMember(db, id, me.id);
      }
      await db
        .prepare('INSERT INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)')
        .bind(group.id, me.id, now())
        .run();
    }
    await db.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, me.id).run();
    return reply(200, await stateFor(db, me));
  }

  if (method === 'POST' && action === 'groups' && arg) {
    const group = await myGroup(db, me, arg);
    if (sub === 'new-link') {
      await newInvite(db, group.id);
      return reply(200, await stateFor(db, me));
    }
    if (sub === 'leave') {
      await dropMember(db, group.id, me.id);
      await forgetUnneeded(db, me.id);
      return reply(200, await stateFor(db, me));
    }
    if (sub === 'remove') {
      if (group.owner_id !== me.id) throw new HttpError(403, 'Only the person who started the group can remove people');
      const userId = text((await readJson(request)).userId, 40);
      if (!userId || userId === me.id) throw new HttpError(400, 'Choose someone to remove');
      await dropMember(db, group.id, userId);
      await forgetUnneeded(db, userId);
      // A new link, so the old one can't bring them straight back in.
      await newInvite(db, group.id);
      return reply(200, await stateFor(db, me));
    }
  }
  throw new HttpError(404, 'Not found');
}

export const onRequest = async ({ request, env, params }: Context) => {
  const db = env.FAMILY_DB;
  if (!db) return reply(503, { error: 'Accounts are not set up' });
  const path = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  try {
    tablesReady ??= db.batch(SCHEMA.map((sql) => db.prepare(sql)));
    await tablesReady;
    return await handle(db, request.method, path, request);
  } catch (e) {
    if (e instanceof HttpError) return reply(e.status, { error: e.message });
    tablesReady = null; // try making the tables again next time
    return reply(500, { error: 'Something went wrong' });
  }
};
