import type { Lang } from './instructions';

/*
 * Speaks navigation instructions with the phone's built-in voice.
 * For Bahasa Melayu we prefer a Malay voice, then Indonesian (close enough to
 * be understood), then whatever the phone has.
 */

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

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

export function speak(text: string, lang: Lang = 'en') {
  if (!supported) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(lang);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? (lang === 'ms' ? 'ms-MY' : 'en-GB');
  u.rate = 1;
  synth.speak(u);
}

export function stopSpeaking() {
  if (supported) window.speechSynthesis.cancel();
}
