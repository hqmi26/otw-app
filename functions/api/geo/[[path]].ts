/**
 * /api/geo/* – GrabMaps (through Amazon Location) and TomTom traffic. Runs on
 * Cloudflare Pages next to the app, so the keys stay here and never reach the phone.
 *
 * Without AWS_LOCATION_KEY the app carries on with its free services (see api.ts),
 * and without TOMTOM_KEY it shows no traffic colours.
 *
 * Amazon's rules (AWS Service Terms, section 82) that shape this file:
 *  - Nothing from here is cached on the server. A result that will be kept
 *    (saved places, recents) must be asked for as Storage: see `keep`.
 *  - Results are never written into our own place list, which is under the ODbL.
 */

interface Env {
  AWS_LOCATION_KEY?: string;
  TOMTOM_KEY?: string;
}

type Coord = [number, number];
type Context = { request: Request; env: Env; params: { path?: string[] } };

/** Amazon's Malaysia region. GrabMaps is only served from here and Singapore. */
const REGION = 'ap-southeast-5';
const MAPS = `https://maps.geo.${REGION}.amazonaws.com/`;
const PLACES = `https://places.geo.${REGION}.amazonaws.com/v2/`;
const ROUTES = `https://routes.geo.${REGION}.amazonaws.com/v2/routes`;
const MALAYSIA = { IncludeCountries: ['MYS'] };

const reply = (status: number, body: object) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const isCoord = (v: unknown): v is Coord =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n));

/** These cost money, so only OTW's own pages may call them. */
function fromOurApp(request: Request): boolean {
  const from = request.headers.get('origin') ?? request.headers.get('referer');
  if (!from) return false;
  try {
    return new URL(from).hostname === new URL(request.url).hostname;
  } catch {
    return false;
  }
}

async function askAmazon(url: string, key: string, body: object): Promise<Response> {
  const res = await fetch(`${url}?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return reply(res.status, { error: `Amazon said ${res.status}` });
  return reply(200, await res.json());
}

/** The JSON body each POST turns into, or null when it makes no sense. Only OTW's own options reach Amazon. */
const REQUESTS: Record<string, (d: Record<string, unknown>) => { url: string; body: object } | null> = {
  suggest({ query, near }) {
    if (typeof query !== 'string' || !query.trim() || !isCoord(near)) return null;
    return {
      url: `${PLACES}suggest`,
      body: {
        QueryText: query.trim().slice(0, 200),
        BiasPosition: near,
        Filter: MALAYSIA,
        MaxResults: 10,
        AdditionalFeatures: ['Core'],
      },
    };
  },
  nearby({ near, categories }) {
    const list = Array.isArray(categories) ? categories : [];
    if (!isCoord(near) || !list.length || !list.every((c) => typeof c === 'string' && /^[a-z_-]+$/.test(c))) return null;
    return {
      url: `${PLACES}search-nearby`,
      body: {
        QueryPosition: near,
        QueryRadius: 20_000,
        Filter: { ...MALAYSIA, IncludeCategories: list.slice(0, 8) },
        MaxResults: 20,
      },
    };
  },
  // The result goes into saved places or recents, so it's asked for as Storage.
  keep({ name, near }) {
    if (typeof name !== 'string' || !name.trim() || !isCoord(near)) return null;
    return {
      url: `${PLACES}search-text`,
      body: {
        QueryText: name.trim().slice(0, 200),
        BiasPosition: near,
        Filter: MALAYSIA,
        MaxResults: 5,
        IntendedUse: 'Storage',
      },
    };
  },
  // The name for a dropped pin, which goes into recents.
  reverse({ near }) {
    if (!isCoord(near)) return null;
    return {
      url: `${PLACES}reverse-geocode`,
      body: { QueryPosition: near, QueryRadius: 200, MaxResults: 1, IntendedUse: 'Storage' },
    };
  },
  routes({ points, choices }) {
    if (!Array.isArray(points) || points.length < 2 || points.length > 3 || !points.every(isCoord)) return null;
    const stops = points.slice(1, -1) as Coord[];
    return {
      url: ROUTES,
      body: {
        Origin: points[0],
        Destination: points[points.length - 1],
        ...(stops.length > 0 && { Waypoints: stops.map((Position) => ({ Position })) }),
        DepartNow: true,
        TravelMode: 'Car',
        // GrabMaps returns no steps at all with the default step type.
        TravelStepType: 'TurnByTurn',
        LegGeometryFormat: 'Simple',
        LegAdditionalFeatures: ['Summary'],
        MaxAlternatives: choices === true ? 2 : 0,
      },
    };
  },
};

/** Points the map's own links back at this file, and takes out any key. */
function ourLinks(text: string, origin: string): string {
  return text.replaceAll(MAPS, `${origin}/api/geo/map/`).replace(/([?&])key=[^"&]*&?/g, '$1');
}

/** The map: the style first, then the tiles, fonts and icons it points to, all through here. */
async function mapFile(path: string[], request: Request, key: string): Promise<Response> {
  const url = new URL(request.url);
  let upstream: URL;
  if (path[0] === 'style') {
    const scheme = url.searchParams.get('scheme') === 'Dark' ? 'Dark' : 'Light';
    const design = url.searchParams.get('design') === 'Monochrome' ? 'Monochrome' : 'Standard';
    upstream = new URL(`${MAPS}v2/styles/${design}/descriptor?color-scheme=${scheme}`);
  } else if (path[0] === 'v2') {
    // Taken from the address as sent: font names have spaces in them, already encoded.
    upstream = new URL(`${MAPS}${url.pathname.slice(url.pathname.indexOf('/map/') + 5)}${url.search}`);
  } else {
    return reply(404, { error: 'Not found' });
  }
  upstream.searchParams.set('key', key);

  const res = await fetch(upstream);
  if (!res.ok) return reply(res.status, { error: `Amazon said ${res.status}` });
  if (!res.headers.get('content-type')?.includes('json')) return new Response(res.body, res);
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  return new Response(ourLinks(await res.text(), url.origin), { status: 200, headers });
}

async function trafficTile(path: string[], key: string): Promise<Response> {
  const [z, x, y] = path;
  if (path.length !== 3 || ![z, x, y].every((n) => /^\d+$/.test(n))) return reply(404, { error: 'Not found' });
  const res = await fetch(
    `https://api.tomtom.com/maps/orbis/traffic/tile/flow/${z}/${x}/${y}.png?apiVersion=1&tileSize=512&key=${encodeURIComponent(key)}`,
  );
  if (!res.ok) return reply(res.status, { error: `TomTom said ${res.status}` });
  return new Response(res.body, res);
}

export const onRequest = async ({ request, env, params }: Context) => {
  const [action, ...rest] = params.path ?? [];

  if (action === 'status') {
    return reply(200, { grab: !!env.AWS_LOCATION_KEY, traffic: !!env.TOMTOM_KEY });
  }
  if (!fromOurApp(request)) return reply(403, { error: 'Only for OTW' });

  if (request.method === 'GET') {
    if (action === 'map' && env.AWS_LOCATION_KEY) return mapFile(rest, request, env.AWS_LOCATION_KEY);
    if (action === 'traffic' && env.TOMTOM_KEY) return trafficTile(rest, env.TOMTOM_KEY);
    return reply(404, { error: 'Not found' });
  }

  const build = request.method === 'POST' && Object.hasOwn(REQUESTS, action) ? REQUESTS[action] : null;
  if (!build) return reply(404, { error: 'Not found' });
  if (!env.AWS_LOCATION_KEY) return reply(503, { error: 'GrabMaps is not set up' });

  let data: Record<string, unknown>;
  try {
    data = await request.json();
  } catch {
    return reply(400, { error: 'Expected JSON' });
  }
  const ask = build(data ?? {});
  if (!ask) return reply(400, { error: 'Bad request' });
  return askAmazon(ask.url, env.AWS_LOCATION_KEY, ask.body);
};
