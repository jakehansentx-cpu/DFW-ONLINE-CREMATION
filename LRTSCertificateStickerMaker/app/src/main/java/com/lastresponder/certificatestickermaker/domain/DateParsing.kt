package com.lastresponder.certificatestickermaker.domain

import java.time.DateTimeException
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale

/**
 * Ported from the source mock's `app.py` (`parse_date`, `pretty_date`).
 * Deliberately mirrors the original's format list and year-sanity window
 * (1900-2100) rather than widening it, so results stay predictable.
 */
object DateParsing {

    private val MONTH_NAMES: Map<String, Int> = mapOf(
        "january" to 1, "february" to 2, "march" to 3, "april" to 4, "may" to 5, "june" to 6,
        "july" to 7, "august" to 8, "september" to 9, "october" to 10, "november" to 11, "december" to 12,
        "jan" to 1, "feb" to 2, "mar" to 3, "apr" to 4, "jun" to 6, "jul" to 7,
        "aug" to 8, "sep" to 9, "sept" to 9, "oct" to 10, "nov" to 11, "dec" to 12
    )

    private val NUMERIC_DATE = Regex("""\b(\d{1,2})[\-/.](\d{1,2})[\-/.](\d{2,4})\b""")
    private val SLASH_DATE = Regex("""^(\d{1,2})/(\d{1,2})/(\d{2}|\d{4})$""")
    private val DASH_MDY_DATE = Regex("""^(\d{1,2})-(\d{1,2})-(\d{4})$""")
    private val ISO_DATE = Regex("""^(\d{4})-(\d{1,2})-(\d{1,2})$""")
    private val MONTH_DAY_YEAR = Regex("""^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$""")

    fun parseDate(raw: String?): LocalDate? {
        val value = TextNormalization.cleanText(raw)
        if (value.isEmpty()) return null
        val candidates = mutableListOf(value)
        NUMERIC_DATE.find(value)?.let { candidates.add(0, it.value) }
        for (candidate in candidates) {
            parseWithKnownFormats(candidate)?.let { return it }
        }
        return null
    }

    /** Human-readable "Month D, YYYY" for the certificate, or the cleaned raw text if unparsable. */
    fun prettyDate(raw: String?): String {
        val parsed = parseDate(raw)
        if (parsed != null) {
            val monthName = parsed.month.getDisplayName(TextStyle.FULL, Locale.US)
            return "$monthName ${parsed.dayOfMonth}, ${parsed.year}"
        }
        return TextNormalization.cleanText(raw)
    }

    private fun parseWithKnownFormats(candidate: String): LocalDate? {
        SLASH_DATE.matchEntire(candidate)?.let { m ->
            val month = m.groupValues[1].toInt()
            val day = m.groupValues[2].toInt()
            val yearToken = m.groupValues[3]
            val year = if (yearToken.length == 4) yearToken.toInt() else pivotTwoDigitYear(yearToken.toInt())
            inRangeDate(year, month, day)?.let { return it }
        }
        DASH_MDY_DATE.matchEntire(candidate)?.let { m ->
            inRangeDate(m.groupValues[3].toInt(), m.groupValues[1].toInt(), m.groupValues[2].toInt())?.let { return it }
        }
        ISO_DATE.matchEntire(candidate)?.let { m ->
            inRangeDate(m.groupValues[1].toInt(), m.groupValues[2].toInt(), m.groupValues[3].toInt())?.let { return it }
        }
        MONTH_DAY_YEAR.matchEntire(candidate)?.let { m ->
            val month = MONTH_NAMES[m.groupValues[1].lowercase()] ?: return@let
            inRangeDate(m.groupValues[3].toInt(), month, m.groupValues[2].toInt())?.let { return it }
        }
        return null
    }

    /** Matches strptime's %y pivot: 00-68 -> 2000s, 69-99 -> 1900s. */
    private fun pivotTwoDigitYear(twoDigit: Int): Int = if (twoDigit <= 68) 2000 + twoDigit else 1900 + twoDigit

    private fun inRangeDate(year: Int, month: Int, day: Int): LocalDate? {
        if (year !in 1900..2100) return null
        return try {
            LocalDate.of(year, month, day)
        } catch (error: DateTimeException) {
            null
        }
    }
}
