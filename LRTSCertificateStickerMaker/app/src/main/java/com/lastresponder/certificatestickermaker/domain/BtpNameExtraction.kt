package com.lastresponder.certificatestickermaker.domain

/**
 * Ported from the source mock's `app.py` (`extract_btp_name`). Looks for a
 * "Name of Deceased" label first (on the same line or one of the next few
 * lines), then falls back to the first plausible two-word capitalized name
 * that isn't part of the permit's boilerplate ("Burial-Transit Permit",
 * "State of Texas", "Cremation", ...).
 */
object BtpNameExtraction {

    private val NAME_LABEL = Regex("(?i)NAME OF DECEASED(?:\\s*[-:]?\\s*)")
    private val FIELD_WORDS = Regex("(?i)\\b(FIRST|MIDDLE|LAST)\\b")
    private val EXCLUDE_FOLLOWING = Regex("(?i)AGE|SEX|DATE|METHOD")
    private val TWO_LETTERS = Regex("[A-Za-z]{2}")
    private val TWO_WORD_NAME = Regex("\\b([A-Z][A-Z'\\-]{2,})\\s+([A-Z][A-Z'\\-]{2,})\\b")
    private val EXCLUDE_TWO_WORD = Regex("(?i)BURIAL|TRANSIT|PERMIT|TEXAS|CREMATION")

    fun extractBtpName(text: String): String {
        val lines = text.lines().map { TextNormalization.cleanText(it) }.filter { it.isNotEmpty() }
        for (index in lines.indices) {
            val line = lines[index]
            if (!line.uppercase().contains("NAME OF DECEASED")) continue
            val afterLabel = NAME_LABEL.split(line).last()
            var tail = FIELD_WORDS.replace(afterLabel, " ")
            tail = TextNormalization.cleanText(tail)
            if (tail.length >= 4) {
                return TextNormalization.displayName(tail)
            }
            val windowEnd = minOf(index + 4, lines.size)
            for (i in (index + 1) until windowEnd) {
                val following = lines[i]
                if (TWO_LETTERS.containsMatchIn(following) && !EXCLUDE_FOLLOWING.containsMatchIn(following)) {
                    return TextNormalization.displayName(following)
                }
            }
        }
        for (line in lines) {
            val match = TWO_WORD_NAME.find(line) ?: continue
            if (!EXCLUDE_TWO_WORD.containsMatchIn(match.value)) {
                return TextNormalization.displayName(match.value)
            }
        }
        return ""
    }

    private val SUFFIXES = setOf("JR", "SR", "II", "III", "IV", "V")

    /**
     * Splits a confirmed display name ("First Middle Last Suffix") into the
     * discrete legal-name fields the review screen requires. This is a new
     * addition on top of the source mock, which only ever handled the name
     * as a single string; nothing here is inferred from the OCR text itself.
     */
    fun splitLegalName(displayFullName: String): LegalName {
        val cleaned = TextNormalization.cleanText(displayFullName)
        if (cleaned.isEmpty()) return LegalName()
        val tokens = cleaned.split(" ").toMutableList()
        var suffix = ""
        if (tokens.size > 1 && SUFFIXES.contains(tokens.last().uppercase().trimEnd('.'))) {
            suffix = tokens.removeAt(tokens.size - 1)
        }
        if (tokens.isEmpty()) return LegalName(suffix = suffix)
        val first = tokens.first()
        val last = if (tokens.size > 1) tokens.last() else ""
        val middle = if (tokens.size > 2) tokens.subList(1, tokens.size - 1).joinToString(" ") else ""
        return LegalName(first = first, middle = middle, last = last, suffix = suffix)
    }
}

data class LegalName(
    val first: String = "",
    val middle: String = "",
    val last: String = "",
    val suffix: String = ""
) {
    val full: String
        get() = listOf(first, middle, last, suffix).filter { it.isNotBlank() }.joinToString(" ")
}
