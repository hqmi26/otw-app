# OTW Android app

OTW's Android app is the same app as the website, packed inside a real Android
app with [Capacitor](https://capacitorjs.com). Almost all the code is shared, so
a fix in `src/` fixes both.

| Piece | What it does |
|---|---|
| `android/` | The Android project that Capacitor generated |
| `capacitor.config.ts` | The app's name and ID |
| `src/lib/native.ts` | What the app needs that the website gets for free |
| `functions/api/_middleware.ts` | Lets the app talk to OTW's server |
| `assets/` | The source pictures for the app icon and splash screen |

The app's pages are stored inside it, so it opens without signal and doesn't need
an update from Google Play for every server change. Page changes do need a new
build of the app.

## Run it

Turn on USB debugging and plug in the phone, or start an emulator, then:

```bash
npm run android
```

To make an app file you can copy to a phone:

```bash
npm run android:apk
```

The file lands at `android/app/build/outputs/apk/debug/app-debug.apk`.

**Use the practice database while testing.** A normal build talks to the live
server, so anything you send from it is real. To use the practice one, run
`npm run preview:cloudflare` in one terminal, then in another (PowerShell):

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" reverse tcp:8788 tcp:8788
$env:VITE_SERVER_URL = 'http://localhost:8788'; npm run android
```

`VITE_SERVER_URL` also accepts a Cloudflare preview link, if that deployment
includes `functions/api/_middleware.ts`. Plain `http` only works in test builds.

**Build from a folder outside OneDrive.** The Android build writes thousands of
small files, which OneDrive syncs slowly and can lock mid-build.

To change the icon, edit `assets/`, then run this and check that
`android/app/src/main/AndroidManifest.xml` still has its permissions and portrait
setting:

```bash
npx --yes @capacitor/assets@4.0.0 generate --android --assetPath assets --iconBackgroundColor "#0B5F52" --iconBackgroundColorDark "#0B5F52" --splashBackgroundColor "#0B5F52" --splashBackgroundColorDark "#0B5F52"
```

## What was tested

On 1 Nov and again on 13 Nov 2026, on an Android 16 emulator. No real phone was
plugged in either time, so **nothing here has been tried on a real phone yet**.
The 13 Nov run used the version after PR #6, with GrabMaps and family sharing.

| Feature | Result |
|---|---|
| Opens with OTW's name, icon and splash | Works |
| Asks for location, then shows the GPS dot | Works |
| Map, search, route, turn-by-turn | Works on GrabMaps, and on the free services |
| Family: start a family, invite link | Works. The link carries the server's address, not the app's own |
| Refusing location | Works: shows the phone's Settings steps, and recovers after allowing |
| Send feedback | Works, tested on the practice database |
| Phone's Back button | Works: goes back a screen, and leaves from Home |
| Opens with no internet | Works |
| Screen stays on | The feature responds; not timed on a long drive |
| Send ETA | Passes the right message to Android. WhatsApp itself wasn't tested, because the emulator doesn't have it |
| Compass | **Not tested.** An emulator doesn't move |
| Voice directions | **Doesn't work yet** |

When testing through the debug port, press buttons with a real tap
(`adb shell input tap`). A click made by script doesn't count as a touch, so
Android's Back then leaves the app instead of going back a screen.

## Next jobs

1. **Voice (the big one).** Android apps have no `speechSynthesis`, so OTW drives
   silently. Add `@capacitor-community/text-to-speech` and use it in
   `src/lib/voice.ts`.
2. **Driving with the screen off.** GPS stops when OTW is in the background. This
   needs an Android foreground service. Family "always on" sharing needs background
   location on top of that, which Google Play makes you justify in a declaration.
3. **Real phone test.** Try the OnePlus 15 and Tab S11 Ultra: compass, real GPS,
   WhatsApp, a long drive, and a phone call or the screen going off mid-trip.
4. **Invite links open the website, not the app.** Someone with the app who taps a
   family link joins in their browser. Opening the app needs Android App Links.
5. **Android's share menu.** `@capacitor/share` would let Copy link open the
   phone's share menu.

Any `/api` address handed to the map must start with `SERVER_URL` from
`src/lib/native.ts`, not `window.location.origin`. The map downloads tiles in a
background worker, where `native.ts` can't redirect them.

The live site must have `functions/api/_middleware.ts` before any app build can
reach it, so merge this work before giving the app to anyone.

## Before the Play Store

| Step | Who | Notes |
|---|---|---|
| Confirm the app ID, `com.otwapp.malaysia` | You | **It can never change after the first upload.** To change it before then, update `capacitor.config.ts` and `android/app/build.gradle` |
| Reinstall Android Studio | You | The copy on this PC is damaged, with most of its files missing. It's only needed for Android's own debugging tools. Capacitor needs 2025.2.1 or newer |
| Google Play developer account | You | US$25 once. Personal accounts must have 12 testers opted in for 14 days in a row before going public |
| Privacy policy link and data safety form | You | Must cover location |
| Create and back up the signing key | You and Claude | It never goes in Git. Back it up outside this PC |
| Target Android 16 | Done | Required since 31 Aug 2026 |

For the family only, Google's free **limited distribution account** needs no fee
and no government ID, and covers up to 20 devices. Installing over USB stays
allowed for your own devices either way.

Android developer verification hasn't reached Malaysia. It began in Indonesia,
Singapore and Thailand on 30 Sep 2026 and Google plans to go global in 2027, so
register the app before that.

Sources: [12 testers rule](https://support.google.com/googleplay/android-developer/answer/14151465),
[developer verification](https://support.google.com/android-developer-console/answer/16561738),
[target level](https://developer.android.com/google/play/requirements/target-sdk),
[background location](https://support.google.com/googleplay/android-developer/answer/9888170).

## Quirks on this PC

- **Java's Unix sockets fail on this PC** with "Unable to establish loopback
  connection", even in a tiny test program. `android/gradlew.bat` works around
  it, so updating the Gradle wrapper can remove the fix. If Android Studio shows
  the same error after a reinstall, run the command below once, then reopen it.
- **`gradlew.bat` also finds the Android SDK** in its usual folder, because
  `ANDROID_HOME` isn't set here.
- **`npm run android` can say "Deploying failed" on the first start of a slow
  emulator**, even though the app opened. Run it again.

```bash
setx JAVA_TOOL_OPTIONS "-Djdk.net.unixdomain.tmpdir=no-such-folder"
```
