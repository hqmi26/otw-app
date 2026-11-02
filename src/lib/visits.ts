/*
 * Tells the OTW server (functions/api/visit.ts) "one more phone opened OTW today"
 * at most once a day, and "a trip started". Only the phone type goes with it:
 * no name, no location, no ID. If it fails (offline, or `npm run dev` with no
 * server behind it), nothing happens.
 */

type VisitKind = 'opened' | 'trip';

const SENT_KEY = 'otw-visit-day';

function device(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'iphone';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

function send(kind: VisitKind) {
  fetch('/api/visit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, device: device() }),
    keepalive: true,
  }).catch(() => {});
}

/** Counted once a day per phone, however often it's opened. */
export function countOpen() {
  const day = new Date().toDateString();
  try {
    if (localStorage.getItem(SENT_KEY) === day) return;
    localStorage.setItem(SENT_KEY, day);
  } catch {
    // Private mode without storage: count it anyway.
  }
  send('opened');
}

export function countTrip() {
  send('trip');
}
