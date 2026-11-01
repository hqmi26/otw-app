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
- Directions with up to three routes to choose from, ETA and arrival time (GrabMaps once it's set up, Valhalla and OSRM as backups)
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

## GrabMaps and live traffic (paid, switched on by keys)

With `AWS_LOCATION_KEY` set on Cloudflare, OTW uses **GrabMaps through Amazon Location
Service** for the map, place search, naming a dropped pin and routes
(`functions/api/geo/[[path]].ts` and `src/lib/grab.ts`). Without the key, or when Amazon
fails, everything below keeps working as before. The server keeps the key, so it never
reaches the phone.

The Petrol/Food/Surau/Parking chips ask GrabMaps too, but the Amazon console doesn't offer
SearchNearby for a key, so for now Amazon refuses and the chips use our own Sabah list.

**One-time setup** (needs a card, so only the owner can do it):

1. Make an AWS account at https://signin.aws.amazon.com/signup?request_type=register and pick
   the **Free** plan. New accounts get US$100 of credit, and up to US$100 more. Don't use the
   "Builder ID" sign-up with projects: it puts Malaysian accounts in Sydney, which has no GrabMaps.
2. **Account → AWS Regions → Asia Pacific (Malaysia) → Enable**. It can take a few minutes.
3. **Billing → Budgets → Create budget**: a monthly budget of US$10 that emails you.
4. Open the **Amazon Location** console in the Malaysia region → **API keys → Create API key**.
   Allow GetTile, Suggest, SearchText, ReverseGeocode and CalculateRoutes.
   Leave client restrictions empty, because the key is used from our server.
5. Cloudflare: **Workers & Pages → otw-app → Settings → Variables and Secrets → Add**:
   type **Secret**, name `AWS_LOCATION_KEY`, for Production and Preview. Then **Retry deployment**.

To use a key on your computer, put `AWS_LOCATION_KEY=…` in a `.dev.vars` file (git ignores
it) and run `npm run preview:cloudflare`.

**Prices** (Malaysia region, Oct 2026, US$ per 1,000): map tiles 0.04, searches and the
chips 0.50, routes 0.50, a place kept in saved or recents 4.00. The first 3 months include
500,000 tiles, 10,000 routes and 10,000–20,000 searches a month.

**Amazon's rules** (AWS Service Terms, section 82), and what they mean here:

- Phone apps used in a car are allowed; systems built into the car are not.
- Nothing from Amazon is cached or kept, unless it's asked for as Storage. A place only goes
  into saved places or recents through `keepPlace`, and the server has no cache.
- Amazon's data can't be mixed in a way that puts it under the ODbL. So it's never written
  into `public/places/sabah.json`, and our OpenStreetMap labels aren't drawn on its map.
- No company name or logo on the map, and keep the credit it comes with.
- GrabMaps through Amazon has no opening hours, phone numbers, tolls or route incidents.

**Traffic colours** need `TOMTOM_KEY`, set the same way. Leave it off until TomTom signs: the
free key doesn't allow use in a turn-by-turn app (TomTom's terms, clause 2.1). Clause 11.4
also bars caching, and clause 11.6.10 bars comparing it with competitors.

At about 100,000 calls a day (roughly 300 users driving), Cloudflare's free Functions limit
runs out, because every map tile passes through our server. Move to the paid plan (US$5 a month).

## Free services used (no API keys)

| What | Service | Note |
|---|---|---|
| Map tiles | OpenFreeMap (OpenStreetMap data) | Free, no limits |
| Search in Sabah | Our own list (`public/places/sabah.json`) | Searched on the phone |
| Search elsewhere | Photon public server | Fair use only |
| Routing | FOSSGIS Valhalla server (OSRM demo server as backup) | Low use only, one request a second. Gives 2–3 routes; OSRM finds only one in KK |
| Feedback | Cloudflare Pages Functions + D1 | Free tier, plenty for feedback |

These are the backups for GrabMaps. None of them know about live traffic: their
route times are for normal roads, with a rough rush-hour allowance (`src/lib/eta.ts`).

## Code map

- `src/App.tsx` – screens, trip state, voice, rerouting
- `src/components/MapView.tsx` – the map, markers, route lines, camera
- `src/components/*Screen.tsx`, `RouteSheet.tsx`, `NavigationView.tsx` – the UI
- `src/lib/api.ts` – Photon search and routing calls
- `src/lib/grab.ts` – GrabMaps search and routes, through our server
- `src/lib/places.ts` – loads and searches Sabah's place list on the phone
- `src/lib/search.ts` – picks where a search goes: the user's own places, Sabah's list, then GrabMaps or Photon
- `scripts/build_places.py` – builds Sabah's place list (run monthly by GitHub Actions)
- `src/lib/geo.ts` – distance maths and formatting
- `src/hooks/useNavigation.ts` – progress along the route and the demo drive
- `functions/api/feedback.ts` – saves feedback (runs on Cloudflare, not in the phone)
- `functions/api/geo/[[path]].ts` – holds the Amazon and TomTom keys, and passes on the map, search and routes

## Next

1. Family accounts and live location (Supabase)
2. Saved places and hazard reports
3. Android app with Capacitor
