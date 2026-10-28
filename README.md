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
- Directions with up to two routes, ETA and arrival time (OSRM)
- Turn-by-turn: next turn, "then…" hint, voice, mute, rerouting, screen stays on
- Report a hazard (pinned on the map for 2 hours, on this phone only for now)
- Account: change username, dark mode switch, log out
- Family page (sharing arrives with accounts) with a "Share OTW" button
- Send feedback (home panel or Account): ideas and bug reports are saved for you to review
- Phone back button / swipe goes back a screen

## Run it on your computer

```bash
npm install
npm run dev
```

Open http://localhost:5173. A laptop has no GPS, so trips start from KLCC and the
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
| Search elsewhere | Photon public server | Fair use only |
| Routing | OSRM demo server | Demo use only |
| Feedback | Cloudflare Pages Functions + D1 | Free tier, plenty for feedback |

For a public launch, run Photon and OSRM on our own server in Malaysia so
nobody's location leaves the country.

## Code map

- `src/App.tsx` – screens, trip state, voice, rerouting
- `src/components/MapView.tsx` – the map, markers, route lines, camera
- `src/components/*Screen.tsx`, `RouteSheet.tsx`, `NavigationView.tsx` – the UI
- `src/lib/api.ts` – Photon search and routing calls
- `src/lib/places.ts` – loads and searches Sabah's place list on the phone
- `src/lib/search.ts` – picks where a search goes: the user's own places, Sabah's list, or Photon
- `scripts/build_places.py` – builds Sabah's place list (run monthly by GitHub Actions)
- `src/lib/geo.ts` – distance maths and formatting
- `src/hooks/useNavigation.ts` – progress along the route and the demo drive
- `functions/api/feedback.ts` – saves feedback (runs on Cloudflare, not in the phone)

## Next

1. Family accounts and live location (Supabase)
2. Saved places and hazard reports
3. Android app with Capacitor
