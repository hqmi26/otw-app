/**
 * Checks a Google sign-in token (an "ID token") the way Google's guide asks:
 * signed by one of Google's keys, made for OTW, and not expired. Used by
 * /api/account/google for the web button, and later by the phone apps.
 *
 * The person is known by `sub`, never by email: Google says an address can
 * change hands, and `sub` can't.
 */

export interface GoogleUser {
  /** Google's own ID for the account. */
  sub: string;
  /** Only when Google says the address is verified. */
  email: string | null;
  /** First name, as a starting point for the name groups see. */
  name: string | null;
}

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

interface Options {
  /** OTW's client ID from the Google Cloud console. Not a secret. */
  clientId: string;
  /** The value this phone asked Google to put in the token, so a copied token is no use on another phone. */
  nonce: string;
  /** Where the signing keys are; Google's own unless a test says otherwise. */
  certsUrl?: string;
  /** Unix seconds; for tests. */
  now?: number;
}

const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
/** Phones and servers disagree about the time by a little. */
const CLOCK_SLACK_S = 60;

// Google's keys change every few days, so they're kept in memory only as long as Google says.
let cached: { url: string; keys: Jwk[]; until: number } | null = null;

async function googleKeys(url: string, fresh: boolean): Promise<Jwk[]> {
  if (!fresh && cached && cached.url === url && cached.until > Date.now()) return cached.keys;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google keys: ${res.status}`);
  const data = (await res.json()) as { keys?: Jwk[] };
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1] ?? 3600);
  cached = { url, keys: data.keys ?? [], until: Date.now() + Math.min(maxAge, 86400) * 1000 };
  return cached.keys;
}

function bytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function json(base64url: string): Record<string, unknown> | null {
  try {
    const data: unknown = JSON.parse(new TextDecoder().decode(bytes(base64url)));
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The Google account a token belongs to, or null if the token can't be trusted. Throws only if Google's keys can't be fetched. */
export async function verifyGoogleToken(token: string, options: Options): Promise<GoogleUser | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const header = json(parts[0]);
  const claims = json(parts[1]);
  if (!header || !claims || header.alg !== 'RS256' || typeof header.kid !== 'string') return null;

  const now = options.now ?? Math.floor(Date.now() / 1000);
  const { aud, iss, exp, sub, nonce } = claims;
  if (aud !== options.clientId) return null; // made for another app
  if (typeof iss !== 'string' || !ISSUERS.includes(iss)) return null;
  if (typeof exp !== 'number' || exp < now - CLOCK_SLACK_S) return null;
  if (typeof sub !== 'string' || !sub || sub.length > 64) return null;
  if (nonce !== options.nonce) return null; // asked for by another phone

  const url = options.certsUrl ?? GOOGLE_CERTS;
  let key = (await googleKeys(url, false)).find((k) => k.kid === header.kid);
  // A key we haven't seen: Google may have just changed them.
  if (!key) key = (await googleKeys(url, true)).find((k) => k.kid === header.kid);
  if (!key || key.kty !== 'RSA') return null;

  let signed = false;
  try {
    const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    const publicKey = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: key.n, e: key.e }, algorithm, false, ['verify']);
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    signed = await crypto.subtle.verify(algorithm, publicKey, bytes(parts[2]), data);
  } catch {
    return null;
  }
  if (!signed) return null;

  const { email, email_verified: verified, given_name: given } = claims;
  return {
    sub,
    email: typeof email === 'string' && verified === true && email.length <= 254 ? email.toLowerCase() : null,
    name: typeof given === 'string' ? given.trim().slice(0, 20) || null : null,
  };
}
