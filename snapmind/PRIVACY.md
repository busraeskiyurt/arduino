# SnapMind privacy

This describes what the application in this repository actually does. It is a
technical disclosure, not a legal privacy policy — a shipped product needs one
of those as well.

## What SnapMind accesses

**Your photo library, read-only.** SnapMind requests read access so it can find
your screenshots without you selecting them. It never writes to or deletes from
your library.

## What is analyzed

Only images identified as screenshots:

- **iOS** — the PhotoKit `screenshot` media subtype.
- **Android** — images in the Screenshots album, plus filename heuristics.

Ordinary photos in your camera roll are not identified as screenshots and are
not analyzed. Of the screenshots that are found, some are skipped locally
before any network call — duplicates of something already analyzed, and images
with essentially no content.

## What leaves the device

**Screenshot image data is sent to Google Gemini.** SnapMind does not do the
image understanding on-device, and does not claim to. For each screenshot
selected for analysis, a downscaled JPEG (longest edge 1024px) is uploaded to
Google's Generative Language API together with the analysis instructions.

Google's handling of that data is governed by the Gemini API terms for the key
you supply.

Nothing else leaves the device. There is no SnapMind server, no analytics, no
crash reporting, no account.

## What is stored, and where

On this device only, in a local SQLite database:

- a record of each discovered screenshot (identifier, filename, dimensions,
  creation time, processing status);
- what Gemini extracted (title, dates, place, price, link, a short text excerpt
  used for search);
- scan progress and your settings.

The screenshots themselves are not copied — SnapMind stores a reference and
reads the image from your library when it needs to show it.

Your Gemini API key is kept in the device keychain (iOS) or keystore
(Android), never in the database.

## Your controls

- **Settings → Pause automatic analysis** stops background scanning and
  analysis of new screenshots.
- **Settings → Wi-Fi only** (on by default) keeps analysis off cellular data.
- **Settings → Notify about useful findings** turns notifications off.
- **Settings → Delete SnapMind data** erases every record, result and setting
  stored on the device. Your photos are untouched.
- Revoking photo-library permission in the OS settings stops discovery
  entirely.

## What SnapMind does not do

- It does not upload your whole camera roll.
- It does not upload photos that are not screenshots.
- It does not claim to analyze screenshots entirely on-device.
- It does not share extracted results with anyone; acting on a card (Calendar,
  Maps, Tasks) sends data to that Google service only when you tap the button.
