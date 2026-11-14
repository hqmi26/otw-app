# OTW – Aplikasi trip anda

Family navigation web app (phase 1). Works in the phone's browser and can be added to the home screen.

**Live:** https://otw-app-eoz.pages.dev — hosted free on Cloudflare Pages. Every push to `main` rebuilds and updates it automatically.

## What works now

Matches the design canvas ("OTW – Family Navigation App"):

- Logo intro, then a welcome screen: type a name or skip it. No sign-up and no phone
  number; every phone gets a hidden ID on our server
- Our own map style (`src/lib/mapStyle.ts`) in OTW colours, light and dark
- Home: search bar with your avatar, saved-place chips (Rumah, Rumah Atuk…), locate, Report, family panel
- Search with Petrol / Food / Surau / Parking chips, saved places and recents. In Sabah it
  searches our own list on the phone (about 50,000 places, 2,200 tamans/kampungs and 9,000 streets)
- Sabah's places as coloured labels on the map (tap one for directions)
- "Add a missing place": put a place search can't find on the map yourself (on this phone for now)
- Save any place with the ⭐ on the route sheet or the "Add" chip
- Directions with up to three routes to choose from, ETA and arrival time (GrabMaps once it's set up, Valhalla and OSRM as backups)
- Turn-by-turn: next turn, "then…" hint, voice, mute, rerouting, screen stays on
  (also after coming back from WhatsApp, with a silent-video backup for phones that refuse)
- The voice and turn card only speak up for real turns, not "continue on Jalan …"
- "Whole route" button while driving; it goes back to the car after 15 seconds
- "Add a stop" before or during a trip: the Petrol / Food / Surau / Parking chips then
  list places along the road ahead, in the order you pass them
- Raised 3D buildings in the driving view, and traffic-light icons at Sabah junctions
- Report a hazard or a speed camera: shown to every OTW driver nearby without a name,
  for 2 hours (cameras 30 days); tap one for "Still there?" (kept on the phone if offline)
- Groups: a family group sees your area (never the exact spot) and trip ETA; a normal
  group sees nothing until you share a trip with it before Start. A live car only with
  "Share live trip"; invite links; one Private switch for every group; the person who
  started a group can remove people
- Sign in with Google (Account, or "Used OTW before?" on the welcome screen) to get your
  account, groups and saved places back on a new phone
- Account: change your name, Customise, Privacy & data page, log out of this phone, delete account
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

## Android app

OTW also builds as a real Android app with Capacitor. See [docs/android.md](docs/android.md).

```bash
npm run android
```

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

## Accounts, groups and Google sign-in

Everything lives in the `otw-family` D1 database, bound to the Pages project as `FAMILY_DB`
for Production and Preview. The tables make themselves (`db/family.sql` lists them), and the
server is `functions/api/account/[[path]].ts`.

- Every phone gets a hidden ID (`users`) and a secret key (only its SHA-256 is kept, in
  `devices`). Someone who drives alone has nothing else there.
- Groups are `groups` and `group_members`; each person's latest area, trip and live car is one
  row in `user_status`, overwritten as it changes and cleared on arrival.
- Signing in with Google adds Google's ID for the account and its verified email to `users`.
  Only then are saved places and added places kept on the server, in `user_places`.
- Delete account erases all of that at once. Log out removes this phone's key; a guest with
  no sign-in and no other phone is erased too, so nobody is left behind in a group.

**Moving the public test's families.** The public test kept families in `families` and
`members`. The first request on the live address after this goes live moves them into the new
tables in one step: same people, same invite links, same phone keys, so nobody has to join
again. The old rows are emptied in the same step, so it can't run twice. It never runs from a
preview link, because preview links share the live database. `functions/api/family` stays as a
small route that tells an app left open since before the update to reopen.

**Setting up Google sign-in.** Without `GOOGLE_CLIENT_ID` the app works as before, just with no
Google button.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) signed in as the OTW
   Google account, and create a project called OTW.
2. **Google Auth Platform → Get started**: app name OTW, the OTW email for support and contact,
   audience **External**.
3. **Clients → Create client → Web application**. Under **Authorized JavaScript origins** add
   `https://otw-app-eoz.pages.dev`, plus `http://localhost`, `http://localhost:8788` and
   `http://localhost:8799` for testing on this computer. No redirect address is needed.
4. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`). It isn't a secret.
5. **Audience → Test users**: add the accounts that may try it. Until the app is published,
   only those can sign in; anyone else sees "Access blocked". To publish, first fill in
   **Branding** (home page, privacy policy link, authorised domain), then **Audience → Publish
   app**. Sign-in that only asks for name and email needs no review from Google.
6. Cloudflare: **Workers & Pages → otw-app → Settings → Variables and Secrets → Add**, type
   **Text**, name `GOOGLE_CLIENT_ID`, for Production. Then **Retry deployment**.

On this computer, put `GOOGLE_CLIENT_ID=…` in `.dev.vars` (ignored by git) and run
`npm run preview:cloudflare`. Open it in Chrome: Google signs in through a pop-up, which the
browser built into the Claude app blocks. Google only accepts the exact addresses listed in
step 3, so the button doesn't work on preview links, which get a new address each time.

**Counting them:** D1 → `otw-family` → **Console**, then

```sql
SELECT COUNT(*) AS people, COUNT(google_id) AS signed_in FROM users;
SELECT type, COUNT(*) AS groups FROM groups GROUP BY type;
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

## GrabMaps and live traffic (paid, switched on by keys)

With `AWS_LOCATION_KEY` set on Cloudflare, OTW uses **GrabMaps through Amazon Location
Service** for the map, place search, naming a dropped pin and routes
(`functions/api/geo/[[path]].ts` and `src/lib/grab.ts`). Without the key, or when Amazon
fails, everything below keeps working as before. The server keeps the key, so it never
reaches the phone.

**Customise** (Account → Customise, `src/components/CustomiseScreen.tsx`) groups the looks
in one place: dark mode, map style, 3D buildings and your car. 3D is drawn by us from the
heights in the tiles, because Amazon's own Buildings3D option refuses GrabMaps. It shows
when the map tilts, as it does while driving, and only where the data has buildings.

**Map style** picks how the GrabMaps map looks: Amazon's Standard or
Monochrome, or our own styles from `src/lib/mapStyle.ts` on GrabMaps' tiles: OTW colours,
Night drive (always dark) and Big text. Each phone remembers its own choice. On the free
map there's only OTW's style, so the choice is hidden. Satellite isn't available for GrabMaps.

Standard has Amazon's place icons. The other designs get OTW's own (`src/lib/poiIcons.ts`),
drawn from the `poi` layer of the same tiles.

**Auto day and night** turns dark mode on at sunset and off at sunrise,
worked out from where the phone is (`sunIsDown` in `src/lib/geo.ts`), so it needs no service.

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
| Search elsewhere, family area names | Photon public server | Fair use only. Area names send only a spot rounded to about 1 km, at most once an hour for each square |
| Routing | FOSSGIS Valhalla server (OSRM demo server as backup) | Low use only, one request a second. Gives 2–3 routes; OSRM finds only one in KK |
| Feedback, reports, usage count, family | Cloudflare Pages Functions + D1 | Free tier |
| Traffic lights | OpenStreetMap (Overpass), saved in `public/map/` | Refreshed by hand |

These are the backups for GrabMaps. None of them know about live traffic: their
route times are for normal roads, with a rough rush-hour allowance (`src/lib/eta.ts`).

## Code map

- `src/App.tsx` – screens, trip state, voice, rerouting
- `src/components/MapView.tsx` – the map, markers, route lines, camera
- `src/components/*Screen.tsx`, `RouteSheet.tsx`, `NavigationView.tsx` – the UI
- `src/lib/api.ts` – Photon search and routing calls
- `src/lib/net.ts` – time limits, "busy" handling and short memory for those calls
- `src/lib/voice.ts`, `src/lib/instructions.ts` – the spoken and shown turn instructions
- `src/lib/keepAwake.ts` – keeps the screen on while driving
- `src/lib/reports.ts`, `src/lib/visits.ts` – shared reports and the usage count (phone side)
- `src/lib/grab.ts` – GrabMaps search and routes, through our server
- `src/lib/places.ts` – loads and searches Sabah's place list on the phone
- `src/lib/search.ts` – picks where a search goes: the user's own places, Sabah's list, then GrabMaps or Photon
- `scripts/build_places.py` – builds Sabah's place list (run monthly by GitHub Actions)
- `src/lib/geo.ts` – distance maths and formatting
- `src/hooks/useNavigation.ts` – progress along the route and the demo drive
- `functions/api/*` – feedback, accounts and groups, reports and usage count (run on Cloudflare, not in the phone)
- `functions/api/account/[[path]].ts` – accounts, groups, Google sign-in, saved places of signed-in accounts
- `server/google.ts` – checks Google's sign-in answer (signature, made for OTW, not expired, asked for by this phone)
- `src/lib/groups.ts`, `src/hooks/useGroups.ts` – accounts and groups (phone side); `src/hooks/usePlaceSync.ts` keeps saved places with a signed-in account
- `src/lib/googleSignIn.ts`, `src/components/GoogleSignIn.tsx` – Google's button, fetched only when someone taps "Sign in with Google"
- `functions/api/geo/[[path]].ts` – holds the Amazon and TomTom keys, and passes on the map, search and routes

## Next

1. Live traffic routes with TomTom (waiting for the navigation licence)
2. Sign in with an email link, for people without a Google account (needs OTW's own domain)
3. Android app with Capacitor
