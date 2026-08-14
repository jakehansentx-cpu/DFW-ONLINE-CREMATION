package com.lastresponder.certificatestickermaker.domain

import org.junit.Assert.assertEquals
import org.junit.Test

class BtpNameExtractionTest {

    @Test
    fun `extracts the name following the NAME OF DECEASED label on the same line`() {
        val text = "BURIAL-TRANSIT PERMIT\nNAME OF DECEASED: MANDUJANO, ALEXIS\nAGE 74 SEX F"
        assertEquals("Alexis Mandujano", BtpNameExtraction.extractBtpName(text))
    }

    @Test
    fun `falls through to the next line when the label line has no value`() {
        val text = "BURIAL-TRANSIT PERMIT\nNAME OF DECEASED\nJAKE HANSEN\nAGE 40 SEX M"
        assertEquals("Jake Hansen", BtpNameExtraction.extractBtpName(text))
    }

    @Test
    fun `falls back to a plausible two-word capitalized name when no label is found`() {
        val text = "STATE OF TEXAS BURIAL-TRANSIT PERMIT\nJAKE HANSEN\nCREMATION AUTHORIZED"
        assertEquals("Jake Hansen", BtpNameExtraction.extractBtpName(text))
    }

    @Test
    fun `ignores permit boilerplate words when guessing the name`() {
        val text = "BURIAL TRANSIT PERMIT TEXAS\nJAKE HANSEN"
        assertEquals("Jake Hansen", BtpNameExtraction.extractBtpName(text))
    }

    @Test
    fun `returns empty string rather than inventing a name`() {
        assertEquals("", BtpNameExtraction.extractBtpName("BURIAL-TRANSIT PERMIT\nSTATE OF TEXAS\nCREMATION"))
    }

    @Test
    fun `splitLegalName separates first, middle, last, and suffix`() {
        val name = BtpNameExtraction.splitLegalName("Jake Robert Hansen Jr")
        assertEquals("Jake", name.first)
        assertEquals("Robert", name.middle)
        assertEquals("Hansen", name.last)
        assertEquals("Jr", name.suffix)
    }

    @Test
    fun `splitLegalName handles a two-word name with no middle or suffix`() {
        val name = BtpNameExtraction.splitLegalName("Jake Hansen")
        assertEquals("Jake", name.first)
        assertEquals("", name.middle)
        assertEquals("Hansen", name.last)
        assertEquals("", name.suffix)
    }

    @Test
    fun `splitLegalName round-trips through full`() {
        val name = BtpNameExtraction.splitLegalName("Jake Robert Hansen Jr")
        assertEquals("Jake Robert Hansen Jr", name.full)
    }
}
