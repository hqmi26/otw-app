/**
 * POST /api/visit – counts how many phones use OTW each day, and how many trips start.
 * Runs on Cloudflare Pages next to the app, in the same D1 database as feedback (bound as DB).
 *
 * Nothing about the person is kept: no name, no location, no ID, no IP address.
 * The phone sends "opened" at most once a day, and "trip" when a trip starts;
 * each just adds one to a counter for that day and phone type.
 */

// Just the parts of Cloudflare's D1 API used here, so no extra type package is needed.
interface D1Database {
  prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<unknown> }; run(): Promise<unknown> };
}

interface Env {
  DB?: D1Database;
}

const KINDS = ['opened', 'trip'];
const DEVICES = ['android', 'iphone', 'other'];

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS visits (
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  device TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, device)
)`;

/** Made once per server instance, so a new database works without any setup SQL. */
let tableReady: Promise<unknown> | null = null;

const reply = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Today in Malaysia, e.g. 2026-10-30. */
const today = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  const db = env.DB;
  if (!db) return reply(503, { error: 'Visit counter is not set up' });

  let data: Record<string, unknown>;
  try {
    data = await request.json();
  } catch {
    return reply(400, { error: 'Expected JSON' });
  }
  const kind = String(data.kind);
  const device = DEVICES.includes(String(data.device)) ? String(data.device) : 'other';
  if (!KINDS.includes(kind)) return reply(400, { error: 'Unknown kind' });

  try {
    tableReady ??= db.prepare(CREATE_TABLE).run();
    await tableReady;
    await db
      .prepare(
        'INSERT INTO visits (day, kind, device, count) VALUES (?, ?, ?, 1) ' +
          'ON CONFLICT (day, kind, device) DO UPDATE SET count = count + 1',
      )
      .bind(today(), kind, device)
      .run();
  } catch {
    tableReady = null; // try making the table again next time
    return reply(500, { error: 'Could not count' });
  }
  return reply(201, { ok: true });
};
