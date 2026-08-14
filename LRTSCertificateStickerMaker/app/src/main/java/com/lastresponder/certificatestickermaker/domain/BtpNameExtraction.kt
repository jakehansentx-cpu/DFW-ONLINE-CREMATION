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

    private val COLUMN_LABEL_WORDS = setOf(
        "FIRST", "MIDDLE", "LAST", "AGE", "SEX", "DATE", "METHOD", "PLACE", "NAME",
        "STATE", "COUNTY", "REGISTRAR", "TEXAS", "PRACTICE", "FORM", "TEST", "OF", "DECEASED"
    )

    private fun looksLikeNameToken(text: String): Boolean {
        val cleaned = text.trim()
        if (cleaned.length < 2 || cleaned.length > 24) return false
        if (!cleaned.all { it.isLetter() || it == ' ' || it == '\'' || it == '-' }) return false
        // Checking the whole string against COLUMN_LABEL_WORDS only ever caught a
        // candidate that was one of those words alone. A multi-word OCR line that
        // repeats or half-reads a label - "Name Of Deceased - Arst" (a misread of
        // "Name of Deceased - First") - is not an exact match to any single entry
        // but is still obviously not a name, so every word in it is checked.
        val words = cleaned.split(Regex("[\\s-]+")).filter { it.isNotBlank() }
        if (words.isEmpty()) return false
        return words.none { it.uppercase() in COLUMN_LABEL_WORDS }
    }

    private fun valueAfterLabel(lines: List<String>, isLabel: (String) -> Boolean): String? {
        val labelIndex = lines.indexOfFirst(isLabel)
        if (labelIndex == -1) return null
        for (i in (labelIndex + 1) until minOf(labelIndex + 3, lines.size)) {
            if (looksLikeNameToken(lines[i])) return lines[i]
        }
        return null
    }

    /**
     * Handles the real Texas DSHS form layout, where "Name of Deceased" is
     * three separate First/Middle/Last table columns rather than one inline
     * value. On-device OCR does not always read a multi-column table in
     * strict top-to-bottom order, so each label is searched independently
     * anywhere in the recognized text instead of assuming they appear
     * sequentially. A column whose label was never recognized (this happens
     * in practice for "Last" on some captures) is simply left out rather
     * than guessed at - nothing here is invented.
     */
    private fun extractTableColumnName(lines: List<String>): String? {
        val first = valueAfterLabel(lines) { it.uppercase().contains("NAME OF DECEASED") }
        val middle = valueAfterLabel(lines) { it.trim().equals("MIDDLE", ignoreCase = true) }
        val last = valueAfterLabel(lines) { it.trim().equals("LAST", ignoreCase = true) }
        val parts = listOfNotNull(first, middle, last).filter { it.isNotBlank() }
        return if (parts.size >= 2) parts.joinToString(" ") else null
    }

    private fun isFirstLabel(text: String) =
        text.uppercase().let { it.contains("NAME OF DECEASED") || it.trim() == "FIRST" }

    private fun isMiddleLabel(text: String) = text.trim().equals("MIDDLE", ignoreCase = true)

    private fun isLastLabel(text: String) = text.trim().equals("LAST", ignoreCase = true)

    /** 0 when the two spans overlap; otherwise the gap between their nearest edges. */
    private fun horizontalGap(a: OcrLine, b: OcrLine): Int =
        maxOf(0, maxOf(a.left - b.right, b.left - a.right))

    /**
     * The best value line for a label, scored by vertical distance below it
     * plus horizontal gap from it (zero when the two overlap). A fixed
     * horizontal tolerance does not work here: too tight and it misses a
     * value that sits under the right-hand word of a wide compound label
     * like "Name of Deceased - First" (whose own left edge is nowhere near
     * where "First"'s value actually is); too loose and it lets a
     * neighboring column's value bleed in. Scoring by combined distance and
     * removing each chosen value from [used] before scoring the next label
     * avoids both: whichever label a value is actually closest to wins it,
     * and it cannot also be claimed by another column.
     */
    private fun bestValueBelow(lines: List<OcrLine>, label: OcrLine, used: MutableSet<OcrLine>): OcrLine? {
        val lineHeight = maxOf(label.bottom - label.top, 10)
        val maxVerticalGap = lineHeight * 6
        return lines
            .asSequence()
            .filter { it !== label && it !in used }
            .filter { it.top in label.bottom..(label.bottom + maxVerticalGap) }
            .filter { looksLikeNameToken(it.text) }
            .minByOrNull { (it.top - label.bottom) + horizontalGap(it, label) }
    }

    /**
     * When more than one line matches a label pattern - e.g. a stray "Last"
     * near an unrelated part of the page, such as a signature block - the
     * candidate on the same visual row as the rest of the column headers is
     * the real one. [referenceTop] anchors that row; without one (no other
     * label found yet), the first match in text order is the best guess
     * available.
     */
    private fun bestLabelCandidate(lines: List<OcrLine>, referenceTop: Int?, isLabel: (String) -> Boolean): OcrLine? {
        val candidates = lines.filter { isLabel(it.text) }
        return if (referenceTop != null) {
            candidates.minByOrNull { kotlin.math.abs(it.top - referenceTop) }
        } else {
            candidates.firstOrNull()
        }
    }

    /**
     * Positional counterpart of [extractTableColumnName]: pairs each column
     * label with the value line nearest it on the page instead of nearest in
     * flattened text order, which is what real on-device captures need since
     * ML Kit does not always read a multi-column table in visual order.
     */
    private fun extractTableColumnNamePositional(lines: List<OcrLine>): String? {
        val firstLabel = lines.firstOrNull { isFirstLabel(it.text) }
        val headerRowTop = firstLabel?.top
        val middleLabel = bestLabelCandidate(lines, headerRowTop, ::isMiddleLabel)
        val lastLabel = bestLabelCandidate(lines, headerRowTop ?: middleLabel?.top, ::isLastLabel)
        val used = mutableSetOf<OcrLine>()
        val first = firstLabel?.let { bestValueBelow(lines, it, used) }?.also { used.add(it) }
        val middle = middleLabel?.let { bestValueBelow(lines, it, used) }?.also { used.add(it) }
        val last = lastLabel?.let { bestValueBelow(lines, it, used) }
        val parts = listOfNotNull(first?.text, middle?.text, last?.text).filter { it.isNotBlank() }
        return if (parts.size >= 2) parts.joinToString(" ") else null
    }

    /**
     * Preferred entry point when the caller has ML Kit's line positions
     * available (real on-device recognition always does). Falls back to the
     * text-order heuristics below when positional pairing does not find
     * enough columns.
     */
    fun extractBtpName(ocrLines: List<OcrLine>): String {
        extractTableColumnNamePositional(ocrLines)?.let { return TextNormalization.displayName(it) }
        return extractBtpName(ocrLines.joinToString("\n") { it.text })
    }

    fun extractBtpName(text: String): String {
        val lines = text.lines().map { TextNormalization.cleanText(it) }.filter { it.isNotEmpty() }
        extractTableColumnName(lines)?.let { return TextNormalization.displayName(it) }
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
