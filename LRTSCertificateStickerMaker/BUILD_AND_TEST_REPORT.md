# Build & Test Report

## Status: source project complete; build could not be executed in this session

**No APK was produced.** Per the task's explicit instruction ("Do not claim
that an APK was created unless the Android build completed successfully"),
this report does not claim one exists. `LRTS_Certificate_Sticker_Maker_Mock_Test_v0.1.apk`
is **not** included in this delivery.

## Why the build didn't run

This session's outbound network policy blocks `dl.google.com` and
`maven.google.com` (confirmed via the sandbox's own proxy status endpoint,
which reported `connect_rejected` / HTTP 403 policy denials for both hosts).
Every other host tested (Maven Central, the Gradle distribution server, the
Ubuntu package archive) is reachable — only Google's two Android/AndroidX
Maven hosts are blocked.

Running the real command produces this, at the Gradle **configuration**
stage, before any compilation or test execution begins:

```
$ ./gradlew test assembleDebug --stacktrace

FAILURE: Build failed with an exception.

* Where:
Build file '.../LRTSCertificateStickerMaker/build.gradle.kts' line: 2

* What went wrong:
Plugin [id: 'com.android.application', version: '8.7.3', apply: false] was not found in any of the following sources:
- Gradle Core Plugins (plugin is not in 'org.gradle' namespace)
- Included Builds (No included builds contain this plugin)
- Plugin Repositories (could not resolve plugin artifact 'com.android.application:com.android.application.gradle.plugin:8.7.3')
  Searched in the following repositories:
    Google
    MavenRepo
    Gradle Central Plugin Repository
```

The Android Gradle Plugin itself is only published to Google's Maven
repository — with that host blocked, Gradle cannot even resolve the plugin
that reads the rest of `build.gradle.kts`, let alone reach AndroidX, Compose,
Room, CameraX, or ML Kit (all likewise Google-Maven-only). The full log is at
`gradle_build_log.txt` alongside this report.

**This is an environment/network constraint, not a defect in the project.**
The project itself (Gradle wrapper, `build.gradle.kts`, all Kotlin/Compose
source, resources, and tests) is complete and unchanged from what a normal
network-enabled build would consume.

## What was actually, genuinely verified

The main Android module's own `./gradlew test` never ran, since Gradle
couldn't even configure the project (see above). But every domain/pagination
class in `app/src/main/java/.../domain/` and `pdf/LabelPagination.kt` has
**zero Android-framework dependencies** — they're plain Kotlin. To get a real
(not hand-traced) signal on the highest-risk logic — name matching, date
parsing, disc-number extraction, BTP/log extraction, and Avery pagination
math — those files plus their tests were copied into a throwaway
`kotlin("jvm")` Gradle project in this session (dependencies from Maven
Central only, no Android/Google Maven involved) and actually compiled and run:

```
$ gradle test
BUILD SUCCESSFUL in 24s
4 actionable tasks: 4 executed
```

Real, tool-reported results (from the generated JUnit XML, not hand-counted):

| Test class | Tests | Failures | Errors |
|---|---:|---:|---:|
| `domain.TextNormalizationTest` | 6 | 0 | 0 |
| `domain.NameMatcherTest` | 6 | 0 | 0 |
| `domain.DateParsingTest` | 12 | 0 | 0 |
| `domain.DiscNumberExtractionTest` | 6 | 0 | 0 |
| `domain.BtpNameExtractionTest` | 8 | 0 | 0 |
| `domain.LogExtractionTest` | 6 | 0 | 0 |
| `pdf.LabelPaginationTest` | 11 | 0 | 0 |
| **Total** | **55** | **0** | **0** |

This genuinely exercises the All Texas (3 @ 1,3,6), Pilar (1 @ 4), Temple and
Sons (2 @ 2,6), and Hiett's (full sheet of 6) scenarios, the multipage
spillover case, the no-hard-coded-"17" rule, and every date/name-matching
edge case — with real pass/fail results, not predictions. It does **not**
cover anything that touches `android.graphics.pdf.PdfDocument`, Room, or
Compose (those files do require the Android SDK and could not be compiled in
this session), so the tests below are still unverified pending a real build.

### Local toolchain confirmed present and working (independent of Google's Maven)

- OpenJDK 21 (satisfies the JDK 17 requirement)
- Gradle 8.14.3 — installed and runs; the wrapper (`./gradlew`, `gradle/wrapper/gradle-wrapper.jar` + `.properties`) was generated from this same local Gradle install and is committed to the project
- `aapt`, `apksigner`, `zipalign`, `dmtracedump`, `hprof-conv`, `etc1tool`, Android platform-tools — installed via the Ubuntu package archive (`archive.ubuntu.com`, unaffected by the Google Maven block) and available for APK verification once a real build produces one

### Test files and what each covers (`app/src/test/java/...`)

| File | Covers |
|---|---|
| `domain/TextNormalizationTest.kt` | `clean_text`/`normalize_name`/`display_name` port fidelity |
| `domain/NameMatcherTest.kt` | BTP/log identity matching, GOOD/WARN/BAD thresholds (88%/68%) |
| `domain/DateParsingTest.kt` | Every date format `app.py` supported, two-digit-year pivot, out-of-range/invalid rejection |
| `domain/DiscNumberExtractionTest.kt` | Disc-number extraction; explicitly asserts **no hard-coded "17" prefix** is ever added, and that a disc number genuinely starting with 17 is preserved as-is |
| `domain/BtpNameExtractionTest.kt` | BTP name-label extraction + the new first/middle/last/suffix splitting |
| `domain/LogExtractionTest.kt` | Cremation-log name/date/disc extraction, header-row skipping, and multi-row detection (each row's fields never borrowed from another row) |
| `pdf/LabelPaginationTest.kt` | **All Texas** (3 @ 1,3,6), **Pilar** (1 @ 4), **Temple and Sons** (2 @ 2,6), **Hiett's** (full sheet of 6), multipage spillover (10 labels / 3 first-sheet positions → 3 pages), quantity clamping (1-60), position sanitizing, US Letter/Avery 8464 geometry constants, position 1 vs. 6 coordinates |
| `pdf/CertificateGeneratorTest.kt` | The required "Jake Hansen" test certificate (clearly-marked test date/disc), certificate page-size assertion (540×396.85pt, not US Letter), and required-field validation blocking (each of the three required fields, individually and together) |
| `pdf/LabelSheetGeneratorTest.kt` | Real `PdfDocument` generation + page-count assertions for All Texas/Pilar/Temple and Sons/Hiett's, **Commerce's blank disclosure** (generates without error, no fallback text substituted), the 10-label/3-position multipage case, missing-name and no-positions validation blocking, and rendered page height matching US Letter (792pt) |
| `data/model/JobStateTest.kt` | Manual-correction override behavior, and required-confirmation blocking (`certificateReady`/`labelsReady` both stay false until `reviewConfirmed` is true, independent of whether every other field is filled) |
| `data/db/SeedProfilesTest.kt` | All 20 imported profiles' default quantities against `IMPORTED_AVERY_TEMPLATE_NOTES.md`; Lavon's flagged/blank design reference; Sachse consolidated into one profile with an alternate; Princeton excludes the McKinney page; Commerce's blank disclosure; Hiett's full-sheet default; the suppressed-print-text profiles (Pilar/Mesquite/Allen Family/Chamberland/Hiett's) vs. the fallback ones |
| `data/db/FuneralHomeProfileDaoTest.kt` | Profile persistence via a real (in-memory) Room database: seeding, reload-after-query, update, deactivate-without-delete, and the built-in All Texas Cremation profile's delete protection |

The Robolectric-backed tests (`CertificateGeneratorTest`, `LabelSheetGeneratorTest`,
`FuneralHomeProfileDaoTest`) pull `org.robolectric:robolectric` from Maven
Central (reachable in this session) rather than Google's Maven, but they
still cannot run here because the build never gets past plugin resolution.

### Not covered by an automated test

- Camera capture UI, Photo Picker flow, and Print Framework dialog
  interaction — these require either a real device/emulator (instrumented
  `androidTest`) or manual verification, neither of which was available in
  this sandboxed session.
- Visual/pixel-level fidelity of the disclosure paragraph's word-wrap against
  reportlab's own `Paragraph` flowable — the port uses a plain greedy
  word-wrap with the same font size/leading/wrap-width constants (see
  `LabelSheetGenerator.drawDisclosure()`'s doc comment); layout constants
  match exactly, but reportlab's internal glyph metrics were not
  reproduced exactly.

## How to actually run the build

On a machine or CI runner with normal internet access:

```bash
cd LRTSCertificateStickerMaker
./gradlew test assembleDebug
```

Then verify the resulting APK:

```bash
$ANDROID_HOME/build-tools/<version>/apksigner verify --print-certs app/build/outputs/apk/debug/app-debug.apk
$ANDROID_HOME/build-tools/<version>/aapt dump badging app/build/outputs/apk/debug/app-debug.apk
apkanalyzer apk summary app/build/outputs/apk/debug/app-debug.apk
```

If this comes back green, rename the output to
`LRTS_Certificate_Sticker_Maker_Mock_Test_v0.1.apk` per the requested
deliverable name.

## Screenshots

Not included, for the same reason as the APK: taking a real screenshot
requires a running app on a device or emulator, and no build could be
produced in this session to run. `MIGRATION_MAP.md` and the Compose source
under `app/src/main/java/.../ui/screens/` describe every screen's layout and
content in detail in the meantime.
