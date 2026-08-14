package com.lastresponder.certificatestickermaker.domain

/**
 * Identity match check between the BTP name and the cremation-log name.
 *
 * Ported from the source mock's `static/app.js` `nameScore()` — a normalized
 * Levenshtein edit-distance ratio, expressed as an integer percentage. This is
 * the algorithm that actually drove the live mismatch banner in the source
 * mockup's browser UI (the server-side `similarity()` in `app.py`, based on
 * Python's SequenceMatcher, was defined but never wired into a route).
 */
object NameMatcher {

    const val GOOD_THRESHOLD = 88
    const val WARN_THRESHOLD = 68

    enum class MatchLevel { NEUTRAL, GOOD, WARN, BAD }

    data class MatchResult(val score: Int, val level: MatchLevel)

    /** 0-100 similarity between two names, after normalization. */
    fun score(left: String, right: String): Int {
        val a = TextNormalization.normalizeName(left)
        val b = TextNormalization.normalizeName(right)
        if (a.isEmpty() || b.isEmpty()) return 0
        val distance = levenshtein(a, b)
        val maxLen = maxOf(a.length, b.length)
        return Math.round((1.0 - distance.toDouble() / maxLen) * 100).toInt()
    }

    /** Score plus the UI level (matches the review-screen thresholds). */
    fun evaluate(btpName: String, logName: String): MatchResult {
        val a = TextNormalization.cleanText(btpName)
        val b = TextNormalization.cleanText(logName)
        if (a.isEmpty() || b.isEmpty()) return MatchResult(0, MatchLevel.NEUTRAL)
        val value = score(a, b)
        val level = when {
            value >= GOOD_THRESHOLD -> MatchLevel.GOOD
            value >= WARN_THRESHOLD -> MatchLevel.WARN
            else -> MatchLevel.BAD
        }
        return MatchResult(value, level)
    }

    private fun levenshtein(a: String, b: String): Int {
        val rows = Array(a.length + 1) { IntArray(b.length + 1) }
        for (i in 0..a.length) rows[i][0] = i
        for (j in 0..b.length) rows[0][j] = j
        for (i in 1..a.length) {
            for (j in 1..b.length) {
                val cost = if (a[i - 1] == b[j - 1]) 0 else 1
                rows[i][j] = minOf(
                    rows[i - 1][j] + 1,
                    rows[i][j - 1] + 1,
                    rows[i - 1][j - 1] + cost
                )
            }
        }
        return rows[a.length][b.length]
    }
}
