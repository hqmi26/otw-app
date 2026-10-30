/**
 * /api/family/* – family sharing. Runs on Cloudflare Pages next to the app and
 * stores rows in the D1 database bound as FAMILY_DB (tables: db/family.sql).
 *
 * Family see each other's area, never the exact spot. The phone works the area
 * out before sending; the only exact position kept is the moving car, and only
 * while that person has "Share live trip" on. Nothing is kept as history: each
 * person has one row that is overwritten, and trips are cleared on arrival.
 *
 * Joining is by invite link with just a name. The phone keeps a secret token;
 * only its SHA-256 is stored here.
 *
 * Hazard reports (flood, accident…) are about the road, not the person: they
 * go to the family for 2 hours, then they're deleted. Who sent one is never
 * stored, so they also go out while someone is on Private.
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

interface MemberRow {
  id: string;
  family_id: string;
  name: string;
  joined_at: number;
  seen_at: number | null;
  private: number;
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

interface FamilyRow {
  id: string;
  invite_code: string;
  invite_expires_at: number;
}

interface ReportRow {
  id: string;
  type: string;
  lat: number;
  lng: number;
  note: string | null;
  created_at: number;
}

const MAX_MEMBERS = 10;
const INVITE_DAYS = 7;
/** The moving car disappears if the phone stops sending for this long (app closed, no signal). */
const LIVE_STALE_S = 3 * 60;
/** A trip still showing this long after its ETA was abandoned, so it's cleared. */
const TRIP_STALE_S = 30 * 60;
/** No 0/O or 1/I, so the code is easy to read out. */
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** Same list and lifetime as the app (src/lib/models.ts). */
const HAZARD_TYPES = ['accident', 'jam', 'flood', 'roadblock', 'hazard', 'pothole'];
const REPORT_LIFETIME_S = 2 * 60 * 60;
/** More live reports than this in one family is a stuck button, not real roads. */
const MAX_REPORTS = 50;

/** Same tables as db/family.sql, made once per server instance so a new database needs no setup. */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS families (id TEXT PRIMARY KEY, invite_code TEXT NOT NULL UNIQUE,
    invite_expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE, name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE, joined_at INTEGER NOT NULL, seen_at INTEGER,
    private INTEGER NOT NULL DEFAULT 0, area TEXT, area_lat REAL, area_lng REAL, area_since INTEGER,
    trip_to TEXT, trip_eta INTEGER, live_lat REAL, live_lng REAL, live_heading REAL, live_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS members_by_family ON members (family_id)`,
  `CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    type TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, note TEXT, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS reports_by_family ON reports (family_id)`,
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

/** The member this phone's token belongs to, or null. */
async function findMember(db: D1Database, token: string | null): Promise<MemberRow | null> {
  if (!token) return null;
  return db.prepare('SELECT * FROM members WHERE token_hash = ?').bind(await sha256(token)).first<MemberRow>();
}

async function requireMember(db: D1Database, request: Request): Promise<MemberRow> {
  const me = await findMember(db, bearer(request));
  if (!me) throw new HttpError(401, 'Not in a family');
  return me;
}

async function familyByCode(db: D1Database, code: unknown): Promise<FamilyRow> {
  const clean = text(code, 12).toUpperCase();
  const family = clean
    ? await db.prepare('SELECT * FROM families WHERE invite_code = ?').bind(clean).first<FamilyRow>()
    : null;
  if (!family || family.invite_expires_at < now()) throw new HttpError(404, 'This invite link has expired');
  return family;
}

async function addMember(db: D1Database, familyId: string, name: string): Promise<string> {
  const token = randomToken();
  await db
    .prepare('INSERT INTO members (id, family_id, name, token_hash, joined_at, seen_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), familyId, name, await sha256(token), now(), now())
    .run();
  return token;
}

async function removeMember(db: D1Database, member: MemberRow) {
  await db.prepare('DELETE FROM members WHERE id = ?').bind(member.id).run();
  // The last one out closes the family.
  await db
    .prepare('DELETE FROM families WHERE id = ? AND NOT EXISTS (SELECT 1 FROM members WHERE family_id = ?)')
    .bind(member.family_id, member.family_id)
    .run();
}

/** Everything the Family screen shows. Clears cars and trips that have gone stale first. */
async function familyView(db: D1Database, me: MemberRow) {
  const t = now();
  await db.batch([
    db
      .prepare(
        'UPDATE members SET live_lat = NULL, live_lng = NULL, live_heading = NULL, live_at = NULL WHERE family_id = ? AND live_at < ?',
      )
      .bind(me.family_id, t - LIVE_STALE_S),
    db
      .prepare(
        'UPDATE members SET trip_to = NULL, trip_eta = NULL, live_lat = NULL, live_lng = NULL, live_heading = NULL, live_at = NULL WHERE family_id = ? AND trip_eta < ?',
      )
      .bind(me.family_id, t - TRIP_STALE_S),
    db.prepare('DELETE FROM reports WHERE family_id = ? AND created_at < ?').bind(me.family_id, t - REPORT_LIFETIME_S),
  ]);
  const family = await db.prepare('SELECT * FROM families WHERE id = ?').bind(me.family_id).first<FamilyRow>();
  const { results } = await db
    .prepare('SELECT * FROM members WHERE family_id = ? ORDER BY joined_at')
    .bind(me.family_id)
    .all<MemberRow>();
  const reports = await db
    .prepare('SELECT * FROM reports WHERE family_id = ? ORDER BY created_at')
    .bind(me.family_id)
    .all<ReportRow>();
  return {
    me: me.id,
    invite: family ? { code: family.invite_code, expiresAt: family.invite_expires_at } : null,
    reports: reports.results.map((r) => ({
      id: r.id,
      type: r.type,
      lat: r.lat,
      lng: r.lng,
      note: r.note ?? '',
      at: r.created_at,
    })),
    members: results.map((m) => ({
      id: m.id,
      name: m.name,
      private: m.private === 1,
      seenAt: m.seen_at,
      area:
        m.area != null && m.area_lat != null && m.area_lng != null
          ? { name: m.area, lat: m.area_lat, lng: m.area_lng, since: m.area_since }
          : null,
      trip: m.trip_to != null && m.trip_eta != null ? { to: m.trip_to, eta: m.trip_eta } : null,
      live:
        m.live_lat != null && m.live_lng != null
          ? { lat: m.live_lat, lng: m.live_lng, heading: m.live_heading, at: m.live_at }
          : null,
    })),
  };
}

/** Applies what the phone sent: name, Private, area, trip and the live car. */
async function updateMe(db: D1Database, me: MemberRow, data: Record<string, unknown>) {
  const next = { ...me };
  const t = now();

  const name = text(data.name, 20);
  if (name) next.name = name;
  if (typeof data.private === 'boolean') next.private = data.private ? 1 : 0;

  const clearTrip = () => Object.assign(next, { trip_to: null, trip_eta: null });
  const clearLive = () => Object.assign(next, { live_lat: null, live_lng: null, live_heading: null, live_at: null });

  if (next.private) {
    // Private hides you completely, so nothing about you is kept.
    Object.assign(next, { area: null, area_lat: null, area_lng: null, area_since: null });
    clearTrip();
    clearLive();
  } else {
    if ('area' in data) {
      const a = data.area as Record<string, unknown> | null;
      const areaName = a ? text(a.name, 40) : '';
      const lat = a ? num(a.lat, -90, 90) : null;
      const lng = a ? num(a.lng, -180, 180) : null;
      if (areaName && lat != null && lng != null) {
        if (areaName !== me.area) next.area_since = t;
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
      } else if (trip === null) {
        // Arrived or ended: the trip and the live car go together.
        clearTrip();
        clearLive();
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

  await db
    .prepare(
      `UPDATE members SET name = ?, seen_at = ?, private = ?, area = ?, area_lat = ?, area_lng = ?, area_since = ?,
        trip_to = ?, trip_eta = ?, live_lat = ?, live_lng = ?, live_heading = ?, live_at = ? WHERE id = ?`,
    )
    .bind(
      next.name,
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
      me.id,
    )
    .run();
  return { ...next, seen_at: t };
}

async function newInvite(db: D1Database, familyId: string) {
  await db
    .prepare('UPDATE families SET invite_code = ?, invite_expires_at = ? WHERE id = ?')
    .bind(randomCode(), now() + INVITE_DAYS * 86400, familyId)
    .run();
}

async function handle(db: D1Database, method: string, path: string[], request: Request): Promise<Response> {
  const [action, arg] = path;

  // Start a new family, with this person as the first member.
  if (method === 'POST' && action === 'start') {
    const name = text((await readJson(request)).name, 20);
    if (!name) throw new HttpError(400, 'Missing name');
    const old = await findMember(db, bearer(request));
    if (old) await removeMember(db, old);
    const familyId = crypto.randomUUID();
    await db
      .prepare('INSERT INTO families (id, invite_code, invite_expires_at, created_at) VALUES (?, ?, ?, ?)')
      .bind(familyId, randomCode(), now() + INVITE_DAYS * 86400, now())
      .run();
    const token = await addMember(db, familyId, name);
    const me = (await findMember(db, token))!;
    return reply(201, { token, family: await familyView(db, me) });
  }

  // Who's already in, for the invite page. Names only.
  if (method === 'GET' && action === 'invite' && arg) {
    const family = await familyByCode(db, arg);
    const { results } = await db
      .prepare('SELECT name FROM members WHERE family_id = ? ORDER BY joined_at')
      .bind(family.id)
      .all<{ name: string }>();
    const me = await findMember(db, bearer(request));
    return reply(200, {
      names: results.map((r) => r.name),
      full: results.length >= MAX_MEMBERS,
      alreadyIn: me?.family_id === family.id,
    });
  }

  // Join with the invite link and a name. Leaves any family this phone was in before.
  if (method === 'POST' && action === 'join') {
    const data = await readJson(request);
    const name = text(data.name, 20);
    if (!name) throw new HttpError(400, 'Missing name');
    const family = await familyByCode(db, data.code);
    const old = await findMember(db, bearer(request));
    if (old?.family_id === family.id) {
      const me = await updateMe(db, old, { name });
      return reply(200, { token: bearer(request), family: await familyView(db, me) });
    }
    const count = await db
      .prepare('SELECT COUNT(*) AS n FROM members WHERE family_id = ?')
      .bind(family.id)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= MAX_MEMBERS) throw new HttpError(409, `This family already has ${MAX_MEMBERS} people`);
    if (old) await removeMember(db, old);
    const token = await addMember(db, family.id, name);
    const me = (await findMember(db, token))!;
    return reply(201, { token, family: await familyView(db, me) });
  }

  // Everything below is for members only.
  const me = await requireMember(db, request);

  if (method === 'GET' && action === 'state') {
    return reply(200, await familyView(db, me));
  }
  if (method === 'POST' && action === 'me') {
    const updated = await updateMe(db, me, await readJson(request));
    return reply(200, await familyView(db, updated));
  }
  // A hazard on the road, pinned where the phone was. Nothing says who sent it.
  if (method === 'POST' && action === 'report') {
    const data = await readJson(request);
    const type = text(data.type, 20);
    const lat = num(data.lat, -90, 90);
    const lng = num(data.lng, -180, 180);
    if (!HAZARD_TYPES.includes(type) || lat == null || lng == null) throw new HttpError(400, 'Missing hazard or place');
    const count = await db
      .prepare('SELECT COUNT(*) AS n FROM reports WHERE family_id = ? AND created_at >= ?')
      .bind(me.family_id, now() - REPORT_LIFETIME_S)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= MAX_REPORTS) throw new HttpError(429, 'Too many reports right now. Try again later');
    await db
      .prepare('INSERT INTO reports (id, family_id, type, lat, lng, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), me.family_id, type, round(lat, 5), round(lng, 5), text(data.note, 80) || null, now())
      .run();
    return reply(201, await familyView(db, me));
  }
  if (method === 'POST' && action === 'new-link') {
    await newInvite(db, me.family_id);
    return reply(200, await familyView(db, me));
  }
  if (method === 'POST' && action === 'leave') {
    await removeMember(db, me);
    return reply(200, { ok: true });
  }
  throw new HttpError(404, 'Not found');
}

export const onRequest = async ({ request, env, params }: Context) => {
  const db = env.FAMILY_DB;
  if (!db) return reply(503, { error: 'Family sharing is not set up' });
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
