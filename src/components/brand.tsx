import type { SavedKind, HazardType } from '../lib/models';
import { arrowRotation } from '../lib/instructions';
import {
  AlertIcon,
  CarIcon,
  FlagIcon,
  FloodIcon,
  HomeIcon,
  PinIcon,
  PotholeIcon,
  RoadblockIcon,
  RoundaboutIcon,
  SchoolIcon,
  StarIcon,
  TrafficIcon,
  TurnArrowIcon,
  WorkIcon,
} from './icons';

/** Arrow for a turn: rotated for left/right, a flag on arrival, a ring for roundabouts. */
export function ManeuverIcon({ type, modifier, size = 44 }: { type: string; modifier?: string; size?: number }) {
  if (type === 'arrive') return <FlagIcon size={size} />;
  if (type === 'roundabout' || type === 'rotary') return <RoundaboutIcon size={size} />;
  return <TurnArrowIcon size={size} style={{ transform: `rotate(${arrowRotation(modifier)}deg)` }} />;
}

/** The OTW mark: a ring with an arrow, the "O" of the logo. */
export function OtwMark({ size = 64, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="26.5" fill="none" stroke={color} strokeWidth="11" />
      <path d="M32 18 L41 44 L32 38.5 L23 44 Z" fill={color} />
    </svg>
  );
}

/** "OTW" wordmark with the ring as the O. */
export function OtwWordmark({ size = 30 }: { size?: number }) {
  return (
    <span className="wordmark" role="img" aria-label="OTW">
      <OtwMark size={size} />
      <span style={{ fontSize: size * 1.13 }}>TW</span>
    </span>
  );
}

export function SavedIcon({ kind, size = 18 }: { kind: SavedKind; size?: number }) {
  switch (kind) {
    case 'home':
      return <HomeIcon size={size} />;
    case 'school':
      return <SchoolIcon size={size} />;
    case 'work':
      return <WorkIcon size={size} />;
    case 'family':
      return <PinIcon size={size} />;
    default:
      return <StarIcon size={size} />;
  }
}

export function HazardIcon({ type, size = 26 }: { type: HazardType; size?: number }) {
  switch (type) {
    case 'accident':
      return <CarIcon size={size} />;
    case 'jam':
      return <TrafficIcon size={size} />;
    case 'flood':
      return <FloodIcon size={size} />;
    case 'roadblock':
      return <RoadblockIcon size={size} />;
    case 'pothole':
      return <PotholeIcon size={size} />;
    default:
      return <AlertIcon size={size} />;
  }
}
