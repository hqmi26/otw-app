import type { Lang } from './instructions';

/*
 * Speaks navigation instructions with the phone's built-in voice.
 * For Bahasa Melayu we prefer a Malay voice, then Indonesian (close enough to
 * be understood), then whatever the phone has.
 *
 * Phones' voices sometimes get stuck (paused, or never starting), so each line
 * gets one retry. The same line twice within a few seconds (e.g. right after a
 * reroute) is said once, and a queued line that waited too long is dropped,
 * because "accident in 600 metres" is no longer true a minute later.
 */

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

/** The same words again within this long add nothing. */
const REPEAT_WINDOW_MS = 10_000;
/** A queued line older than this is out of date. */
const STALE_MS = 20_000;
/** A line that hasn't started by now is stuck. */
const START_TIMEOUT_MS = 2_500;

// Chrome loads its voice list late; asking once early makes it ready by the first turn.
if (supported) window.speechSynthesis.getVoices();

function pickVoice(lang: Lang): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const find = (test: (v: SpeechSynthesisVoice) => boolean) => voices.find(test);
  if (lang === 'ms') {
    return (
      find((v) => v.lang.replace('_', '-') === 'ms-MY') ??
      find((v) => v.lang.toLowerCase().startsWith('ms')) ??
      find((v) => v.lang.replace('_', '-') === 'id-ID') ??
      find((v) => v.lang.toLowerCase().startsWith('id'))
    );
  }
  return (
    find((v) => v.lang.replace('_', '-') === 'en-MY') ??
    find((v) => v.lang.startsWith('en-GB')) ??
    find((v) => v.lang.startsWith('en'))
  );
}

interface Line {
  text: string;
  lang: Lang;
  at: number;
}

let queue: Line[] = [];
/** The utterance being said now; anything from an older one is ignored. */
let current: SpeechSynthesisUtterance | null = null;
let watchdog = 0;
let lastSaid = { text: '', at: 0 };
/** Goes up on every stopSpeaking(), so a retry from before it is dropped. */
let generation = 0;

function finish(u: SpeechSynthesisUtterance) {
  if (current !== u) return;
  window.clearTimeout(watchdog);
  current = null;
  next();
}

function next() {
  if (current) return;
  let line = queue.shift();
  while (line && Date.now() - line.at > STALE_MS) line = queue.shift();
  if (line) say(line, 0);
}

function say(line: Line, attempt: number) {
  const synth = window.speechSynthesis;
  const u = new SpeechSynthesisUtterance(line.text);
  const voice = attempt === 0 ? pickVoice(line.lang) : undefined; // the retry uses the default voice
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? (line.lang === 'ms' ? 'ms-MY' : 'en-GB');
  u.rate = 1;
  let started = false;
  u.onstart = () => {
    started = true;
    lastSaid = { text: line.text, at: Date.now() };
  };
  u.onend = () => finish(u);
  u.onerror = (e) => {
    if (current !== u) return; // cancelled on purpose
    if (attempt === 0 && e.error !== 'not-allowed') retry(u, line);
    else finish(u);
  };
  current = u;
  if (synth.paused) synth.resume();
  synth.speak(u);
  window.clearTimeout(watchdog);
  watchdog = window.setTimeout(() => {
    if (current !== u || started) return;
    if (attempt === 0) retry(u, line);
    else {
      synth.cancel();
      finish(u);
    }
  }, START_TIMEOUT_MS);
}

function retry(u: SpeechSynthesisUtterance, line: Line) {
  if (current !== u) return;
  window.clearTimeout(watchdog);
  current = null;
  window.speechSynthesis.cancel();
  // Speaking straight after cancel() is sometimes dropped, so wait a moment.
  const gen = generation;
  window.setTimeout(() => {
    if (gen !== generation) return;
    if (!current) say(line, 1);
    else queue.unshift(line);
  }, 200);
}

/**
 * Cuts off whatever is being said, unless `queue` is set: then it waits its turn.
 * `repeat` says it even if the same words were just said (e.g. the "Play a sample" button).
 */
export function speak(
  text: string,
  lang: Lang = 'en',
  { queue: wait = false, repeat = false }: { queue?: boolean; repeat?: boolean } = {},
) {
  if (!supported) return;
  const now = Date.now();
  if (!repeat && text === lastSaid.text && now - lastSaid.at < REPEAT_WINDOW_MS) return;
  if (!repeat && queue.some((l) => l.text === text)) return;
  if (!wait) stopSpeaking();
  queue.push({ text, lang, at: now });
  next();
}

export function stopSpeaking() {
  if (!supported) return;
  generation++;
  queue = [];
  window.clearTimeout(watchdog);
  current = null;
  window.speechSynthesis.cancel();
}
