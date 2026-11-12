/**
 * Google's own sign-in button (Google Identity Services). Nothing is loaded
 * from Google until someone asks to sign in, so opening OTW never tells Google.
 */

interface GoogleId {
  initialize(config: {
    client_id: string;
    nonce: string;
    callback: (response: { credential?: string }) => void;
  }): void;
  renderButton(
    el: HTMLElement,
    options: {
      type: 'standard';
      theme: 'outline' | 'filled_black';
      size: 'large';
      text: 'continue_with';
      shape: 'pill';
      logo_alignment: 'center';
      width: number;
    },
  ): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } };
  }
}

/** Google's button is at most this wide. */
const MAX_BUTTON_W = 400;

let loading: Promise<GoogleId> | null = null;

function loadGoogle(): Promise<GoogleId> {
  loading ??= new Promise<GoogleId>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    const failed = () => {
      loading = null; // so the next tap tries again
      script.remove();
      reject(new Error('Couldn’t reach Google. Check your internet and try again.'));
    };
    script.onload = () => {
      const id = window.google?.accounts?.id;
      if (id) resolve(id);
      else failed();
    };
    script.onerror = failed;
    document.head.appendChild(script);
  });
  return loading;
}

interface ButtonOptions {
  clientId: string;
  /** Ties Google's answer to this phone (see /api/account/google). */
  nonce: string;
  dark: boolean;
  width: number;
  /** Google's signed answer, to hand to the OTW server. */
  onCredential: (credential: string) => void;
}

/** Puts Google's button inside `el`. */
export async function showGoogleButton(el: HTMLElement, o: ButtonOptions): Promise<void> {
  const id = await loadGoogle();
  id.initialize({
    client_id: o.clientId,
    nonce: o.nonce,
    callback: (response) => {
      if (response.credential) o.onCredential(response.credential);
    },
  });
  el.replaceChildren();
  id.renderButton(el, {
    type: 'standard',
    theme: o.dark ? 'filled_black' : 'outline',
    size: 'large',
    text: 'continue_with',
    shape: 'pill',
    logo_alignment: 'center',
    width: Math.round(Math.min(MAX_BUTTON_W, Math.max(200, o.width))),
  });
}
