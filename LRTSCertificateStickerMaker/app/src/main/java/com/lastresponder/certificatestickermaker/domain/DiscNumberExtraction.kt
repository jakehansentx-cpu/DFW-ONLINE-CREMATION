package com.lastresponder.certificatestickermaker.domain

/**
 * Ported from the source mock's `app.py` (`extract_log_disc`).
 *
 * IMPORTANT: this never prepends or hard-codes a "17" prefix. In the source
 * material, "17" was only a visual reference to where the disc number sits on
 * the certificate layout, not part of the number itself. It is filtered out
 * here for the same reason the original excludes any 4-6 digit run that looks
 * like a calendar year (1900-2100), so a cremation date does not get mistaken
 * for a disc number.
 */
object DiscNumberExtraction {

    private val CANDIDATE = Regex("""\b(1\d{4}|\d{4,6})\b""")

    /** Returns the first plausible I.D. disc/disk number found in [text], or "" if none. */
    fun extractDiscId(text: String): String {
        val candidates = CANDIDATE.findAll(text).map { it.value }.toList()
        val filtered = candidates.filter { value ->
            val numeric = value.toLongOrNull() ?: return@filter true
            !(numeric in 1900..2100)
        }
        return filtered.firstOrNull() ?: ""
    }
}
