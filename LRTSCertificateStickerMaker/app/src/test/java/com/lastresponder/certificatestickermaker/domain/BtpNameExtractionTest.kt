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
    fun `real device bug -- a garbled watermark line closer vertically than the true value is not chosen over it`() {
        // Mirrors an actual on-device read of the mock BTP: a diagonal
        // watermark ("MOCK TEST DOCUMENT... A REAL BURIAL-TRANSIT PERMIT")
        // crossing the page got OCR-merged into a stray multi-word line, and
        // because the old margin was derived from the wide "Name of Deceased -
        // First" label's own width, that stray line - positioned closer
        // vertically than the real "Jake" value, but far to the right - won a
        // purely-nearest-vertically search. Position must require left-edge
        // alignment with a tolerance scaled to text height, not label width.
        val lines = listOf(
            line("NAME OF DECEASED - FIRST", x = 80, y = 100, w = 260),
            line("MIDDLE", x = 360, y = 100, w = 80),
            line("LAST", x = 500, y = 100, w = 60),
            // Decoy: a wide, far-right, garbled watermark fragment sitting only
            // slightly below the header row - closer in raw vertical distance
            // than the real values, which are one full row further down.
            line("Burial Transit Permit Test Director", x = 300, y = 128, w = 400),
            line("JAKE", x = 80, y = 160, w = 70),
            line("WILLIAM", x = 360, y = 160, w = 90),
            line("HANSEN", x = 500, y = 160, w = 90)
        )
        assertEquals("Jake William Hansen", BtpNameExtraction.extractBtpName(lines))
    }

    @Test
    fun `real device bug -- a value under the right side of a wide compound label is still found`() {
        // Mirrors an actual on-device read: the header line reads "Name of
        // Deceased - First" as one wide OCR line starting well to the left of
        // where "Jake" actually sits (which is roughly under the word
        // "First", near the label's right edge, not its left). Requiring the
        // value's left edge to match the label's own left edge - the previous
        // fix - missed this; overlap between the two spans finds it.
        val lines = listOf(
            line("NAME OF DECEASED - FIRST", x = 20, y = 100, w = 320),
            line("MIDDLE", x = 380, y = 100, w = 80),
            line("LAST", x = 500, y = 100, w = 60),
            line("JAKE", x = 260, y = 160, w = 70),
            line("WILLIAM", x = 380, y = 160, w = 90),
            line("HANSEN", x = 500, y = 160, w = 90)
        )
        assertEquals("Jake William Hansen", BtpNameExtraction.extractBtpName(lines))
    }

    @Test
    fun `real device bug -- the label's own text is never mistaken for a value even when it is the closest candidate`() {
        // Mirrors an actual on-device read: "Middle"'s real value ("William")
        // was not recognized in this capture, and a garbled repeat of the
        // header label itself ("Name Of Deceased - Arst", an OCR misread of
        // "Name of Deceased - First") ended up closest to the Middle label by
        // position. The old check only rejected a candidate that was an EXACT
        // match to a single label word, so this multi-word phrase - which
        // contains "Name", "Of", and "Deceased" as separate words - slipped
        // through and was returned as a fabricated middle name.
        val lines = listOf(
            line("NAME OF DECEASED - FIRST", x = 20, y = 100, w = 320),
            line("MIDDLE", x = 380, y = 100, w = 80),
            line("LAST", x = 500, y = 100, w = 60),
            line("JAKE", x = 20, y = 160, w = 70),
            // The decoy: a misread repeat of the header, positioned closer to
            // MIDDLE than the (missing) real value would have been.
            line("Name Of Deceased - Arst", x = 380, y = 165, w = 260),
            line("HANSEN", x = 500, y = 160, w = 90)
        )
        // Middle's real value was never recognized, so it is correctly left
        // out - not filled with the label's own garbled text.
        assertEquals("Jake Hansen", BtpNameExtraction.extractBtpName(lines))
    }

    @Test
    fun `real device layout -- the whole permit photographed in one shot still finds the immediate data row`() {
        // Mirrors photographing the entire BTP in one shot: many further rows
        // follow below the name table (age, place of death, funeral director,
        // registrar signature, ...), some of which contain two-word
        // capitalized text of their own ("Test Director", "M. Registrar").
        // The header-anchored data row selection must pick the row
        // immediately below the header, not get confused by later rows.
        val lines = listOf(
            line("NAME OF DECEASED - FIRST", x = 20, y = 100, w = 320),
            line("MIDDLE", x = 380, y = 100, w = 80),
            line("LAST", x = 500, y = 100, w = 60),
            line("JAKE", x = 20, y = 140, w = 70),
            line("WILLIAM", x = 380, y = 140, w = 90),
            line("HANSEN", x = 500, y = 140, w = 90),
            line("AGE 41 Years", x = 20, y = 180, w = 150),
            line("DATE OF DEATH 01/01/2026", x = 380, y = 180, w = 200),
            line("PLACE OF DEATH", x = 20, y = 220, w = 150),
            line("Test Medical Center Dallas", x = 20, y = 250, w = 250),
            line("PRINT NAME OF FUNERAL DIRECTOR", x = 20, y = 290, w = 300),
            line("Test Director", x = 20, y = 320, w = 150),
            line("LOCAL REGISTRAR", x = 20, y = 360, w = 150),
            line("M. Registrar", x = 20, y = 400, w = 150)
        )
        assertEquals("Jake William Hansen", BtpNameExtraction.extractBtpName(lines))
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
