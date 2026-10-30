# OTW – Aplikasi trip anda

Family navigation web app (phase 1). Works in the phone's browser and can be added to the home screen.

**Live:** https://otw-app-eoz.pages.dev — hosted free on Cloudflare Pages. Every push to `main` rebuilds and updates it automatically.

## What works now

Matches the design canvas ("OTW – Family Navigation App"):

- Logo intro, then a first-time login (name + phone, kept on the phone for now)
- Our own map style (`src/lib/mapStyle.ts`) in OTW colours, light and dark
- Home: search bar with your avatar, saved-place chips (Rumah, Rumah Atuk…), locate, Report, family panel
- Search with Petrol / Food / Surau / Parking chips, saved places and recents. In Sabah it
  searches our own list on the phone (about 50,000 places, 2,200 tamans/kampungs and 9,000 streets)
- Sabah's places as coloured labels on the map (tap one for directions)
- "Add a missing place": put a place search can't find on the map yourself (on this phone for now)
- Save any place with the ⭐ on the route sheet or the "Add" chip
- Directions with up to three routes to choose from, ETA and arrival time (Valhalla, OSRM as backup)
- Turn-by-turn: next turn, "then…" hint, voice, mute, rerouting, screen stays on
  (also after coming back from WhatsApp, with a silent-video backup for phones that refuse)
- The voice and turn card only speak up for real turns, not "continue on Jalan …"
- "Whole route" button while driving; it goes back to the car after 15 seconds
- "Add a stop" before or during a trip: the Petrol / Food / Surau / Parking chips then
  list places along the road ahead, in the order you pass them
- Raised 3D buildings in the driving view, and traffic-light icons at Sabah junctions
- Report a hazard or a speed camera: shown to every OTW driver nearby without a name,
  for 2 hours (cameras 30 days); tap one for "Still there?" (kept on the phone if offline)
- Family sharing: family see your area (never the exact spot) and trip ETA, a live car
  only with "Share live trip"; invite link; Private switch
- Account: change username, dark mode switch, Privacy & data page, log out
- Send feedback (home panel or Account): ideas and bug reports are saved for you to review
- Rush protection: a slow or busy route/search service is skipped for a minute instead of
  leaving the app stuck on "Finding routes…" (`src/lib/net.ts`)
- Phone back button / swipe goes back a screen

## Run it on your computer

```bash
npm install
npm run dev
```

Open http://localhost:5173. A laptop has no GPS, so trips start from KK city centre and the
navigation screen does a **demo drive** (tap the "Demo drive ×1" chip to speed it up).
Add `?sim` to the address to force the demo drive even when GPS works.

## Try it on a phone

Open https://otw-app-eoz.pages.dev on the phone and use **Add to Home Screen**
(iPhone: Safari → Share → Add to Home Screen; Android: Chrome menu → Install app).

Cloudflare Pages settings: build command `npm run build`, output folder `dist`.

## Feedback

"Send feedback" posts to `functions/api/feedback.ts`, which Cloudflare Pages runs
next to the app and which saves each message in a free Cloudflare D1 database.
The `feedback` table is created by itself on the first message.

**One-time setup** in the Cloudflare dashboard:

1. **Storage & databases → D1 → Create database**, name it `otw-feedback`.
2. **Workers & Pages → otw-app → Settings → Bindings → Add → D1 database**:
   variable name `DB`, database `otw-feedback`. Save.
3. Push to `main` (or **Retry deployment**) so the new binding is picked up.

**Reading feedback:** D1 → `otw-feedback` → **Console**, then run

```sql
SELECT id, created_at, kind, message, name, app FROM feedback ORDER BY id DESC;
```

Times are UTC (Malaysia is +8). Each row also has the phone model (`device`) and
screen size, for reproducing bugs. No location is sent.

**On your computer:** `npm run dev` has no server behind it, so sending feedback
shows "Couldn't send". To try the whole thing, run `npm run preview:cloudflare` and
open http://localhost:8788. It uses a local test database in `.wrangler/`.

## Shared reports and usage count

Both use the same `DB` database as feedback (`otw-feedback`), so there's nothing new
to set up; their tables make themselves.

- `functions/api/reports/[[path]].ts` keeps hazard reports: what, where, note and time,
  no name or ID. Rows are deleted once they run out or drivers say they're gone.
- `functions/api/visit.ts` counts phones that opened OTW each day and trips started,
  by phone type only (Android / iPhone / other).

**Reading them:** D1 → `otw-feedback` → **Console**, then

```sql
SELECT day, kind, device, count FROM visits ORDER BY day DESC, kind;
SELECT type, note, datetime(created_at, 'unixepoch', '+8 hours') AS at, ups, downs FROM reports ORDER BY created_at DESC;
```

## Traffic lights

`public/map/sabah-signals.json` has the traffic-light junctions from OpenStreetMap
(points within 50 m are joined into one per junction). Refresh it by hand now and then:

```bash
node scripts/sabah-signals.mjs
```

## Sabah places (search and map labels)

`public/places/sabah.json` holds Sabah's places, tamans, kampungs, streets, peaks,
islands, beaches and named buildings from **Overture Maps** (business and place data
from Meta, Microsoft and others) plus **OpenStreetMap**. The phone downloads it once
(about 1.2 MB) and searches it itself, so Sabah results show at once, even on a weak
signal. Search also asks Photon, for places in other states; those are listed after
the Sabah places nearby.

Search understands Malay and English words for the same thing ("klinik gigi" finds a
"Dental clinic", "mount kinabalu" finds "Gunung Kinabalu") and short forms ("mcd",
"smk", "kk"). A search that only names a kind of place ("police station", "kedai
tayar") lists the closest ones. Meta has copies of landmarks wherever someone made a
page ("Mount Kinabalu" in Putatan), so the build drops copies far from the real spot.

The list is rebuilt **automatically on the 28th of each month** by the GitHub Action
`.github/workflows/places.yml`, which commits the new file, and Cloudflare then
redeploys. To rebuild by hand:

```bash
pip install duckdb==2.0.0
python scripts/build_places.py
```

Overture's data is free for commercial use (CDLA-Permissive-2.0, Apache-2.0, CC0) and
OpenStreetMap's is ODbL; the map credit names both.

## Free services used (no API keys)

| What | Service | Note |
|---|---|---|
| Map tiles | OpenFreeMap (OpenStreetMap data) | Free, no limits |
| Search in Sabah | Our own list (`public/places/sabah.json`) | Searched on the phone |
| Search elsewhere, family area names | Photon public server | Fair use only. Area names send only a spot rounded to about 1 km, at most once an hour for each square |
| Routing | FOSSGIS Valhalla server (OSRM demo server as backup) | Low use only, one request a second. Gives 2–3 routes; OSRM finds only one in KK |
| Feedback, reports, usage count, family | Cloudflare Pages Functions + D1 | Free tier |
| Traffic lights | OpenStreetMap (Overpass), saved in `public/map/` | Refreshed by hand |

For a public launch, run Photon and Valhalla on our own server in Malaysia so
nobody's location leaves the country. None of these know about live traffic:
the route times are for normal roads, with a rough rush-hour allowance
(`src/lib/eta.ts`). Choosing the route with less jam needs live traffic (TomTom).

## Code map

- `src/App.tsx` – screens, trip state, voice, rerouting
- `src/components/MapView.tsx` – the map, markers, route lines, camera
- `src/components/*Screen.tsx`, `RouteSheet.tsx`, `NavigationView.tsx` – the UI
- `src/lib/api.ts` – Photon search and routing calls
- `src/lib/net.ts` – time limits, "busy" handling and short memory for those calls
- `src/lib/voice.ts`, `src/lib/instructions.ts` – the spoken and shown turn instructions
- `src/lib/keepAwake.ts` – keeps the screen on while driving
- `src/lib/reports.ts`, `src/lib/visits.ts` – shared reports and the usage count (phone side)
- `src/lib/places.ts` – loads and searches Sabah's place list on the phone
- `src/lib/search.ts` – picks where a search goes: the user's own places, Sabah's list, or Photon
- `scripts/build_places.py` – builds Sabah's place list (run monthly by GitHub Actions)
- `src/lib/geo.ts` – distance maths and formatting
- `src/hooks/useNavigation.ts` – progress along the route and the demo drive
- `functions/api/*` – feedback, family, reports and usage count (run on Cloudflare, not in the phone)

## Next

1. Live traffic routes with TomTom (waiting for the navigation licence)
2. Saved places across phones
3. Android app with Capacitor
