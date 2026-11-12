import type { ReactNode } from 'react';
import { AlertIcon, BackIcon, CarIcon, ChartIcon, ChatIcon, ClockIcon, LockIcon, PinIcon, SearchIcon, UsersIcon } from './icons';

interface Props {
  leaving: 'pop' | 'fade' | null;
  onBack: () => void;
}

/** One place where something leaves the phone, and why. */
interface Flow {
  icon: ReactNode;
  title: string;
  text: string;
}

// Keep this in step with the code: every service the app talks to is listed here.
const FLOWS: Flow[] = [
  {
    icon: <LockIcon size={20} />,
    title: 'Your account',
    text: 'Each phone gets a random hidden ID on OTW’s server, so the app can tell accounts apart. It has no name, email or phone number, and it’s never used to record where you go. There are no ads.',
  },
  {
    icon: <CarIcon size={20} />,
    title: 'Directions',
    text: 'Your start, stop and destination go through OTW’s server to GrabMaps on Amazon (Malaysia), to work out the route. If that’s busy, they go to the free Valhalla or OSRM services (Germany) instead.',
  },
  {
    icon: <SearchIcon size={20} />,
    title: 'Search',
    text: 'Places in Sabah are found on your phone. What you type, and where you are, also go through OTW’s server to GrabMaps on Amazon (Malaysia), or roughly where you are to Photon (Germany) if that’s busy. A dropped pin goes the same way, to find its name.',
  },
  {
    icon: <PinIcon size={20} />,
    title: 'Map',
    text: 'GrabMaps on Amazon (Malaysia) sends the map pictures for the part of the map on your screen, through OTW’s server. If that’s busy, OpenFreeMap sends them.',
  },
  {
    icon: <UsersIcon size={20} />,
    title: 'Family groups',
    text: 'Only if you join one: your name, your area (e.g. Likas), and where you’re driving to with the arrival time. To name your area, a spot rounded to about 1 km goes to Photon (Germany). Your exact spot only while “Share live trip” is on. Switch on Private to hide it all, and nothing is looked up. No history is kept.',
  },
  {
    icon: <UsersIcon size={20} />,
    title: 'Normal groups',
    text: 'Only if you join one: your name. They see nothing else until you share a trip with them before pressing Start. Then they see where you’re driving to and the arrival time, and your exact spot only while “Share live trip” is on. It stops when you arrive.',
  },
  {
    icon: <AlertIcon size={20} />,
    title: 'Reports',
    text: 'When you report a flood, accident or camera: what it is, where you were, and your note go to OTW’s server and are shown to OTW drivers nearby, without your name. Gone after 2 hours (cameras 30 days), sooner if drivers say it’s cleared.',
  },
  {
    icon: <ChatIcon size={20} />,
    title: 'Feedback',
    text: 'When you send feedback: your message, username and phone model. Never your location.',
  },
  {
    icon: <ClockIcon size={20} />,
    title: 'Send ETA',
    text: 'Opens WhatsApp with the message ready. You choose who gets it.',
  },
  {
    icon: <ChartIcon size={20} />,
    title: 'Usage count',
    text: 'Once a day, “OTW was opened”, and “a trip started” for each trip, with only the phone type (Android or iPhone). No name, location or ID, so nobody can be told apart.',
  },
  {
    icon: <AlertIcon size={20} />,
    title: 'Deleting your account',
    text: 'Account → Delete account erases your account, your place in your groups, and everything OTW keeps on this phone, including saved places. Cloudflare’s automatic backups can hold old copies for up to 30 days, then they’re gone. Road reports you sent stay until they run out, with no link to you.',
  },
];

/** Privacy & data: in plain words, what stays on the phone and what leaves it. */
export default function PrivacyScreen(p: Props) {
  return (
    <div className={`screen screen-push page${p.leaving ? ` leave-${p.leaving}` : ''}`}>
      <div className="page-head">
        <button type="button" className="icon-btn" onClick={p.onBack} aria-label="Back to Account">
          <BackIcon />
        </button>
        <h1 className="page-title">Privacy &amp; data</h1>
      </div>

      <div className="page-body">
        <div className="card stack">
          <span className="row-icon tinted">
            <LockIcon size={20} />
          </span>
          <h2 className="card-title">Your trips are yours</h2>
          <ul className="privacy-points">
            <li>No ads. OTW doesn’t sell your data or track you.</li>
            <li>Your saved places and searches stay on this phone.</li>
            <li>Your name stays here too, unless you join a group or send feedback.</li>
            <li>Family see the area you’re in, never your exact spot, unless you switch on “Share live trip”.</li>
            <li>Normal groups see nothing until you share a trip with them.</li>
          </ul>
        </div>

        <h2 className="section-label">What leaves your phone</h2>
        <div className="card list">
          {FLOWS.map((f) => (
            <div key={f.title} className="row privacy-row">
              <span className="row-icon tinted">{f.icon}</span>
              <span className="row-text">
                <span className="row-title">{f.title}</span>
                <span className="row-sub wrap">{f.text}</span>
              </span>
            </div>
          ))}
        </div>

        <h2 className="section-label">Map credits</h2>
        <div className="card">
          <p className="card-text">
            Map data ©{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
              OpenStreetMap
            </a>{' '}
            contributors. Map style ©{' '}
            <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">
              OpenMapTiles
            </a>
            , served by{' '}
            <a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">
              OpenFreeMap
            </a>
            . GrabMaps map, search and routes come through{' '}
            <a
              href="https://docs.aws.amazon.com/location/latest/developerguide/data-attribution.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              Amazon Location Service
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
