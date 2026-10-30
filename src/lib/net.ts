/*
 * Rush protection for the free services OTW calls straight from the phone
 * (Valhalla and OSRM for routes, Photon for search).
 *
 * When lots of people use OTW at once, these services get slow or answer "too
 * busy". Instead of hanging on "Finding routes…" (what happened to TuJu), each
 * request gets a time limit; a service that runs out of time or says it's busy
 * is left alone for a minute, so OTW goes straight to the backup and doesn't
 * add to the crowd. Answers are also remembered for a short while, so going
 * back and forth between screens doesn't ask again.
 */

/** A service is too busy (or too slow) right now. */
export class BusyError extends Error {
  name = 'BusyError';
  constructor(service: string) {
    super(`${service} is busy`);
  }
}

/** How long a busy service is left alone, unless it says otherwise. */
const PAUSE_MS = 60_000;
const pausedUntil = new Map<string, number>();

function pause(service: string, ms: number) {
  pausedUntil.set(service, Date.now() + Math.min(Math.max(ms, 10_000), 5 * 60_000));
}

/** Seconds from a "Retry-After" header, if the service sent one. */
function retryAfterMs(res: Response): number {
  const s = Number(res.headers.get('retry-after'));
  return Number.isFinite(s) && s > 0 ? s * 1000 : PAUSE_MS;
}

/**
 * fetch() with a time limit. Throws BusyError when the service is resting, too
 * slow, or answers 429/502/503/504; the caller's own abort still throws AbortError.
 */
export async function ask(
  service: string,
  url: string,
  { signal, timeoutMs }: { signal?: AbortSignal; timeoutMs: number },
): Promise<Response> {
  if ((pausedUntil.get(service) ?? 0) > Date.now()) throw new BusyError(service);
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (signal?.aborted) ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  let timedOut = false;
  const timer = window.setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if ([429, 502, 503, 504].includes(res.status)) {
      pause(service, retryAfterMs(res));
      throw new BusyError(service);
    }
    return res;
  } catch (e) {
    if (timedOut && !signal?.aborted) {
      pause(service, PAUSE_MS);
      throw new BusyError(service);
    }
    throw e;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Remembers answers for `ttlMs`, keeping at most `max` of them. Only successes go in. */
export function shortMemory<T>(ttlMs: number, max = 30) {
  const store = new Map<string, { at: number; value: T }>();
  return {
    get(key: string): T | undefined {
      const hit = store.get(key);
      if (hit && Date.now() - hit.at < ttlMs) return hit.value;
      store.delete(key);
      return undefined;
    },
    set(key: string, value: T) {
      store.delete(key);
      store.set(key, { at: Date.now(), value });
      if (store.size > max) store.delete(store.keys().next().value!);
    },
  };
}
