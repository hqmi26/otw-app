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
    icon: <CarIcon size={20} />,
    title: 'Directions',
    text: 'Your start, stop and destination go to the free Valhalla route service (Germany), or to OSRM (Germany) if Valhalla is busy, to work out the route.',
  },
  {
    icon: <SearchIcon size={20} />,
    title: 'Search',
    text: 'Places in Sabah are found on your phone. What you type, and roughly where you are, also go to Photon (Germany) to find places in the rest of Malaysia. A dropped pin outside Sabah goes there too, to find its name.',
  },
  {
    icon: <PinIcon size={20} />,
    title: 'Map',
    text: 'OpenFreeMap sends the map pictures for the part of the map on your screen.',
  },
  {
    icon: <UsersIcon size={20} />,
    title: 'Family',
    text: 'Only if you join a family: your area (e.g. Likas), and where you’re driving to with the arrival time. To name your area, a spot rounded to about 1 km goes to Photon (Germany). Your exact spot only while “Share live trip” is on. Switch on Private to hide it all, and nothing is looked up. No history is kept.',
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
            <li>Your name, phone number, saved places and searches stay on this phone.</li>
            <li>Family see the area you’re in, never your exact spot, unless you switch on “Share live trip”.</li>
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
            .
          </p>
        </div>
      </div>
    </div>
  );
}
