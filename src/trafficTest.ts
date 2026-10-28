/**
 * KK live-traffic test (dev only, opened at /traffic-test.html).
 *
 * Asks TomTom for the speed right now vs the normal speed on Kota Kinabalu
 * roads, and for trip times with usual (historic) vs live traffic. If the live
 * times differ from the usual ones at rush hour, TomTom has real live data in
 * KK and is worth paying for. Every run is kept so evenings can be compared.
 */

type Point = [lat: number, lon: number];

interface RoadResult {
  name: string;
  current?: number;
  normal?: number;
  confidence?: number;
  closed?: boolean;
  error?: string;
}

interface TripResult {
  name: string;
  noTraffic?: number;
  usual?: number;
  live?: number;
  error?: string;
}

interface Run {
  at: number;
  roads: RoadResult[];
  trips: TripResult[];
}

const KEY: string = import.meta.env.VITE_TOMTOM_KEY ?? '';
const STORE = 'otw-traffic-test';
const EVERY_MS = 5 * 60 * 1000;
const MAX_RUNS = 200;

const CITY: Point = [5.98361, 116.07618];

const ROADS: { name: string; at: Point; kl?: boolean }[] = [
  { name: 'Jalan Tun Fuad Stephen (near city)', at: [5.99387, 116.08338] },
  { name: 'Jalan Tun Fuad Stephen (further north)', at: [6.01072, 116.11232] },
  { name: 'Jalan Tuaran', at: [6.01164, 116.14568] },
  { name: 'Jalan UMS', at: [6.03239, 116.12372] },
  { name: 'Jalan Lintas (north)', at: [5.98016, 116.11477] },
  { name: 'Jalan Lintas (south)', at: [5.95302, 116.09284] },
  { name: 'Jalan Penampang', at: [5.94635, 116.08132] },
  { name: 'Jalan Kolam', at: [5.96935, 116.0806] },
  // Same questions in KL, to see what well-covered roads look like.
  { name: 'KL: near KLCC', at: [3.1585, 101.719], kl: true },
  { name: 'KL: near Mid Valley', at: [3.118, 101.6785], kl: true },
];

const TRIPS: { name: string; from: Point; to: Point }[] = [
  { name: 'City → UMS', from: CITY, to: [6.03239, 116.12372] },
  { name: 'City → Penampang', from: CITY, to: [5.91518, 116.09918] },
  { name: 'Lintas → Inanam', from: [5.95302, 116.09284], to: [6.01164, 116.14568] },
];

async function getJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TomTom said ${res.status}`);
  return res.json();
}

async function checkRoad(name: string, [lat, lon]: Point): Promise<RoadResult> {
  try {
    const data = await getJson(
      `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${lat},${lon}&unit=KMPH&key=${KEY}`,
    );
    const d = data.flowSegmentData;
    return {
      name,
      current: d.currentSpeed,
      normal: d.freeFlowSpeed,
      confidence: d.confidence,
      closed: d.roadClosure,
    };
  } catch (e) {
    return { name, error: e instanceof Error ? e.message : String(e) };
  }
}

async function checkTrip(name: string, from: Point, to: Point): Promise<TripResult> {
  try {
    const data = await getJson(
      `https://api.tomtom.com/routing/1/calculateRoute/${from.join(',')}:${to.join(',')}/json` +
        `?traffic=true&departAt=now&computeTravelTimeFor=all&travelMode=car&key=${KEY}`,
    );
    const s = data.routes[0].summary;
    return {
      name,
      noTraffic: s.noTrafficTravelTimeInSeconds,
      usual: s.historicTrafficTravelTimeInSeconds,
      live: s.liveTrafficIncidentsTravelTimeInSeconds,
    };
  } catch (e) {
    return { name, error: e instanceof Error ? e.message : String(e) };
  }
}

function loadRuns(): Run[] {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Run[]) : [];
  } catch {
    return [];
  }
}

function saveRuns(runs: Run[]) {
  try {
    localStorage.setItem(STORE, JSON.stringify(runs.slice(-MAX_RUNS)));
  } catch {
    // Private mode or storage full: the page still works, it just forgets.
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const day = (t: number) => new Date(t).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
const mins = (sec?: number) => (sec == null ? '–' : `${Math.round(sec / 60)} min`);

/** How much slower than normal, as a whole percent. */
function slower(r: RoadResult) {
  if (r.current == null || !r.normal) return null;
  return Math.max(0, Math.round((1 - r.current / r.normal) * 100));
}

/** Live minus usual trip time, in seconds. */
function liveGap(t: TripResult) {
  return t.live != null && t.usual != null ? t.live - t.usual : null;
}

/** A gap big enough to mean TomTom used live speeds, not just its usual pattern. */
const isLiveGap = (t: TripResult) => {
  const gap = liveGap(t);
  return gap != null && t.usual != null && Math.abs(gap) >= Math.max(60, t.usual * 0.05);
};

function signedMins(sec: number | null) {
  if (sec == null) return '–';
  const m = Math.round(sec / 60);
  return m === 0 ? 'same' : `${m > 0 ? '+' : '−'}${Math.abs(m)} min`;
}

function verdict(run: Run) {
  const trips = run.trips.filter((t) => liveGap(t) != null);
  const live = trips.filter(isLiveGap);
  if (!trips.length) return { tone: 'warn', text: 'No trip times came back. Check the key or try again.' };
  if (live.length)
    return {
      tone: 'good',
      text: `${live.length} of ${trips.length} trips: the live time differs from the usual time, so TomTom is using live speeds in KK right now.`,
    };
  return {
    tone: 'neutral',
    text: 'Live time = usual time on every trip right now. That is normal when roads are quiet. The real test is 5–7pm on a weekday.',
  };
}

function summary(runs: Run[]) {
  return runs
    .map((run) => {
      const roads = run.roads
        .map((r) =>
          r.error
            ? `  ${r.name}: error ${r.error}`
            : `  ${r.name}: ${r.current}/${r.normal} km/h, ${slower(r)}% slower, confidence ${r.confidence?.toFixed(2)}`,
        )
        .join('\n');
      const trips = run.trips
        .map((t) =>
          t.error
            ? `  ${t.name}: error ${t.error}`
            : `  ${t.name}: no traffic ${mins(t.noTraffic)}, usual ${mins(t.usual)}, live ${mins(t.live)} (${signedMins(liveGap(t))})`,
        )
        .join('\n');
      return `${day(run.at)} ${clock(run.at)}\n${roads}\n${trips}`;
    })
    .join('\n\n');
}

const root = document.getElementById('app')!;
let runs = loadRuns();
let busy = false;
let auto = true;
let timer: number | undefined;

function render(note = '') {
  const last = runs.at(-1);
  const v = last ? verdict(last) : null;

  root.innerHTML = `
    <header class="head">
      <h1>KK live traffic test</h1>
      <p class="muted">TomTom · ${auto ? 'checks every 5 min while this page is open' : 'auto-check off'}</p>
      <div class="actions">
        <button id="run" class="primary" ${busy || !KEY ? 'disabled' : ''}>${busy ? 'Checking…' : 'Check now'}</button>
        <button id="copy" ${runs.length ? '' : 'disabled'}>Copy results</button>
        <label class="toggle"><input id="auto" type="checkbox" ${auto ? 'checked' : ''}/> Auto</label>
      </div>
      ${note ? `<p class="note">${esc(note)}</p>` : ''}
    </header>

    ${!KEY ? '<p class="card warn">No TomTom key. Put it in <b>.env.local</b> as VITE_TOMTOM_KEY=… and restart the dev server.</p>' : ''}

    ${
      last && v
        ? `
      <p class="card ${v.tone}"><b>${clock(last.at)}</b> · ${esc(v.text)}</p>

      <h2>Trips</h2>
      <div class="table">
        <div class="row th"><span>Trip</span><span>No traffic</span><span>Usual</span><span>Live</span><span>Live vs usual</span></div>
        ${last.trips
          .map((t) =>
            t.error
              ? `<div class="row"><span>${esc(t.name)}</span><span class="err">${esc(t.error)}</span></div>`
              : `<div class="row"><span>${esc(t.name)}</span><span>${mins(t.noTraffic)}</span><span>${mins(t.usual)}</span><span>${mins(t.live)}</span><span class="${isLiveGap(t) ? 'hit' : ''}">${signedMins(liveGap(t))}</span></div>`,
          )
          .join('')}
      </div>

      <h2>Roads</h2>
      <p class="muted small">Speed now vs normal speed. Confidence is TomTom's own score from 0 to 1: higher means more real cars behind the number.</p>
      <div class="table">
        <div class="row th"><span>Road</span><span>Now</span><span>Normal</span><span>Slower</span><span>Confidence</span></div>
        ${last.roads
          .map((r) =>
            r.error
              ? `<div class="row"><span>${esc(r.name)}</span><span class="err">${esc(r.error)}</span></div>`
              : `<div class="row${ROADS.find((x) => x.name === r.name)?.kl ? ' kl' : ''}"><span>${esc(r.name)}${r.closed ? ' <b class="err">closed</b>' : ''}</span><span>${r.current} km/h</span><span>${r.normal} km/h</span><span>${slower(r)}%</span><span><span class="bar"><i style="width:${Math.round((r.confidence ?? 0) * 100)}%"></i></span>${(r.confidence ?? 0).toFixed(2)}</span></div>`,
          )
          .join('')}
      </div>
    `
        : ''
    }

    ${
      runs.length > 1
        ? `
      <h2>Earlier checks</h2>
      <div class="table">
        <div class="row th"><span>When</span><span>KK roads slower</span><span>KK confidence</span><span>Trips live vs usual</span></div>
        ${runs
          .slice()
          .reverse()
          .map((run) => {
            const kk = run.roads.filter((r) => !r.error && !ROADS.find((x) => x.name === r.name)?.kl);
            const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
            const slow = avg(kk.map((r) => slower(r) ?? 0));
            const conf = avg(kk.map((r) => r.confidence ?? 0));
            return `<div class="row"><span>${day(run.at)} ${clock(run.at)}</span><span>${slow == null ? '–' : `${Math.round(slow)}%`}</span><span>${conf == null ? '–' : conf.toFixed(2)}</span><span>${run.trips.map((t) => signedMins(liveGap(t))).join(' · ')}</span></div>`;
          })
          .join('')}
      </div>
      <button id="clear" class="link">Clear history</button>
    `
        : ''
    }
  `;

  root.querySelector<HTMLButtonElement>('#run')?.addEventListener('click', () => void runCheck());
  root.querySelector<HTMLButtonElement>('#copy')?.addEventListener('click', () => void copy());
  root.querySelector<HTMLInputElement>('#auto')?.addEventListener('change', (e) => {
    auto = (e.target as HTMLInputElement).checked;
    schedule();
    render();
  });
  root.querySelector<HTMLButtonElement>('#clear')?.addEventListener('click', () => {
    runs = runs.slice(-1);
    saveRuns(runs);
    render();
  });
}

async function runCheck() {
  if (busy || !KEY) return;
  busy = true;
  render();
  const [roads, trips] = await Promise.all([
    Promise.all(ROADS.map((r) => checkRoad(r.name, r.at))),
    Promise.all(TRIPS.map((t) => checkTrip(t.name, t.from, t.to))),
  ]);
  runs = [...runs, { at: Date.now(), roads, trips }];
  saveRuns(runs);
  busy = false;
  render();
}

async function copy() {
  try {
    await navigator.clipboard.writeText(summary(runs));
    render('Copied. Paste it in the chat with Claude.');
  } catch {
    render('Could not copy here. Select the tables and copy by hand.');
  }
}

function schedule() {
  window.clearInterval(timer);
  if (auto) timer = window.setInterval(() => void runCheck(), EVERY_MS);
}

render();
schedule();
void runCheck();
