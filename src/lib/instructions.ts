import type { RouteStep } from './api';
import type { HazardType } from './models';

/** Language for turn instructions and the voice. */
export type Lang = 'en' | 'ms';

type StepLike = Pick<RouteStep, 'type' | 'modifier' | 'exit' | 'road'>;

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

const SIDE_MS: Record<string, string> = { left: 'kiri', right: 'kanan' };

function side(modifier: string): 'left' | 'right' {
  return modifier.includes('left') ? 'left' : 'right';
}

function describeEn(step: StepLike): string {
  const dir = step.modifier ?? '';
  const onto = step.road ? ` onto ${step.road}` : '';
  switch (step.type) {
    case 'depart':
      return step.road ? `Head out on ${step.road}` : 'Head out';
    case 'arrive':
      return 'You have arrived';
    case 'stop':
      return `Stop at ${step.road || 'your stop'}`;
    case 'merge':
      return `Merge${onto}`;
    case 'on ramp':
      return `Take the ramp${dir ? ` on the ${side(dir)}` : ''}${onto}`;
    case 'off ramp':
      return `Take the exit${dir ? ` on the ${side(dir)}` : ''}${onto}`;
    case 'fork':
      return `Keep ${side(dir)} at the fork${onto}`;
    case 'roundabout':
    case 'rotary':
      return step.exit ? `At the roundabout, take exit ${step.exit}${onto}` : `Go through the roundabout${onto}`;
    case 'roundabout turn':
    case 'turn':
    case 'end of road':
      if (dir === 'uturn') return `Make a U-turn${onto}`;
      if (dir === 'straight') return `Go straight${onto}`;
      if (dir.startsWith('slight')) return `Turn slightly ${side(dir)}${onto}`;
      return `Turn ${dir}${onto}`;
    case 'new name':
    case 'continue':
      if (dir && dir !== 'straight') return `Keep ${side(dir)}${onto}`;
      return step.road ? `Continue on ${step.road}` : 'Continue straight';
    default:
      return step.road ? `Continue on ${step.road}` : 'Continue';
  }
}

function describeMs(step: StepLike): string {
  const dir = step.modifier ?? '';
  const ke = step.road ? ` ke ${step.road}` : '';
  const s = SIDE_MS[side(dir)];
  switch (step.type) {
    case 'depart':
      return step.road ? `Mula di ${step.road}` : 'Mula perjalanan';
    case 'arrive':
      return 'Anda telah sampai';
    case 'stop':
      return `Berhenti di ${step.road || 'hentian anda'}`;
    case 'merge':
      return `Masuk${ke || ' ke laluan'}`;
    case 'on ramp':
      return `Ambil susur masuk${dir ? ` di sebelah ${s}` : ''}${ke}`;
    case 'off ramp':
      return `Ambil susur keluar${dir ? ` di sebelah ${s}` : ''}${ke}`;
    case 'fork':
      return `Ikut ${s} di simpang${ke}`;
    case 'roundabout':
    case 'rotary':
      return step.exit ? `Di bulatan, ambil susur keluar ke-${step.exit}${ke}` : `Lalu bulatan${ke}`;
    case 'roundabout turn':
    case 'turn':
    case 'end of road':
      if (dir === 'uturn') return `Buat pusingan U${ke}`;
      if (dir === 'straight') return `Terus lurus${ke}`;
      if (dir.startsWith('slight')) return `Belok sedikit ke ${s}${ke}`;
      if (dir.startsWith('sharp')) return `Belok tajam ke ${s}${ke}`;
      return `Belok ${s}${ke}`;
    case 'new name':
    case 'continue':
      if (dir && dir !== 'straight') return `Ikut ${s}${ke}`;
      return step.road ? `Terus di ${step.road}` : 'Terus lurus';
    default:
      return step.road ? `Terus di ${step.road}` : 'Terus';
  }
}

/** Turn instruction for screen and voice, e.g. "Turn left onto Jalan Ampang" / "Belok kiri ke Jalan Ampang". */
export function instruction(step: StepLike, lang: Lang): string {
  return lang === 'ms' ? describeMs(step) : describeEn(step);
}

/**
 * Whether a step is said out loud. Steps where the driver just carries on along
 * the road ("Continue on Jalan Lintas", "Go straight" as the name changes) are
 * shown on screen but not spoken, so the voice only talks when there's
 * something to do.
 */
export function worthSaying(step: Pick<RouteStep, 'type' | 'modifier'>): boolean {
  switch (step.type) {
    case 'depart':
    case 'notification':
    case 'exit roundabout':
    case 'exit rotary':
      return false;
    case 'new name':
    case 'continue':
    case 'turn':
      return step.modifier != null && step.modifier !== 'straight';
    default:
      return true;
  }
}

/** The next step the driver has to act on, from `index` on, and the metres to it. */
export function nextAction(
  steps: Pick<RouteStep, 'type' | 'modifier' | 'distance'>[],
  index: number,
  metres: number,
): { index: number; distance: number } {
  let i = index;
  let d = metres;
  while (i < steps.length - 1 && !worthSaying(steps[i])) {
    d += steps[i].distance;
    i++;
  }
  return { index: i, distance: d };
}

/** The small "then…" line under the instruction card. */
export function thenText(step: StepLike, lang: Lang): string {
  return `${lang === 'ms' ? 'Kemudian' : 'Then'} ${lowerFirst(instruction(step, lang))}`;
}

/** Distances written out for speech, so the voice doesn't read "m" as a letter. */
export function spokenDistance(metres: number, lang: Lang): string {
  if (metres < 1000) {
    const m = Math.max(50, Math.round(metres / 50) * 50);
    return lang === 'ms' ? `${m} meter` : `${m} metres`;
  }
  const km = (metres / 1000).toFixed(1).replace(/\.0$/, '');
  return lang === 'ms' ? `${km} kilometer` : `${km} kilometres`;
}

/** Spoken ~400 m before a turn: "In 300 metres, turn left…" / "Dalam 300 meter, belok kiri…". */
export function aheadPhrase(metres: number, step: StepLike, lang: Lang): string {
  const lead = lang === 'ms' ? 'Dalam' : 'In';
  return `${lead} ${spokenDistance(metres, lang)}, ${lowerFirst(instruction(step, lang))}`;
}

const HAZARD_NAMES: Record<HazardType, Record<Lang, string>> = {
  accident: { en: 'Accident', ms: 'Kemalangan' },
  jam: { en: 'Traffic jam', ms: 'Kesesakan' },
  flood: { en: 'Flood', ms: 'Banjir' },
  roadblock: { en: 'Roadblock', ms: 'Sekatan jalan' },
  hazard: { en: 'Object on the road', ms: 'Objek di jalan' },
  pothole: { en: 'Pothole', ms: 'Lubang jalan' },
  camera: { en: 'Speed camera', ms: 'Kamera laju' },
};

export function hazardName(type: HazardType, lang: Lang): string {
  return HAZARD_NAMES[type][lang];
}

/** Spoken when a report is on the road ahead: "Flood reported ahead, in 600 metres." */
export function hazardPhrase(type: HazardType, metres: number, lang: Lang): string {
  if (type === 'camera') {
    return lang === 'ms'
      ? `Kamera laju di depan, dalam ${spokenDistance(metres, lang)}. Jaga kelajuan.`
      : `Speed camera ahead, in ${spokenDistance(metres, lang)}. Watch your speed.`;
  }
  return lang === 'ms'
    ? `${hazardName(type, lang)} dilaporkan di depan, dalam ${spokenDistance(metres, lang)}.`
    : `${hazardName(type, lang)} reported ahead, in ${spokenDistance(metres, lang)}.`;
}

export const PHRASES: Record<'start' | 'arrived' | 'rerouted' | 'stopAdded' | 'test', Record<Lang, string>> = {
  start: { en: 'Jom! Let’s go.', ms: 'Jom! Kita gerak.' },
  arrived: { en: 'You have arrived. Dah sampai!', ms: 'Dah sampai! Anda telah tiba.' },
  rerouted: { en: 'Route updated.', ms: 'Laluan dikemas kini.' },
  stopAdded: { en: 'Stop added. Route updated.', ms: 'Hentian ditambah. Laluan dikemas kini.' },
  test: {
    en: 'In 300 metres, turn left onto Jalan Ampang.',
    ms: 'Dalam 300 meter, belok kiri ke Jalan Ampang.',
  },
};

/** Rotation for a straight-up arrow icon, by OSRM modifier. */
export function arrowRotation(modifier?: string): number {
  switch (modifier) {
    case 'slight right':
      return 40;
    case 'right':
      return 90;
    case 'sharp right':
      return 135;
    case 'uturn':
      return 180;
    case 'sharp left':
      return -135;
    case 'left':
      return -90;
    case 'slight left':
      return -40;
    default:
      return 0;
  }
}
