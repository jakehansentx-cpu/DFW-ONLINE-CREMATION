# LRTS Certificate & Sticker Maker — Mock Test

A self-contained Android app for creating LRTS certificates of cremation and
Avery 8464 cremated-remains labels. Ported from the Python/browser mockup
included in `LRTS_Certificate_Sticker_Maker_Mock_Test_v1.1_Avery_Profiles_2026-08-13.zip`
(see `MIGRATION_MAP.md` for exactly what carried over). Runs entirely on the
phone — no Python, no server, no internet connection required after install.

- Package ID: `com.lastresponder.certificatestickermaker`
- Min SDK 26 (Android 8.0), target/compile SDK 35
- Kotlin + Jetpack Compose, Room, CameraX + system Photo Picker, bundled
  (offline) ML Kit Latin text recognition, `android.graphics.pdf.PdfDocument`,
  Android Print Framework, `FileProvider`

**Build status**: see `BUILD_AND_TEST_REPORT.md` — this session's sandboxed
network policy blocks the Android Gradle Plugin / AndroidX / Compose / Room /
CameraX / ML Kit downloads (`dl.google.com`, `maven.google.com`), so the
actual `./gradlew test assembleDebug` run could not complete inside this
environment. The report shows the exact failure and everything needed to run
the real build on a normal machine or in Android Studio, both of which have
unrestricted network access.

## Sideloading onto a Samsung/Android phone

1. Build the debug APK (see "Rebuilding" below) or use a prebuilt
   `LRTS_Certificate_Sticker_Maker_Mock_Test_v0.1.apk`.
2. Copy the APK to the phone (USB cable, or a link/drive you trust).
3. On the phone: **Settings → Apps → Special access → Install unknown apps**,
   choose the app you'll open the APK with (e.g. Files, or your browser), and
   allow it. On Samsung devices this is the same setting under **Settings →
   Security and privacy → Install unknown apps**.
4. Open the APK on the phone and tap **Install**. Since this is a debug
   build, Android will show an "unverified app" warning — that's expected for
   a sideloaded mock-test build, not a sign of a corrupted file.
5. Launch **LRTS Certificate & Sticker Maker**.

To reinstall over an existing copy, just install the new APK over the old one
(same package ID keeps your saved funeral-home profiles).

## Required permissions

Only one runtime permission is requested, and only when you use it:

- **Camera** — requested the first time you tap "Take or retake BTP/log
  photo." Declining it just means you use "Choose from gallery" instead.

Nothing else is requested. There is **no Internet permission** in the
manifest (OCR runs fully offline via bundled ML Kit; profiles live in a local
Room database; PDFs are written to app-scoped storage). No broad storage
permission is requested either — photo selection uses the system Photo
Picker and saved PDFs use `FileProvider` + app-external storage.

## Taking or selecting document photos

On the BTP and cremation-log screens:

- **Take or retake photo** starts an in-app CameraX preview; tap the shutter
  button to capture. The photo is stored in the app's private cache, never
  shared elsewhere until you choose to.
- **Choose from gallery** opens the system Photo Picker — no permission
  prompt, and the app never gets broader access to your photo library than
  the one image you pick.
- After capturing/picking, tap **Extract [BTP name / log information]** to
  run on-device OCR. If the cremation log shows more than one row, you'll be
  asked which row is the correct one before anything is filled in.
- Every extracted value is editable on the next screen, and the app will not
  let you print until you've compared both source photos side-by-side and
  checked "I reviewed the source documents and confirm this information is
  correct."

## Printing through Android

On the Certificate Preview and Label Preview screens:

- **Print** opens the standard Android print dialog (Android Print
  Framework) with the PDF already laid out at actual size — print at
  **100% / Actual Size** on your printer's settings for the certificate stock
  paper or Avery 8464 sheets.
- **Save PDF** copies the file into your device's Downloads folder (Android
  10+) so it's easy to find outside the app.
- **Open PDF** hands the file to any installed PDF viewer.
- **Share PDF** opens the system share sheet (email, messaging, cloud
  storage you choose — the app itself never uploads anything on its own).

## Adding a funeral-home profile

From **Home → Manage Funeral Homes**, or from the funeral-home selection
screen mid-case:

1. Tap **+** to add a new profile, or **Edit** on an existing one.
2. Fill in the funeral-home name, city/state, default sticker quantity,
   preface text, and disclosure text (leave disclosure blank for a profile
   like Commerce that doesn't use the standard wording).
3. Optionally upload a logo image and/or the original sticker-design
   reference (PDF or image) for future reference.
4. Tap **Generate test label preview** to see exactly how the sticker will
   print before saving.
5. Tap **Save Funeral-Home Profile**.

Use **Duplicate profile** (on the edit screen) when a new location only needs
a different logo or city/state — this copies every other field instead of
starting from scratch. Toggle **Active** off to hide a profile from the
label-printing flow without deleting it. Profiles live in a local Room
database and are completely separate from the current case: tapping **Clear
Current Job** never touches them.

## Rebuilding the APK

Requires a machine (or CI) with normal internet access — Gradle needs to
download the Android Gradle Plugin, AndroidX/Compose/Room/CameraX/ML Kit from
Google's Maven repository the first time.

```bash
cd LRTSCertificateStickerMaker
./gradlew test assembleDebug
```

- Unit tests run under `app/src/test/...` (pure-Kotlin domain logic plus
  Robolectric-backed PDF/Room tests — no emulator needed).
- The debug APK is written to
  `app/build/outputs/apk/debug/app-debug.apk`.
- To verify the built APK:
  ```bash
  # Signature / cert info
  $ANDROID_HOME/build-tools/<version>/apksigner verify --print-certs app-debug.apk
  # Manifest / permissions / package summary
  $ANDROID_HOME/build-tools/<version>/aapt dump badging app-debug.apk
  # APK size, DEX, resource breakdown
  apkanalyzer apk summary app-debug.apk
  ```

Opening the `LRTSCertificateStickerMaker/` folder directly in Android Studio
(Giraffe or newer, with JDK 17) also works and is the easiest path if you
don't want to use the command line — Android Studio will fetch the same
dependencies and can run/debug directly on a connected device or emulator.

## Privacy and security

- Decedent information and source-document photos never leave the device —
  no analytics, no crash reporting, no cloud upload of any kind.
- OCR runs fully offline (bundled ML Kit model, ships inside the APK).
- No production credentials of any kind are required to build or run this
  app.
- **Clear Current Job** (Home screen and Results screen) deletes every
  temporary photo and working PDF for the case in progress. It never deletes
  funeral-home profiles, which are stored separately.

## Mock-test status

This is a mock-test build for training and workflow verification. Automated
tests use fictional names/dates only ("Jake Hansen," clearly marked test
dates and disc numbers) — see `BUILD_AND_TEST_REPORT.md`.
