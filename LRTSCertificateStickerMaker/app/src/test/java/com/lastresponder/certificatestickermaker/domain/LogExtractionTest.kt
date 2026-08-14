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
}
