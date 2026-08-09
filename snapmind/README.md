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

## Setup

```bash
npm install
cp .env.example .env      # optional; the key can also be entered in Settings
npm start
```

Photo-library access, background tasks and notifications all need a native
build — use `npm run ios` / `npm run android` (or an EAS development build)
rather than Expo Go.

Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)
and paste it into **Settings → Gemini API key**, where it is stored in the
device keychain.

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
