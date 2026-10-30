import type { LngLat } from './geo';
import type { HazardReport, HazardType } from './models';
import { ask } from './net';

/*
 * Shared hazard reports (functions/api/reports): what other OTW drivers have
 * reported nearby, without names. If the server can't be reached (offline, or
 * `npm run dev` with no server behind it), reports stay on this phone only.
 */

interface ReportJson {
  id: string;
  type: HazardType;
  lat: number;
  lng: number;
  note: string;
  at: number;
  seenAt: number;
  ups: number;
}

const fromJson = (r: ReportJson): HazardReport => ({
  id: r.id,
  type: r.type,
  coord: [r.lng, r.lat],
  note: r.note,
  at: r.at,
  seenAt: r.seenAt,
  ups: r.ups,
  shared: true,
});

/** Live reports within ~60 km of `near`. */
export async function fetchReports(near: LngLat): Promise<HazardReport[]> {
  // Through net.ts: if the server is struggling, OTW waits a minute before asking again.
  const res = await ask('otw-reports', `/api/reports?near=${near[1].toFixed(3)},${near[0].toFixed(3)}`, {
    timeoutMs: 8000,
  });
  if (!res.ok) throw new Error(`Reports not loaded (${res.status})`);
  const data = (await res.json()) as { reports: ReportJson[] };
  return data.reports.map(fromJson);
}

async function post(path: string, body: object): Promise<Response> {
  return fetch(`/api/reports${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Shares a report with everyone nearby. Throws if it couldn't be sent. */
export async function shareReport(type: HazardType, coord: LngLat, note: string): Promise<HazardReport> {
  const res = await post('', { type, lat: coord[1], lng: coord[0], note });
  if (!res.ok) throw new Error(`Report not shared (${res.status})`);
  return fromJson(((await res.json()) as { report: ReportJson }).report);
}

/** "Still there" or "Gone". Returns the updated report, or null once it's been removed. */
export async function voteReport(id: string, still: boolean): Promise<HazardReport | null> {
  const res = await post(`/${encodeURIComponent(id)}/vote`, { still });
  if (!res.ok) throw new Error(`Vote not sent (${res.status})`);
  const data = (await res.json()) as { report?: ReportJson; gone?: boolean };
  return data.report ? fromJson(data.report) : null;
}
