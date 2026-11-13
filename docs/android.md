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
| `android/.../Voice.java` | Speaks directions with the phone's own voice, and lowers music while it does |
| `android/.../DriveService.java` | Runs during a trip, so GPS and voice carry on with the screen off or another app open. Shows the "OTW is guiding your trip" notification |
| `android/.../OtwDrivePlugin.java` | How the pages ask Android for those two things. The pages call it `OtwDrive` (`src/lib/native.ts`) |

The three Java files are in `android/app/src/main/java/com/otwapp/malaysia/`.

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

On an Android 16 emulator (1, 13 and 14 Nov 2026), and on 14 Nov on a real
OnePlus 15 running Android 17. The phone sat still indoors, so **nothing here
has been tried on a real drive yet**. All of it used the practice server.

| Feature | Emulator | OnePlus 15 |
|---|---|---|
| Opens with OTW's name, icon and splash | Works | Works |
| Asks for location, then shows the GPS dot | Works | Works |
| Map, search, route, turn-by-turn | Works on GrabMaps, and on the free services | Map, search and route work. Turn-by-turn not driven |
| Voice directions | Android reports each line as said. Nobody listened | English and Malay lines said to the end. **Ask a person whether they sounded right** |
| Trip carries on with the screen off | Works: followed the road, re-routed and spoke | **Not tested.** The phone ignores key presses sent over USB |
| Trip carries on with another app open | Not tested | Works: GPS fixes kept coming and a line was spoken |
| Ending a trip stops the service | Works | Works |
| Family: start a family, invite link | Works. The link carries the server's address, not the app's own | Not tested |
| Refusing location | Works: shows the phone's Settings steps, and recovers after allowing | Not tested |
| Send feedback | Works, tested on the practice database | Not tested |
| Phone's Back button | Works: goes back a screen, and leaves from Home | Not tested |
| Opens with no internet | Works | Not tested |
| Screen stays on | The feature responds; not timed on a long drive | Not tested |
| Send ETA | Passes the right message to Android | Not tested |
| Compass | **Not tested.** An emulator doesn't move | Not tested |

Testing notes:

- Through the debug port, press buttons with a real tap (`adb shell input tap`).
  A click made by script doesn't count as a touch, so Android's Back then leaves
  the app instead of going back a screen.
- The OnePlus 15 refuses `adb shell pm grant` and ignores `adb shell input
  keyevent`, so permissions and the power button need a person. To put OTW in
  the background from the PC, open the home screen with
  `adb shell am start -a android.intent.action.MAIN -c android.intent.category.HOME`.
- A phone lying still gets a GPS fix only every 5 to 8 seconds. That's Android
  saving power, not a fault.
- The emulator's voice takes up to 9 seconds to say its first line. The phone
  starts in under a second.

## Next jobs

1. **A real drive.** Voice timing, the screen going off mid-trip, a phone call
   mid-trip, the compass, WhatsApp, and how much battery a long trip uses.
2. **End the trip service after arriving.** It runs until End is tapped. If the
   driver forgets, it keeps the GPS on; the phone is only held awake for 6 hours
   at most.
3. **The start line is cut off.** When the first turn is close, "In 50 metres…"
   interrupts "Jom! Let's go". The website does the same.
4. **Invite links open the website, not the app.** Someone with the app who taps a
   family link joins in their browser. Opening the app needs Android App Links.
5. **Android's share menu.** `@capacitor/share` would let Copy link open the
   phone's share menu.
6. **Family "always on" sharing** needs background location, which Google Play
   makes you justify in a declaration. The trip service doesn't need it, because
   it starts while OTW is on screen.

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
