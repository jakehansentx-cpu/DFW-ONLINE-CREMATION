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
    fun `real device photo -- three-column First-Middle-Last table with jumbled OCR block order`() {
        // Mirrors an actual on-device ML Kit read of a Texas DSHS Burial-Transit
        // Permit: First appears right after its label, but Middle's label/value
        // pair is recognized much later in the block order, and Last's label is
        // never recognized at all (its value appears with no anchor).
        val text = """
            STATE OF TEXAS PRACTICE FORM
            Burial Transit Permit
            NAME OF DECEASED FIRST
            JAKE
            AGE
            41 Years
            PLACE OF DEATH
            Test Medical Center, Dallas
            SIGNATURE OF REGISTRAR
            MIDDLE
            WILLIAM
            PACEMAKER Yes No
            DATE OF DEATH
            01/01/2026
            HANSEN
            METHOD OF DISPOSITION
        """.trimIndent()
        // Last has no recognized label anchor, so only First + Middle are combined -
        // this is a real improvement over returning just "Jake", not a claim of
        // full accuracy; the surname still needs manual correction on this capture.
        assertEquals("Jake William", BtpNameExtraction.extractBtpName(text))
    }

    @Test
    fun `table extraction is skipped entirely when no column labels are found`() {
        val text = "BURIAL-TRANSIT PERMIT\nJAKE HANSEN\nCREMATION AUTHORIZED"
        assertEquals("Jake Hansen", BtpNameExtraction.extractBtpName(text))
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

    private fun line(text: String, x: Int, y: Int, w: Int = 100, h: Int = 20) =
        OcrLine(text, x, y, x + w, y + h)

    @Test
    fun `real device bug -- a decoy LAST label far from the table is not paired with its neighboring value`() {
        // Reproduces an actual on-device misread: text-order pairing grabbed a
        // stray line elsewhere on the page ("Seal", near a signature block) as
        // the Last-column value because it appeared after a line that
        // trim-matched "LAST" in flattened OCR order. The list below is built
        // out of visual order (mirrors ML Kit's real block order jumbling) but
        // carries real page coordinates, so position - not list order - must
        // decide the pairing.
        val lines = listOf(
            line("SIGNATURE OF REGISTRAR", x = 10, y = 900),
            line("LAST", x = 10, y = 920),
            line("Seal", x = 10, y = 940),
            line("WILLIAM", x = 300, y = 130),
            line("NAME OF DECEASED FIRST", x = 100, y = 100),
            line("HANSEN", x = 500, y = 130),
            line("JAKE", x = 100, y = 130),
            line("LAST", x = 500, y = 100),
            line("MIDDLE", x = 300, y = 100)
        )
        assertEquals("Jake William Hansen", BtpNameExtraction.extractBtpName(lines))
    }

    @Test
    fun `positional pairing only requires the columns it can actually find`() {
        // Same table, but this capture never recognized a "LAST" label at all -
        // matches the real capture where only First + Middle combined.
        val lines = listOf(
            line("WILLIAM", x = 300, y = 130),
            line("NAME OF DECEASED FIRST", x = 100, y = 100),
            line("JAKE", x = 100, y = 130),
            line("MIDDLE", x = 300, y = 100)
        )
        assertEquals("Jake William", BtpNameExtraction.extractBtpName(lines))
    }

    @Test
    fun `positional entry point falls back to text heuristics when there is no table`() {
        val lines = listOf(
            line("STATE OF TEXAS BURIAL-TRANSIT PERMIT", x = 0, y = 0),
            line("JAKE HANSEN", x = 0, y = 30),
            line("CREMATION AUTHORIZED", x = 0, y = 60)
        )
        assertEquals("Jake Hansen", BtpNameExtraction.extractBtpName(lines))
    }
}
