/**
 * POST /api/feedback – saves what people send from the app's "Send feedback" sheet.
 * Runs on Cloudflare Pages next to the app, and stores rows in the D1 database bound as DB.
 */

// Just the parts of Cloudflare's D1 API used here, so no extra type package is needed.
interface D1Database {
  prepare(sql: string): { bind(...values: unknown[]): { run(): Promise<unknown> }; run(): Promise<unknown> };
}

interface Env {
  DB?: D1Database;
}

const KINDS = ['idea', 'bug', 'other'];

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  name TEXT,
  app TEXT,
  screen TEXT,
  device TEXT
)`;

/** Made once per server instance, so a new database works without any setup SQL. */
let tableReady: Promise<unknown> | null = null;

const reply = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  const db = env.DB;
  if (!db) return reply(503, { error: 'Feedback storage is not set up' });

  let data: Record<string, unknown>;
  try {
    data = await request.json();
  } catch {
    return reply(400, { error: 'Expected JSON' });
  }
  const kind = text(data.kind, 10);
  const message = text(data.message, 1000);
  if (!KINDS.includes(kind) || !message) return reply(400, { error: 'Missing kind or message' });

  try {
    tableReady ??= db.prepare(CREATE_TABLE).run();
    await tableReady;
    await db
      .prepare('INSERT INTO feedback (kind, message, name, app, screen, device) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(kind, message, text(data.name, 40), text(data.app, 80), text(data.screen, 20), text(data.device, 300))
      .run();
  } catch {
    tableReady = null; // try making the table again next time
    return reply(500, { error: 'Could not save' });
  }
  return reply(201, { ok: true });
};
