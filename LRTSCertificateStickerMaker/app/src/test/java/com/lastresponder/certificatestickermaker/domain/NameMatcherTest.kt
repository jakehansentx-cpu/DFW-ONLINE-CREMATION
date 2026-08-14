package com.lastresponder.certificatestickermaker.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** BTP/cremation-log identity matching - required by the task's "name normalization and BTP/log matching" test coverage. */
class NameMatcherTest {

    @Test
    fun `identical names score 100 and are GOOD`() {
        val result = NameMatcher.evaluate("Jake Hansen", "Jake Hansen")
        assertEquals(100, result.score)
        assertEquals(NameMatcher.MatchLevel.GOOD, result.level)
    }

    @Test
    fun `case and punctuation differences still match GOOD`() {
        val result = NameMatcher.evaluate("jake hansen", "JAKE-HANSEN")
        assertEquals(NameMatcher.MatchLevel.GOOD, result.level)
    }

    @Test
    fun `single-letter misspelling stays high but not a perfect match`() {
        // "Jake Hansen" vs "Jake Hanssen": one inserted letter out of 11 normalized chars -> ~91%.
        val result = NameMatcher.evaluate("Jake Hansen", "Jake Hanssen")
        assertTrue("expected a high but imperfect score, got ${result.score}", result.score in 68..99)
    }

    @Test
    fun `clearly different names are BAD`() {
        val result = NameMatcher.evaluate("Jake Hansen", "Maria Delgado")
        assertEquals(NameMatcher.MatchLevel.BAD, result.level)
    }

    @Test
    fun `blank name is NEUTRAL, not a false mismatch`() {
        assertEquals(NameMatcher.MatchLevel.NEUTRAL, NameMatcher.evaluate("", "Jake Hansen").level)
        assertEquals(NameMatcher.MatchLevel.NEUTRAL, NameMatcher.evaluate("Jake Hansen", "").level)
        assertEquals(NameMatcher.MatchLevel.NEUTRAL, NameMatcher.evaluate("", "").level)
    }

    @Test
    fun `threshold boundaries match the review screen bands`() {
        assertEquals(NameMatcher.MatchLevel.GOOD, levelFor(88))
        assertEquals(NameMatcher.MatchLevel.WARN, levelFor(87))
        assertEquals(NameMatcher.MatchLevel.WARN, levelFor(68))
        assertEquals(NameMatcher.MatchLevel.BAD, levelFor(67))
    }

    private fun levelFor(score: Int) = when {
        score >= NameMatcher.GOOD_THRESHOLD -> NameMatcher.MatchLevel.GOOD
        score >= NameMatcher.WARN_THRESHOLD -> NameMatcher.MatchLevel.WARN
        else -> NameMatcher.MatchLevel.BAD
    }
}
