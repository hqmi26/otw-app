import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Stroke({ size = 22, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const SearchIcon = (p: IconProps) => (
  <Stroke {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </Stroke>
);

export const BackIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Stroke>
);

export const LocateIcon = (p: IconProps) => (
  <Stroke {...p}>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </Stroke>
);

export const MoonIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </Stroke>
);

export const SunIcon = (p: IconProps) => (
  <Stroke {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Stroke>
);

export const PinIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </Stroke>
);

export const ClockIcon = (p: IconProps) => (
  <Stroke {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Stroke>
);

export const SoundIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M4 9v6h4l5 4V5L8 9z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7" />
    <path d="M19 6a8.5 8.5 0 0 1 0 12" />
  </Stroke>
);

export const MutedIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M4 9v6h4l5 4V5L8 9z" />
    <path d="M17 9l5 6M22 9l-5 6" />
  </Stroke>
);

export const NavArrowIcon = ({ size = 20, ...rest }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...rest}>
    <path d="M12 2l7 19-7-4-7 4z" />
  </svg>
);

/** Big arrow for the instruction card; rotate it with style. */
export const TurnArrowIcon = (p: IconProps) => (
  <Stroke strokeWidth={2.6} {...p}>
    <path d="M12 21V5" />
    <path d="M6 10l6-6 6 6" />
  </Stroke>
);

export const RoundaboutIcon = (p: IconProps) => (
  <Stroke strokeWidth={2.4} {...p}>
    <circle cx="12" cy="11" r="5" />
    <path d="M12 16v6" />
    <path d="M17 11h4M19 9l2 2-2 2" />
  </Stroke>
);

export const HomeIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M3 11l9-7 9 7" />
    <path d="M5 10v10h14V10" />
  </Stroke>
);

export const SchoolIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M2 9l10-5 10 5-10 5z" />
    <path d="M6 11v5c3 2 9 2 12 0v-5" />
  </Stroke>
);

export const WorkIcon = (p: IconProps) => (
  <Stroke {...p}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M9 7V5h6v2" />
  </Stroke>
);

export const StarIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Stroke {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
  </Stroke>
);

export const PlusIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M12 5v14M5 12h14" />
  </Stroke>
);

export const UsersIcon = (p: IconProps) => (
  <Stroke {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" />
    <path d="M16 4.5a3.5 3.5 0 0 1 0 7" />
    <path d="M18 14.8c1.8.7 3 2.5 3.5 5.2" />
  </Stroke>
);

export const LockIcon = (p: IconProps) => (
  <Stroke {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Stroke>
);

export const AlertIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M12 3l10 18H2z" />
    <path d="M12 10v5" />
    <path d="M12 18v.5" />
  </Stroke>
);

export const CarIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M5 16v-5l2-5h10l2 5v5" />
    <path d="M3 16h18" />
    <circle cx="7.5" cy="16.5" r="1.5" />
    <circle cx="16.5" cy="16.5" r="1.5" />
  </Stroke>
);

export const TrafficIcon = (p: IconProps) => (
  <Stroke {...p}>
    <rect x="8" y="2" width="8" height="20" rx="3" />
    <circle cx="12" cy="7" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="12" cy="17" r="1.5" />
  </Stroke>
);

export const FloodIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M2 10c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
    <path d="M2 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
  </Stroke>
);

export const RoadblockIcon = (p: IconProps) => (
  <Stroke {...p}>
    <rect x="3" y="7" width="18" height="6" rx="1" />
    <path d="M6 13v7M18 13v7M7 7l4 6M13 7l4 6" />
  </Stroke>
);

export const PotholeIcon = (p: IconProps) => (
  <Stroke {...p}>
    <ellipse cx="12" cy="15" rx="8" ry="3.5" />
    <path d="M8 15c1-1.5 2.5-2 4-2s3 .5 4 2" />
  </Stroke>
);

export const ChartIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M4 20h16" />
    <path d="M7 16v-4M12 16V7M17 16v-6" />
  </Stroke>
);

export const CameraIcon = (p: IconProps) => (
  <Stroke {...p}>
    <rect x="2.5" y="7" width="13" height="10" rx="2" />
    <circle cx="9" cy="12" r="2.5" />
    <path d="M15.5 10.5l6-2.5v8l-6-2.5" />
  </Stroke>
);

export const CheckIcon = (p: IconProps) => (
  <Stroke strokeWidth={2.6} {...p}>
    <path d="M5 12l5 5L20 7" />
  </Stroke>
);

export const ChatIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M20 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
    <path d="M8 8.5h8M8 12h5" />
  </Stroke>
);

export const CloseIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Stroke>
);

/** A winding route from a dot to a pin: "show the whole route". */
export const RouteIcon = (p: IconProps) => (
  <Stroke {...p}>
    <circle cx="6" cy="19" r="2" />
    <path d="M8 19h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H15" />
    <path d="M18 8.5s3-2.6 3-4.75a3 3 0 0 0-6 0C15 5.9 18 8.5 18 8.5z" />
  </Stroke>
);

export const FlagIcon = (p: IconProps) => (
  <Stroke strokeWidth={2.4} {...p}>
    <path d="M5 21V4" />
    <path d="M5 4h12l-2 4 2 4H5" />
  </Stroke>
);

export const CopyIcon = (p: IconProps) => (
  <Stroke {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V6a2 2 0 0 1 2-2h8" />
  </Stroke>
);

export const RefreshIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7" />
    <path d="M20 4v7h-7" />
  </Stroke>
);
