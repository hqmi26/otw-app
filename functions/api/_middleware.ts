/**
 * Runs before every /api function. The Android app calls from https://localhost,
 * which browsers treat as a different site from OTW's own, so this lets that one
 * address in. It also passes the call on as if it came from OTW's own site, so
 * the checks inside each function treat the app the same as the website.
 */

const APP_ORIGIN = 'https://localhost';

type Context = { request: Request; next: (request?: Request) => Promise<Response> };

export const onRequest = async ({ request, next }: Context) => {
  if (request.headers.get('origin') !== APP_ORIGIN) return next();

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': APP_ORIGIN,
        'access-control-allow-methods': '*',
        'access-control-allow-headers': '*',
        'access-control-max-age': '86400',
      },
    });
  }

  const headers = new Headers(request.headers);
  headers.set('origin', new URL(request.url).origin);
  const res = await next(new Request(request, { headers }));

  const reply = new Response(res.body, res);
  reply.headers.set('access-control-allow-origin', APP_ORIGIN);
  reply.headers.set('vary', 'origin');
  return reply;
};
