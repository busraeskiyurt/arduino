# SnapMind AI

SnapMind finds the screenshots you forgot about and turns the useful ones into
things you can act on.

The product rule that drives every design decision here: **the user never picks
screenshots by hand.** Manual selection exists, but only as a fallback for
images that are not in the photo library.

```
Give SnapMind access → it finds your screenshots → it analyzes them → it surfaces actions
```

## How it works

```
DEVICE PHOTO LIBRARY
        ↓   metadata only, no upload
SCREENSHOT DISCOVERY        src/discovery/screenshotDiscovery.ts
        ↓
LOCAL PRE-FILTER            src/processing/prefilter.ts
        ↓   duplicate hash · information density · priority score
PROCESSING QUEUE            src/processing/queue.ts
        ↓   bounded concurrency, resumable, persisted in SQLite
GEMINI MULTIMODAL AI        src/ai/gemini.ts
        ↓   structured JSON
ACTION CLASSIFICATION       src/ai/classify.ts
        ↓   ACTIONABLE · NON_ACTIONABLE · UNCERTAIN
ACTION CARD                 src/ui/components/ActionCard.tsx
        ↓
GOOGLE SERVICE              src/actions/
```

New screenshots take a shorter path — a photo-library change event or a
background wake-up feeds them into the same queue.

### What keeps it cheap

Only assets identified as screenshots are ever considered, and of those, only
the ones that survive local pre-filtering reach the API:

| Step | Where | Effect |
| --- | --- | --- |
| Screenshot identification | PhotoKit subtype (iOS), Screenshots album + filename heuristics (Android) | The rest of the camera roll is never touched |
| Duplicate detection | SHA-256 of a normalized 64px probe | Identical screenshots reuse the first analysis |
| Information density | Compressed size of that same probe | Blank / flat images are skipped |
| Priority scoring | Recency, density, and — when an OCR module is registered — actionable keywords | Useful screenshots are analyzed first, not last |

Nothing is discarded. A skipped or non-actionable screenshot stays in the
database and stays searchable; it just does not get a card.

### What keeps it from melting the phone

- Bounded concurrency (default 3) and small batches claimed from SQLite.
- Every state transition is persisted, so a scan interrupted at screenshot
  4,000 of 10,000 resumes at 4,000 rather than at zero.
- Wi-Fi-only is **on** by default; background runs are capped at 15
  screenshots and respect the same conditions.
- Notifications are limited to high-confidence actionable findings, at most 3
  per hour, and never fire during the initial bulk scan.

## Screens

| Screen | Purpose |
| --- | --- |
| Onboarding | Permission, screenshot count, scan range, start |
| Home | What SnapMind has done — screenshots scanned, useful items, categories, scan controls |
| Action Inbox | The core screen: one card per actionable finding, grouped duplicates |
| Search | Everything ever analyzed, including non-actionable results |
| Settings | Pause automatic analysis, Wi-Fi only, notifications, API key, scan history, delete data |
| Detail / Viewer | Every extracted field, and the source screenshot behind it |

### Every result links back to its screenshot

The extracted data is a *reading* of an image, so the image is always one tap
away. Each card carries a thumbnail button (with a `×N` badge when several
screenshots produced it), the detail screen leads with a preview, and the
viewer opens the full screenshot — swipeable across every duplicate in the
group.

## Running it on a phone

The app lives in the `snapmind/` subdirectory of this repository — every
command below is run from there.

First, get a Gemini API key from
[Google AI Studio](https://aistudio.google.com/apikey). You paste it into
**Settings → Gemini API key** inside the app, so it never has to be baked into
a build.

### Option 1 — Expo Go (fastest, needs a computer on the same Wi-Fi)

```bash
git clone https://github.com/busraeskiyurt/arduino.git
cd arduino/snapmind
npm install
npx expo start          # add --tunnel if the phone is on another network
```

Install **Expo Go** from the App Store or Play Store, then scan the QR code
from the terminal (iOS: Camera app; Android: the Expo Go app).

What works: screenshot discovery, the full scan, Gemini analysis, Action
Inbox, screenshot viewer, search, and the Calendar/Maps/Tasks actions.

What does not: OS-scheduled **background scanning**, because
`expo-background-task` is not part of Expo Go. New screenshots are still
picked up while the app is open. Notification behaviour in Expo Go is also
limited — see the [Expo Go limitations](https://docs.expo.dev/develop/development-builds/introduction/).

### Option 2 — a real installable app (EAS Build)

This produces an actual app on the phone, with background scanning and
notifications working.

```bash
npm install -g eas-cli
eas login                        # free Expo account
eas init                         # writes extra.eas.projectId into app.json
eas build --profile preview --platform android
```

The build runs on Expo's servers. When it finishes you get a link and a QR
code — open it on the phone and install the APK directly (allow installs from
unknown sources).

**iPhone:** the same command with `--platform ios` needs a paid Apple
Developer account ($99/year), because iOS will not install an app on a device
that is not registered to a provisioning profile. Without one, use Expo Go for
iOS testing.

### Option 3 — build without any local setup

EAS can build straight from GitHub, so nothing has to be installed on your
computer:

1. Create a project at [expo.dev](https://expo.dev).
2. **Project → GitHub → Connect**, and pick this repository.
3. Set the **base directory** to `snapmind`, since the app is not at the
   repository root.
4. Trigger a build with the `preview` profile from the dashboard and install
   the resulting APK on the phone.

### Building locally instead

With Xcode or Android Studio installed, `npm run ios` / `npm run android`
compiles a native development build on your own machine.

`EXPO_PUBLIC_GOOGLE_CLIENT_ID` is optional and only affects Google Tasks;
without it the app copies the task details and opens Google Tasks in the
browser. Calendar and Maps use public URL templates and need no sign-in.

## Checks

```bash
npm run typecheck   # tsc --noEmit
npm test            # pure decision logic: grouping, priority, date handling
```

## Privacy

See [PRIVACY.md](./PRIVACY.md). The short version: SnapMind reads the photo
library locally to find screenshots, sends only the screenshots it selects to
Google Gemini for analysis, stores results on the device, and has no server of
its own.

## Adding on-device OCR

`src/processing/textDetector.ts` is a one-method interface with a null default.
Register an implementation backed by Apple Vision or ML Kit and the pre-filter
and prioritizer immediately start scoring screenshots on their real text — no
other file changes.

## Deliberately not built

No distributed processing, no custom models, no vector database, no backend, no
microservices. Local device processing, controlled Gemini calls, and SQLite.
