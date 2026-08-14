# Migration Map — Python/Web Mock → Android

This documents exactly which pieces of `LRTS_Certificate_Sticker_Maker_Mock_Test_v1.1_Avery_Profiles_2026-08-13.zip`
were carried into the Android app, where they ended up, and what changed.
Nothing certificate- or label-affecting was invented; anything not present in
the source package is called out explicitly below.

## Source package inventory

| Source file/folder | What it is |
|---|---|
| `app.py` (735 lines) | Python stdlib HTTP server: OCR (Tesseract), name/date/disc extraction, reportlab certificate + Avery 8464 PDF generation, profile CRUD |
| `static/index.html`, `static/app.js`, `static/styles.css` | The browser mockup UI, its client-side name-match scoring, and the LRTS color palette |
| `data/funeral_home_profiles.json` | The 20 imported funeral-home profiles (name, city/state, quantity, disclosure, header mode, logo/design paths) |
| `data/profile_uploads/imported_avery/*.pdf` (20 files) | Original Avery preview PDFs, kept for visual reference |
| `data/profile_uploads/imported_avery/*.png`, `assets/all_texas_logo.png` | Funeral-home logos |
| `IMPORTED_AVERY_TEMPLATE_NOTES.md` | Import notes: default quantities and the Lavon/Sachse/Princeton/Commerce/Hiett's exceptions |
| `requirements.txt`, `START_APP_*.{bat,sh}` | Python/launcher scaffolding — not applicable to a standalone Android app |

## Certificate layout (`make_certificate()` → `CertificateGenerator.kt`)

Ported line-for-line, including the exact page size and every coordinate:

- Page size: **540 × 396.85 pt** (the source's Metro stock-paper certificate — this is *not* US Letter; the task's "US Letter print-ready PDF" requirement applies to the Avery label sheet, and the certificate keeps its original stock-paper dimensions per "preserve the stock-paper/template layout").
- Border rectangles at `(10,10)`/`(15,15)` with the same `#003A9B` blue and line weights.
- Every text block's x/y, font size, and shrink-to-fit behavior (`draw_centered_fit`) is unchanged.
- Fonts: DejaVu Sans / DejaVu Sans Bold (the same faces `app.py` registered from `/usr/share/fonts/truetype/dejavu/`), bundled as Android assets under `app/src/main/assets/fonts/` so rendering doesn't depend on the OS.
- Backend changed from reportlab's `canvas.Canvas` to `android.graphics.pdf.PdfDocument`, bridged by `ReportLabStyleCanvas.kt`, a coordinate-flipping wrapper that lets the Kotlin code keep reportlab's bottom-up x/y numbers unchanged instead of hand-deriving a new layout.

## Avery 8464 label layout (`draw_label()` / `make_labels()` → `LabelSheetGenerator.kt` / `LabelPagination.kt`)

Ported line-for-line:

- US Letter page (612 × 792 pt), six 4in × 3⅓in labels, 0.25in side margin, 0.5in top margin, positions 1 (upper-left) through 6 (lower-right).
- Quantity/position fill algorithm: first-sheet selected positions are used first (capped at quantity); anything beyond that starts a fresh sheet at position 1 and fills complete sheets of six. Identical to `app.py`'s loop.
- Every label element's x/y/size: header logo box (`x+92, y+h-69, 104×56`), preface line, name (shrink-to-fit 15pt→9pt), funeral home / city-state lines, and the disclosure paragraph's font size (6.4pt), leading (7.1pt), wrap width (`w-32`), and the 43pt vertical-centering band 17pt above the label's bottom edge.
- **Preserved subtlety**: several profiles (Pilar, Mesquite, Allen Family, Chamberland, Hiett's) carry an explicit-but-blank `print_funeral_home`/`print_city_state` key in the source JSON, which suppresses that text on the label because their logo art already shows the name. This is modeled as a *nullable* field (`null` = key absent → fall back to `funeralHome`/`funeralHomeCityState`; `""` = key present and blank → print nothing) in `FuneralHomeProfileEntity`, exactly reproducing the Python dict `"key" in case` check.

## Funeral-home profiles (`data/funeral_home_profiles.json` → `SeedProfiles.kt`)

All 20 imported profiles were carried over field-for-field: id, funeral home name, city/state, default quantity, preface, disclosure, logo path, header mode/text, and design-reference path. Logos and the 20 original Avery preview PDFs are bundled as Android assets under `app/src/main/assets/profiles/` (and `.../design_refs/`) and seeded into Room on first launch.

| Funeral home | Default qty | Note |
|---|---:|---|
| All Texas Cremation | 3 | Built-in, protected from deletion (matches `app.py`'s hard-coded default) |
| Martin Oaks Cemetery and Crematory | 4 | |
| Funeraria Pilar Funeral Home | 1 | Suppressed print_funeral_home/print_city_state |
| Mesquite Funeral Home | 2 | Suppressed print_funeral_home/print_city_state |
| Allen Family Funeral Options | 2 | Suppressed print_funeral_home/print_city_state |
| Chamberland Funerals & Cremations | 2 | Suppressed print_funeral_home/print_city_state |
| Charles W Smith & Sons, Lavon | 2 | **Design reference intentionally left blank** — see exception below |
| Charles W Smith & Sons, Sachse | 2 | Primary + one alternate reference (consolidated, not duplicated) |
| Williams Funeral Directors, Garland | 2 | |
| Charles W. Smith and Sons, McKinney | 4 | |
| Eastgate Funeral Home, Garland | 2 | |
| Steven G Hill's House of Funerals, Plano | 2 | |
| Allen Funeral Home, Wylie | 2 | |
| Hiett's LyBrand Funeral Home | 6 | Full-sheet default preserved as-is |
| Byrum Funeral Home, Lancaster | 2 | |
| Temple and Sons Funeral Directors, Oklahoma City | 2 | Text header mode (no logo) |
| Commerce Funeral Home & Cremation Service | 2 | **Blank disclosure** — see exception below |
| Fry-Gibbs Funeral Home, Paris | 2 | |
| Charles Smith and Sons Funeral Home, Princeton | 2 | Page 1 of the source PDF only |
| Queen City Funeral Home | 2 | Text header mode (no logo) |

### Source exceptions (carried over exactly as flagged in `IMPORTED_AVERY_TEMPLATE_NOTES.md`)

- **Lavon**: the supplied Avery link duplicated Chamberland's design. The Android profile's `designReferencePath` is left **blank** and `sourceStatus = "needs-correct-avery-link"`, surfaced in both the profile manager and the funeral-home selection screen. It does **not** silently borrow Chamberland's PDF.
- **Sachse**: the two supplied links are consolidated into **one** profile (`charles-w-smith-sachse`) with a primary `designReferencePath` and one `alternateDesignReferencePaths` entry — not two separate profiles.
- **Princeton**: only page 1 of `19_charles_smith_princeton.pdf` (the actual Princeton content) is used. Page 2's unrelated McKinney name-only labels are not referenced by the Princeton profile.
- **Commerce**: `disclosure = ""` — no standard disclosure text, preserved as an explicit blank rather than defaulted to the standard paragraph.
- **Hiett's**: default quantity stays **6** (full sheet), not shrunk to match the more common default of 2.

## Extraction / matching logic (`app.py` → `domain/*.kt`)

Ported as pure, unit-tested Kotlin functions with unchanged regexes and thresholds:

- `clean_text`, `normalize_name`, `display_name` → `TextNormalization.kt`
- `parse_date`, `pretty_date` (including the %y century-pivot rule and the 1900-2100 sanity window) → `DateParsing.kt`
- `extract_log_disc` → `DiscNumberExtraction.kt`. **"17" is never hard-coded or prepended** — see the code comment and `DiscNumberExtractionTest`.
- `extract_btp_name` → `BtpNameExtraction.kt`
- `extract_log_name` / `extract_log_date` / `extract_log_fields` → `LogExtraction.kt`
- Identity match scoring: the source has two implementations — a server-side `similarity()` (Python `difflib.SequenceMatcher`) that is defined but never actually wired into a route, and a client-side `nameScore()` in `static/app.js` (Levenshtein-based) that drives the live mismatch banner the user actually sees. The Android port (`NameMatcher.kt`) uses the **Levenshtein** version with the same 88%/68% thresholds, since that is the algorithm that was actually live in the mockup's UI.

### New, not from the source (clearly separate additions)

- **Legal-name field splitting** (`BtpNameExtraction.splitLegalName` → first/middle/last/suffix). The source only ever handled the decedent name as a single string; the task requires discrete fields for BTP review. This is a deterministic reformatting of an already-confirmed name string — it invents no data.
- **Multi-row cremation-log detection** (`LogExtraction.extractLogRows`). `app.py`'s `extract_log_name`/`extract_log_date`/`extract_log_disc` only ever returned one best guess from the whole page. The task requires "if multiple log rows are detected, let the employee choose the correct row," so the same per-field regexes are now applied per line instead of only once globally, producing a list of row candidates instead of a single silent guess.
- Camera capture (CameraX), the Android Print Framework integration, FileProvider-based Open/Share, and Room-backed profile storage are new Android-native infrastructure with no Python equivalent (the source ran a local HTTP server + browser instead).

## What was *not* migrated

- `app.py`'s HTTP server itself, Tesseract OCR, and the browser UI (`static/*`) — replaced by an on-device app, bundled ML Kit OCR, and Jetpack Compose, per the task's explicit requirement to remove the Python/server dependency.
- `requirements.txt` (Pillow, reportlab) and the `START_APP_*` launcher scripts — not applicable to an installed Android app.

## Known gap: Lavon's real Avery design

The Lavon profile's design-reference PDF is genuinely missing from the source package (the supplied link only ever pointed at Chamberland's design). This is flagged in-app (`sourceStatus = "needs-correct-avery-link"`) rather than guessed at. If the correct Lavon Avery file becomes available, drop it into
`app/src/main/assets/profiles/design_refs/` and update `SeedProfiles.kt`'s `charles-w-smith-lavon` entry's `designReferencePath` (or replace it via the in-app profile editor's "Upload reference PDF/image").
