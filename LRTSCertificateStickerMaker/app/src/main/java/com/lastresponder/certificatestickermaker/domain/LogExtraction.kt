package com.lastresponder.certificatestickermaker.domain

/**
 * Cremation-log extraction. `extractLogName`/`extractLogDate`/`extractLogDisc`
 * and [extractLogFields] are direct ports of `app.py`'s
 * `extract_log_name` / `extract_log_date` / `extract_log_disc` / `extract_log_fields`.
 *
 * [extractLogRows] is a new addition, required because the source mock only
 * ever returned a single best-guess field set from the whole photo. When a
 * cremation-log page lists more than one decedent, this re-applies the same
 * per-field regexes one log line at a time so the review screen can list every
 * plausible row and let the employee pick the correct one, instead of the app
 * silently guessing.
 */
object LogExtraction {

    private val SKIP_HEADER = Regex("(?i)DECEASED NAME|I\\.?D\\.?\\s*(DISC|DISK)|FUNERAL HOME")
    private val NAME_LINE = Regex("^([A-Za-z][A-Za-z'\\-]+(?:\\s+|,\\s*)[A-Za-z][A-Za-z'\\-]+)")
    private val LOG_DATE = Regex("""\b\d{1,2}[\-/.]\d{1,2}(?:[\-/.]\d{2,4})?\b""")
    private val SHORT_DATE = Regex("""^(\d{1,2})[\-/.](\d{1,2})$""")

    // Words that can produce a false-positive "Capitalized Word Capitalized Word"
    // name match without actually naming a decedent. Two distinct real-world
    // causes feed this same list: (1) photographing a live spreadsheet/browser
    // window instead of a printed page picks up ribbon/menu chrome ("Page
    // Layout", "Switch Windows"); (2) a printed log's own column headers - things
    // like "APRX WT" or "Start Time" - get recognized as their own table cell/line
    // (rather than folded into the "DECEASED NAME ... FUNERAL HOME" header line
    // [SKIP_HEADER] matches), and abbreviated header text can misread as a
    // plausible-looking name (e.g. "APRX WT" -> "Apri Nt"). A candidate line
    // built entirely from these words is rejected either way.
    private val NON_NAME_WORDS = setOf(
        "HOME", "INSERT", "DRAW", "PAGE", "LAYOUT", "FORMULAS", "DATA", "REVIEW", "VIEW",
        "AUTOMATE", "HELP", "ACROBAT", "AUTOSAVE", "UPGRADE", "YOUR", "PLAN", "SEARCH",
        "WINDOWS", "WINDOW", "NAVIGATION", "FORMULA", "BAR", "FOCUS", "CELL", "SHOW",
        "RULER", "GRIDLINES", "SWITCH", "MODES", "MODE", "DARK", "MACROS", "ZOOM",
        "SHEET", "VIEWS", "SYSTEM", "WORKBOOK", "DISPLAY", "SETTINGS", "ACCESSIBILITY",
        "EDIT", "GOOD", "ARRANGE", "ALL", "SELECTION", "TYPE", "CREMATION", "LOG",
        "SAVED", "SHARE", "COMMENTS", "ORGANIZE", "FILE",
        "APRX", "APPROX", "WT", "WEIGHT", "START", "TIME", "FINGERPRINT", "FINGERPRINTS",
        "PRINTS", "RETORT", "OPERATOR", "CASE", "LARGE", "LARG", "SMALL", "MEDIUM", "ADULT"
    )

    private fun isNonNameLine(candidateWords: String): Boolean {
        val tokens = candidateWords.split(Regex("[\\s,]+")).filter { it.isNotBlank() }
        if (tokens.isEmpty()) return false
        return tokens.all { it.uppercase().trim('\'', '-') in NON_NAME_WORDS }
    }

    // Small slack (pixels, in the recognized bitmap's own coordinate space) for
    // same-row jitter - e.g. a row's name cell and date cell not sitting at
    // the exact same y. Deliberately smaller than a real row's height so a
    // split-off header cell (a different row) is not pulled in as well.
    private const val HEADER_ROW_TOLERANCE = 15

    /**
     * Anything positioned above the row containing the first recognized date
     * is treated as header noise (spreadsheet column letters, app ribbon/menu
     * chrome, the log's own "Deceased Name / Date / ... " column headers) and
     * dropped before name matching even runs. This is a page-layout fact - the
     * header sits above the data - so it holds regardless of how a given
     * header cell's text actually gets misread by OCR, which a fixed keyword
     * list can never fully anticipate (e.g. "APRX WT" misread as "Apri Nt").
     * When no date is recognized anywhere, nothing is filtered here and
     * [NON_NAME_WORDS] remains the only line of defense.
     */
    private fun eligibleDataLines(ocrLines: List<OcrLine>): List<OcrLine> {
        val firstDataRowTop = ocrLines
            .filter { LOG_DATE.containsMatchIn(it.text) }
            .minOfOrNull { it.top } ?: return ocrLines
        return ocrLines.filter { it.top >= firstDataRowTop - HEADER_ROW_TOLERANCE }
    }

    /** Preferred entry point when ML Kit's line positions are available. */
    fun extractLogName(ocrLines: List<OcrLine>): String =
        extractLogName(eligibleDataLines(ocrLines).joinToString("\n") { it.text })

    fun extractLogName(text: String): String {
        val lines = text.lines().map { TextNormalization.cleanText(it) }.filter { it.isNotEmpty() }
        for (line in lines) {
            if (SKIP_HEADER.containsMatchIn(line)) continue
            val match = NAME_LINE.find(line) ?: continue
            if (isNonNameLine(match.groupValues[1])) continue
            return TextNormalization.displayName(match.groupValues[1])
        }
        return ""
    }

    fun extractLogDate(text: String): String {
        for (match in LOG_DATE.findAll(text)) {
            val value = match.value
            if (DateParsing.parseDate(value) != null) return value
            val short = SHORT_DATE.matchEntire(value)
            if (short != null) {
                val month = short.groupValues[1].toInt()
                val day = short.groupValues[2].toInt()
                val year = java.time.Year.now().value
                try {
                    return java.time.LocalDate.of(year, month, day).toString()
                } catch (error: java.time.DateTimeException) {
                    // fall through to the next candidate
                }
            }
        }
        return ""
    }

    fun extractLogDisc(text: String): String = DiscNumberExtraction.extractDiscId(text)

    data class LogFields(val logName: String, val cremationDate: String, val discId: String)

    /** Whole-page best guess (mirrors `extract_log_fields`). */
    fun extractLogFields(text: String): LogFields =
        LogFields(extractLogName(text), extractLogDate(text), extractLogDisc(text))

    /** Preferred entry point when ML Kit's line positions are available. */
    fun extractLogFields(ocrLines: List<OcrLine>): LogFields {
        val eligible = eligibleDataLines(ocrLines).joinToString("\n") { it.text }
        return LogFields(extractLogName(eligible), extractLogDate(eligible), extractLogDisc(eligible))
    }

    data class LogRowCandidate(
        val name: String,
        val cremationDate: String,
        val discId: String,
        val rawLine: String
    )

    /** Preferred entry point when ML Kit's line positions are available. */
    fun extractLogRows(ocrLines: List<OcrLine>): List<LogRowCandidate> =
        extractLogRows(eligibleDataLines(ocrLines).joinToString("\n") { it.text })

    /**
     * One candidate per log line that looks like a name row. Date/disc are
     * looked for on that same line only, so one row's data is never borrowed
     * from a different decedent's row.
     */
    fun extractLogRows(text: String): List<LogRowCandidate> {
        val lines = text.lines().map { TextNormalization.cleanText(it) }.filter { it.isNotEmpty() }
        val rows = mutableListOf<LogRowCandidate>()
        for (line in lines) {
            if (SKIP_HEADER.containsMatchIn(line)) continue
            val match = NAME_LINE.find(line) ?: continue
            if (isNonNameLine(match.groupValues[1])) continue
            val name = TextNormalization.displayName(match.groupValues[1])
            rows.add(LogRowCandidate(name, extractLogDate(line), extractLogDisc(line), line))
        }
        return rows
    }
}
