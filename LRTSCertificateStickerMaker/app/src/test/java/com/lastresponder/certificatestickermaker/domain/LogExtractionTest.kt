package com.lastresponder.certificatestickermaker.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LogExtractionTest {

    @Test
    fun `extracts name date and disc from a single-row log`() {
        val text = "FUNERAL HOME LOG\nHansen, Jake  08/10/2026  60214\n"
        val fields = LogExtraction.extractLogFields(text)
        assertEquals("Jake Hansen", fields.logName)
        assertEquals("08/10/2026", fields.cremationDate)
        assertEquals("60214", fields.discId)
    }

    @Test
    fun `skips header rows`() {
        val text = "DECEASED NAME | I.D. DISC | FUNERAL HOME\nHansen, Jake  08/10/2026  60214\n"
        assertEquals("Jake Hansen", LogExtraction.extractLogName(text))
    }

    @Test
    fun `short MM-DD date without a year is completed with the current year`() {
        val currentYear = java.time.Year.now().value
        val date = LogExtraction.extractLogDate("Cremated 8-10")
        assertTrue(date.startsWith("$currentYear-08-10"))
    }

    @Test
    fun `multiple log rows are all returned as separate candidates`() {
        val text = """
            DECEASED NAME | I.D. DISC | FUNERAL HOME
            Hansen, Jake  08/10/2026  60214
            Delgado, Maria  08/11/2026  60215
            Smith, John  08/12/2026  60216
        """.trimIndent()
        val rows = LogExtraction.extractLogRows(text)
        assertEquals(3, rows.size)
        assertEquals("Jake Hansen", rows[0].name)
        assertEquals("60214", rows[0].discId)
        assertEquals("Maria Delgado", rows[1].name)
        assertEquals("60215", rows[1].discId)
        assertEquals("John Smith", rows[2].name)
        assertEquals("60216", rows[2].discId)
    }

    @Test
    fun `a row's date and disc are never borrowed from a different row`() {
        val text = """
            Hansen, Jake  08/10/2026  60214
            Delgado, Maria
        """.trimIndent()
        val rows = LogExtraction.extractLogRows(text)
        assertEquals(2, rows.size)
        assertEquals("", rows[1].cremationDate)
        assertEquals("", rows[1].discId)
    }

    @Test
    fun `a single detected row still round-trips through extractLogRows`() {
        val rows = LogExtraction.extractLogRows("Hansen, Jake  08/10/2026  60214")
        assertEquals(1, rows.size)
    }

    @Test
    fun `real device photo -- spreadsheet app chrome is not mistaken for a decedent name`() {
        // Mirrors an actual on-device ML Kit read of a photographed (not printed)
        // Excel window: ribbon tabs, menu labels, and app UI text all superficially
        // match the "Capitalized Word Capitalized Word" name shape.
        val text = """
            Upgrade your plan
            CREMATION LOG 2026 Saved
            AutoSave On
            Page Layout Formulas Data Review View Automate Help Acrobat
            Switch Windows
            DECEASED NAME DATE I.D. DISC # FUNERAL HOME
            Jake Hansen
            8/13/2026
            18339
            All Texas Cremation
        """.trimIndent()
        val rows = LogExtraction.extractLogRows(text)
        assertTrue("chrome text must not appear as a row", rows.none { it.name in setOf("Upgrade Your", "Page Layout", "Switch Windows") })
        assertTrue("the real decedent name must still be found", rows.any { it.name == "Jake Hansen" })
    }

    @Test
    fun `extractLogName also skips app chrome when picking the single best guess`() {
        val text = "Upgrade your plan\nDark Mode\nJake Hansen\n8/13/2026\n18339"
        assertEquals("Jake Hansen", LogExtraction.extractLogName(text))
    }

    @Test
    fun `real device bug -- a header cell OCR-misread into a plausible name is excluded by position, not spelling`() {
        // Mirrors the actual on-device read: a spreadsheet-style header cell
        // ("Aprx Wt") got OCR-misread beyond anything a keyword list could
        // anticipate ("Apri Nt") and was recognized as its own line, separate
        // from the "Deceased Name ... Funeral Home" header line that
        // SKIP_HEADER matches. No fixed spelling list can catch an unpredictable
        // misread, but its page position - above the row holding the first real
        // date - always identifies it as header noise.
        fun row(text: String, top: Int) = OcrLine(text, left = 0, top = top, right = 200, bottom = top + 20)
        val lines = listOf(
            row("A B C D E F G", top = 0),
            row("Deceased Name Date I.D. Disc #", top = 4),
            row("Apri Nt", top = 8),
            row("Jake Hanson 8/13/2026 18339 225 2:00 PM yes 1 jh Large All Texas Cremation", top = 150)
        )
        val rows = LogExtraction.extractLogRows(lines)
        assertTrue("the misread header cell must not appear as a row", rows.none { it.name == "Apri Nt" })
        assertTrue("the real decedent row must still be found", rows.any { it.name == "Jake Hanson" && it.discId == "18339" })
    }

    @Test
    fun `real device bug -- a name date and disc split into separate grid cells are still paired into one row`() {
        // Mirrors an actual on-device read of a photographed spreadsheet: the
        // table's borders mean ML Kit recognizes "Jake Hansen", "8/13/2026",
        // and "18339" as three completely separate lines (each its own grid
        // cell) rather than one merged row line. The old per-line-only search
        // for date/disc found the name but came up empty for both, blocking
        // certificate printing (which requires a date and disc number).
        fun cell(text: String, x: Int, y: Int, w: Int = 100) = OcrLine(text, x, y, x + w, y + 20)
        val lines = listOf(
            cell("A B C D", x = 0, y = 0),
            cell("Deceased Name", x = 0, y = 20, w = 150),
            cell("Date", x = 160, y = 20),
            cell("I.D. Disc #", x = 270, y = 20),
            cell("Aprx Wt", x = 380, y = 20),
            cell("Jake Hansen", x = 0, y = 200, w = 150),
            cell("8/13/2026", x = 160, y = 202),
            cell("18339", x = 270, y = 198),
            cell("225", x = 380, y = 201),
            // A blank later row: only its disc-number cell was filled in.
            cell("18340", x = 270, y = 240)
        )
        val rows = LogExtraction.extractLogRows(lines)
        assertEquals(1, rows.size)
        assertEquals("Jake Hansen", rows[0].name)
        assertEquals("8/13/2026", rows[0].cremationDate)
        assertEquals("18339", rows[0].discId)
    }

    @Test
    fun `real device layout -- a full page of mostly-blank disc rows still surfaces exactly the one filled row`() {
        // Mirrors the actual screenshot: a pre-printed log with a full column
        // of disc numbers (18339-18348) running many rows down, where only
        // the very first row has a name and date filled in yet.
        fun cell(text: String, x: Int, y: Int, w: Int = 100) = OcrLine(text, x, y, x + w, y + 20)
        val lines = mutableListOf(
            cell("A B C D", x = 0, y = 0),
            cell("Deceased Name", x = 0, y = 40, w = 150),
            cell("Date", x = 160, y = 40),
            cell("I.D. Disc #", x = 270, y = 40),
            cell("Jake Hansen", x = 0, y = 90, w = 150),
            cell("8/13/2026", x = 160, y = 92),
            cell("18339", x = 270, y = 88)
        )
        for ((index, disc) in (18340..18346).withIndex()) {
            lines.add(cell(disc.toString(), x = 270, y = 130 + index * 40))
        }
        val rows = LogExtraction.extractLogRows(lines)
        assertEquals(1, rows.size)
        assertEquals("Jake Hansen", rows[0].name)
        assertEquals("18339", rows[0].discId)
    }

    @Test
    fun `positional filtering is skipped entirely when no date is recognized anywhere`() {
        fun row(text: String, top: Int) = OcrLine(text, left = 0, top = top, right = 200, bottom = top + 20)
        val lines = listOf(row("Jake Hanson", top = 0))
        assertEquals("Jake Hanson", LogExtraction.extractLogName(lines))
    }
}
