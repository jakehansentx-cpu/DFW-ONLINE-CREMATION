# Metro Certificate & Sticker Maker — Desktop (Web App)

A browser-based, batch-entry companion to the Android app. No installation,
no build step, no server — everything runs locally in your browser and
nothing is sent over the network, with one optional exception: scanning a
photo of a Burial-Transit Permit to fill in the name (see "Reading a name
from a photo" below) sends that one photo to Google's Gemini API to be read.

## Opening it

Double-click `index.html`. It opens in your default browser and works
immediately.

(If your browser's address bar shows a `file://` URL and anything looks
broken, try Chrome or Edge specifically — those are the most tested. No
internet connection is required after the page has loaded once.)

## How it works

1. Fill in a decedent's **First / Middle / Last / Suffix**, **date of
   cremation** (calendar picker), **I.D. disc/disk number**, **funeral
   home**, and **sticker quantity**, then click **Add to batch**.
2. Repeat for every decedent in this run — the list below the form keeps
   growing. Click **Edit** on any row to correct it, or **Remove** to drop
   it.
3. When the batch is complete:
   - **Print All Certificates** opens one PDF with one certificate page
     per decedent, in the order they were added.
   - **Print All Stickers** opens one PDF with every decedent's stickers
     packed onto Avery 8464 sheets (six per sheet), continuing seamlessly
     from one decedent into the next rather than starting a fresh sheet
     for each person.
   - Each opens in a new browser tab — use your browser's own Print
     button (or Ctrl+P) from there to print or save as PDF.
4. **Clear Entire Batch** removes everything and starts fresh once a
   day's printing is done.

The batch list is saved to this browser's local storage as you go, so an
accidental tab close won't lose your work — it'll still be there next time
you open `index.html` in the same browser on this computer. It is **not**
synced anywhere else; a different computer or browser starts empty.

## Reading a name from a photo

The "Fill in the name from a photo" card on the form lets you take a photo
of a printed Burial-Transit Permit and have Google's Gemini AI read the
decedent's name off it, pre-filling the First/Middle/Last/Suffix fields for
you to check — nothing is added to the batch until you click **Add to
batch** yourself, same as typing it in by hand.

This is the one part of the app that needs the internet and a Google API
key:

1. Get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
   (a Google account is required, but the free tier needs no credit card or
   billing setup for the volume this app expects).
2. Paste it into the "Google (Gemini) API key" field and click **Save key**
   — it's stored only in this browser's local storage on this computer, the
   same way the batch list is, and is sent only to Google's API.
3. Choose or take a photo. That one photo is uploaded to Google to be read,
   then discarded; nothing else in the app leaves this computer.

If you'd rather not use this at all, just leave the key blank and type the
name in manually as before — the field never requires a photo.

## What's reused from the Android app

The certificate layout, the Avery 8464 label geometry, the 20 imported
funeral-home profiles (including the documented exceptions for Lavon,
Sachse, Princeton, Commerce, and Hiett's), and every font size and
coordinate are ported directly from the Android app's Kotlin source
(`CertificateGenerator.kt`, `LabelSheetGenerator.kt`, `LabelPagination.kt`,
`SeedProfiles.kt`) — the printed output should look identical to what the
Android app produces for a single case.

## What's different from the Android app

- Can optionally fill in the name from a photo of a printed Burial-Transit
  Permit, via the Gemini API (see "Reading a name from a photo" below) — the
  Android app's OCR uses on-device ML Kit instead.
- No persistent funeral-home profile editor (Manage Funeral Homes) — the 20
  imported profiles are fixed. If you need to add or edit a profile, let
  Claude know and it can be added to `profiles.js`.

## Files

- `index.html` / `styles.css` — the page itself
- `app.js` — batch list state and UI wiring
- `pdfgen.js` — certificate and label PDF drawing (ported layout math)
- `profiles.js` — the 20 funeral-home profiles
- `text.js` — name/date formatting helpers
- `logos.js` — profile logos, embedded as base64 so no separate image files
  are needed
- `geminiVision.js` — the "read a name from a photo" feature (Gemini API
  call, API key storage)
- `lib/pdf-lib.min.js` — the PDF-generation library (vendored locally, not
  loaded from the internet)
