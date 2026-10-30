/**
 * /api/reports/* – hazard reports every OTW driver sees (accident, flood, speed camera…).
 * Runs on Cloudflare Pages next to the app, in the D1 database bound as DB (same as feedback).
 *
 *   GET  /api/reports?near=lat,lng      live reports within ~60 km
 *   POST /api/reports                   { type, lat, lng, note } → { report }
 *   POST /api/reports/<id>/vote         { still: true | false }  → { report } or { gone: true }
 *
 * No name, phone or ID is kept with a report: just what, where, a note and when.
 * A "still there" pushes its end back; enough "gone" answers remove it. Rows are
 * deleted once they've run out, so there's no history.
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
}

interface Env {
  DB?: D1Database;
}

interface Context {
  request: Request;
  env: Env;
  params: { path?: string[] | string };
}

interface ReportRow {
  id: string;
  type: string;
  lat: number;
  lng: number;
  note: string;
  created_at: number;
  seen_at: number;
  ups: number;
  downs: number;
}

/** Seconds a report lasts after it was made or last confirmed. Speed cameras stay put. */
const LIFETIME_S: Record<string, number> = {
  accident: 2 * 3600,
  jam: 2 * 3600,
  flood: 2 * 3600,
  roadblock: 2 * 3600,
  hazard: 2 * 3600,
  pothole: 2 * 3600,
  camera: 30 * 24 * 3600,
};
/** "Gone" answers needed to remove a report (more if others said it's still there). */
const GONE_VOTES = 2;
/** Each phone (by IP, kept only in memory) can send this many reports and votes a minute. */
const PER_MINUTE = 10;
/** Malaysia, roughly. */
const BOUNDS = { south: 0.8, north: 7.6, west: 99, east: 120 };
const NEAR_DEG = 0.55; // ~60 km

const SCHEMA = `CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL,
  ups INTEGER NOT NULL DEFAULT 0,
  downs INTEGER NOT NULL DEFAULT 0
)`;
let tableReady: Promise<unknown> | null = null;

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
const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;

function num(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;
}

/** SQL for "still showing": not run out, and not voted away. */
const LIVE = `(seen_at + CASE type WHEN 'camera' THEN ${LIFETIME_S.camera} ELSE ${LIFETIME_S.accident} END) > ?
  AND downs < ups + ${GONE_VOTES}`;

const toJson = (r: ReportRow) => ({
  id: r.id,
  type: r.type,
  lat: r.lat,
  lng: r.lng,
  note: r.note,
  at: r.created_at * 1000,
  seenAt: r.seen_at * 1000,
  ups: r.ups,
});

// Rate limit kept in memory only, per server instance: enough to stop a stuck
// phone or a script, and nothing about anyone is stored.
const recent = new Map<string, number[]>();
function allow(request: Request): boolean {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const t = Date.now();
  const list = (recent.get(ip) ?? []).filter((x) => t - x < 60_000);
  if (list.length >= PER_MINUTE) return false;
  list.push(t);
  recent.set(ip, list);
  if (recent.size > 5000) recent.delete(recent.keys().next().value!);
  return true;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const data: unknown = await request.json();
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  } catch {
    throw new HttpError(400, 'Expected JSON');
  }
}

async function list(db: D1Database, url: URL) {
  const [lat, lng] = (url.searchParams.get('near') ?? '').split(',').map(Number);
  if (num(lat, BOUNDS.south, BOUNDS.north) == null || num(lng, BOUNDS.west, BOUNDS.east) == null) {
    throw new HttpError(400, 'near=lat,lng in Malaysia');
  }
  const t = now();
  // Tidy up: reports that ran out or were voted away are deleted, not kept.
  await db.prepare(`DELETE FROM reports WHERE NOT (${LIVE})`).bind(t).run();
  const { results } = await db
    .prepare(
      `SELECT * FROM reports WHERE ${LIVE} AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?
       ORDER BY created_at DESC LIMIT 300`,
    )
    .bind(t, lat - NEAR_DEG, lat + NEAR_DEG, lng - NEAR_DEG, lng + NEAR_DEG)
    .all<ReportRow>();
  return reply(200, { reports: results.map(toJson) });
}

async function create(db: D1Database, request: Request) {
  const data = await readJson(request);
  const type = String(data.type);
  const lat = num(data.lat, BOUNDS.south, BOUNDS.north);
  const lng = num(data.lng, BOUNDS.west, BOUNDS.east);
  if (!(type in LIFETIME_S) || lat == null || lng == null) throw new HttpError(400, 'Need type, lat and lng');
  const note = typeof data.note === 'string' ? data.note.trim().replace(/\s+/g, ' ').slice(0, 80) : '';
  const t = now();
  const row: ReportRow = {
    id: crypto.randomUUID(),
    type,
    lat: round(lat, 5),
    lng: round(lng, 5),
    note,
    created_at: t,
    seen_at: t,
    ups: 0,
    downs: 0,
  };
  await db
    .prepare('INSERT INTO reports (id, type, lat, lng, note, created_at, seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(row.id, row.type, row.lat, row.lng, row.note, row.created_at, row.seen_at)
    .run();
  return reply(201, { report: toJson(row) });
}

async function vote(db: D1Database, id: string, request: Request) {
  const data = await readJson(request);
  if (typeof data.still !== 'boolean') throw new HttpError(400, 'Need still: true or false');
  const t = now();
  if (data.still) {
    await db.prepare('UPDATE reports SET ups = ups + 1, seen_at = ? WHERE id = ?').bind(t, id).run();
  } else {
    await db.prepare('UPDATE reports SET downs = downs + 1 WHERE id = ?').bind(id).run();
  }
  const row = await db.prepare(`SELECT * FROM reports WHERE id = ? AND ${LIVE}`).bind(id, t).first<ReportRow>();
  return reply(200, row ? { report: toJson(row) } : { gone: true });
}

async function handle(db: D1Database, request: Request, path: string[]) {
  const url = new URL(request.url);
  if (request.method === 'GET' && path.length === 0) return list(db, url);
  if (request.method !== 'POST') throw new HttpError(405, 'Not allowed');
  if (!allow(request)) throw new HttpError(429, 'Too many reports. Try again in a minute.');
  if (path.length === 0) return create(db, request);
  if (path.length === 2 && path[1] === 'vote') return vote(db, path[0], request);
  throw new HttpError(404, 'Not found');
}

export const onRequest = async ({ request, env, params }: Context) => {
  const db = env.DB;
  if (!db) return reply(503, { error: 'Shared reports are not set up' });
  const path = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  try {
    tableReady ??= db.prepare(SCHEMA).run();
    await tableReady;
    return await handle(db, request, path);
  } catch (e) {
    if (e instanceof HttpError) return reply(e.status, { error: e.message });
    tableReady = null; // try making the table again next time
    return reply(500, { error: 'Something went wrong' });
  }
};
