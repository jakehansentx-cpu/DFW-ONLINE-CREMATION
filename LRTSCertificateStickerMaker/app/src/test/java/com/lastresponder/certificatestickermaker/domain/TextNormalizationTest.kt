package com.lastresponder.certificatestickermaker.domain

import org.junit.Assert.assertEquals
import org.junit.Test

class TextNormalizationTest {

    @Test
    fun `cleanText collapses whitespace and trims`() {
        assertEquals("Jake Hansen", TextNormalization.cleanText("  Jake   Hansen \n"))
        assertEquals("", TextNormalization.cleanText(null))
        assertEquals("", TextNormalization.cleanText("   "))
    }

    @Test
    fun `normalizeName strips punctuation and uppercases`() {
        assertEquals("OBRIENJOHN", TextNormalization.normalizeName("O'Brien, John"))
        assertEquals("JAKEHANSEN", TextNormalization.normalizeName("jake-hansen"))
    }

    @Test
    fun `displayName converts LAST, FIRST to First Last`() {
        assertEquals("Alexis Mandujano", TextNormalization.displayName("MANDUJANO, ALEXIS"))
    }

    @Test
    fun `displayName title-cases all-caps input without a comma`() {
        assertEquals("Jake Hansen", TextNormalization.displayName("JAKE HANSEN"))
    }

    @Test
    fun `displayName leaves already mixed-case input alone`() {
        assertEquals("Jake Hansen", TextNormalization.displayName("Jake Hansen"))
    }

    @Test
    fun `displayName of blank input is blank`() {
        assertEquals("", TextNormalization.displayName("   "))
    }
}
