# Metro Certificate & Sticker Maker — Desktop (Web App)

A browser-based, batch-entry companion to the Android app. No installation,
no build step, no server — everything runs locally in your browser and
nothing is ever sent over the network.

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

## What's reused from the Android app

The certificate layout, the Avery 8464 label geometry, the 20 imported
funeral-home profiles (including the documented exceptions for Lavon,
Sachse, Princeton, Commerce, and Hiett's), and every font size and
coordinate are ported directly from the Android app's Kotlin source
(`CertificateGenerator.kt`, `LabelSheetGenerator.kt`, `LabelPagination.kt`,
`SeedProfiles.kt`) — the printed output should look identical to what the
Android app produces for a single case.

## What's different from the Android app

- No OCR/document scanning here — this is manual batch entry only, matching
  the Android app's current manual-entry-only flow.
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
- `lib/pdf-lib.min.js` — the PDF-generation library (vendored locally, not
  loaded from the internet)
