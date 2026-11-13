/**
 * /api/family/* – the public test's family server, replaced by /api/account.
 *
 * An app left open since before the update still calls this. It gets a plain
 * "open the app again" answer. Never a 401: that makes the old app forget its
 * family key, and the key is what carries someone over to their account.
 */
export const onRequest = () =>
  new Response(JSON.stringify({ error: 'OTW was updated. Close the app and open it again.' }), {
    status: 503,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
