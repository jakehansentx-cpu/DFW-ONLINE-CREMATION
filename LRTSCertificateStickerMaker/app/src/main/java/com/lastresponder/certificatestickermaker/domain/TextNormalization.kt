package com.lastresponder.certificatestickermaker.domain

/**
 * Ported from the source mock's `app.py` (`clean_text`, `normalize_name`, `display_name`).
 * Kept as pure functions so they can be unit tested without any Android dependency.
 */
object TextNormalization {

    private val WHITESPACE = Regex("\\s+")
    private val NON_ALNUM = Regex("[^A-Z0-9]")

    /** Collapses runs of whitespace and trims. Mirrors `clean_text()`. */
    fun cleanText(value: String?): String {
        if (value == null) return ""
        return WHITESPACE.replace(value, " ").trim()
    }

    /** Upper-cases and strips everything but letters/digits, for fuzzy comparison. */
    fun normalizeName(value: String): String {
        return NON_ALNUM.replace(value.uppercase(), "")
    }

    /**
     * Converts an all-caps or "Last, First Middle" source-document name into a
     * normal display form. Mirrors `display_name()`.
     */
    fun displayName(raw: String?): String {
        var value = cleanText(raw)
        if (value.isEmpty()) return ""
        if (value.contains(',')) {
            val parts = value.split(',', limit = 2).map { cleanText(it) }
            val last = parts[0]
            val rest = if (parts.size > 1) parts[1] else ""
            value = "$rest $last".trim()
        }
        return value.split(' ').joinToString(" ") { part ->
            if (part.isNotEmpty() && part == part.uppercase() && part.any { it.isLetter() }) {
                part.lowercase().replaceFirstChar { it.uppercase() }
            } else {
                part
            }
        }
    }
}
