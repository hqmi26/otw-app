import { WAKE_MP4, WAKE_WEBM } from './wakeMedia';

/*
 * Keeps the screen on while driving.
 *
 * Uses the browser's screen wake lock, and asks again each time OTW comes back
 * on screen (the lock ends when you switch to WhatsApp to send the ETA, say).
 * Where there's no wake lock, or the phone refuses it, a tiny silent video plays
 * on a loop instead, which phones treat as "something is playing". It's muted,
 * so it doesn't stop the driver's music.
 */

let wanted = false;
let lock: WakeLockSentinel | null = null;
let asking = false;
let video: HTMLVideoElement | null = null;

function makeVideo() {
  const v = document.createElement('video');
  v.muted = true;
  v.setAttribute('muted', '');
  v.setAttribute('playsinline', '');
  v.setAttribute('aria-hidden', 'true');
  for (const [type, src] of [
    ['webm', WAKE_WEBM],
    ['mp4', WAKE_MP4],
  ]) {
    const source = document.createElement('source');
    source.type = `video/${type}`;
    source.src = src;
    v.appendChild(source);
  }
  v.addEventListener('loadedmetadata', () => {
    // The webm is under a second long and simply loops; the mp4 is longer and
    // gets nudged back before it ends.
    if (v.duration <= 1) v.loop = true;
    else
      v.addEventListener('timeupdate', () => {
        if (v.currentTime > 0.5) v.currentTime = Math.random();
      });
  });
  return v;
}

async function acquire() {
  if (!wanted || lock || asking || document.visibilityState !== 'visible') return;
  asking = true;
  try {
    if ('wakeLock' in navigator) {
      try {
        const l = await navigator.wakeLock.request('screen');
        if (!wanted) {
          void l.release().catch(() => {});
          return;
        }
        lock = l;
        l.addEventListener('release', () => {
          if (lock === l) lock = null;
        });
        video?.pause();
        return;
      } catch {
        // Refused (e.g. a battery saver): fall back to the video.
      }
    }
    video ??= makeVideo();
    try {
      await video.play();
    } catch {
      // iPhone only plays it after a tap: try again on the next touch.
      document.addEventListener('pointerdown', onTouch, { once: true });
    }
  } finally {
    asking = false;
  }
}

function onTouch() {
  void acquire();
}

function onVisible() {
  if (document.visibilityState === 'visible') void acquire();
}

/** Call from the tap that starts the trip, so iPhones allow the video if it's needed. */
export function keepScreenOn() {
  if (!wanted) {
    wanted = true;
    document.addEventListener('visibilitychange', onVisible);
  }
  void acquire();
}

export function letScreenSleep() {
  wanted = false;
  document.removeEventListener('visibilitychange', onVisible);
  document.removeEventListener('pointerdown', onTouch);
  void lock?.release().catch(() => {});
  lock = null;
  video?.pause();
}
