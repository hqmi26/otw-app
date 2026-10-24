/** Speaks a navigation instruction with the phone's built-in voice. */
export function speak(text: string) {
  if (!('speechSynthesis' in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voice =
    synth.getVoices().find((v) => v.lang === 'en-MY') ??
    synth.getVoices().find((v) => v.lang.startsWith('en-GB')) ??
    synth.getVoices().find((v) => v.lang.startsWith('en'));
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? 'en-GB';
  u.rate = 1;
  synth.speak(u);
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
