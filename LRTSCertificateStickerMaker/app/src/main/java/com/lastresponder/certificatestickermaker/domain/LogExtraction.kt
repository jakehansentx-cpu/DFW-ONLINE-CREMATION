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

    // Spreadsheet/browser interface vocabulary that photographing a live app window
    // (instead of a printed log page) can pick up - these superficially match the
    // same "Capitalized Word Capitalized Word" shape as a real name, so a candidate
    // line built entirely from these words is rejected as UI chrome, not a row.
    private val UI_CHROME_WORDS = setOf(
        "HOME", "INSERT", "DRAW", "PAGE", "LAYOUT", "FORMULAS", "DATA", "REVIEW", "VIEW",
        "AUTOMATE", "HELP", "ACROBAT", "AUTOSAVE", "UPGRADE", "YOUR", "PLAN", "SEARCH",
        "WINDOWS", "WINDOW", "NAVIGATION", "FORMULA", "BAR", "FOCUS", "CELL", "SHOW",
        "RULER", "GRIDLINES", "SWITCH", "MODES", "MODE", "DARK", "MACROS", "ZOOM",
        "SHEET", "VIEWS", "SYSTEM", "WORKBOOK", "DISPLAY", "SETTINGS", "ACCESSIBILITY",
        "EDIT", "GOOD", "ARRANGE", "ALL", "SELECTION", "TYPE", "CREMATION", "LOG",
        "SAVED", "SHARE", "COMMENTS", "ORGANIZE", "FILE"
    )

    private fun isUiChromeLine(candidateWords: String): Boolean {
        val tokens = candidateWords.split(Regex("[\\s,]+")).filter { it.isNotBlank() }
        if (tokens.isEmpty()) return false
        return tokens.all { it.uppercase().trim('\'', '-') in UI_CHROME_WORDS }
    }

    fun extractLogName(text: String): String {
        val lines = text.lines().map { TextNormalization.cleanText(it) }.filter { it.isNotEmpty() }
        for (line in lines) {
            if (SKIP_HEADER.containsMatchIn(line)) continue
            val match = NAME_LINE.find(line) ?: continue
            if (isUiChromeLine(match.groupValues[1])) continue
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

    data class LogRowCandidate(
        val name: String,
        val cremationDate: String,
        val discId: String,
        val rawLine: String
    )

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
            if (isUiChromeLine(match.groupValues[1])) continue
            val name = TextNormalization.displayName(match.groupValues[1])
            rows.add(LogRowCandidate(name, extractLogDate(line), extractLogDisc(line), line))
        }
        return rows
    }
}
