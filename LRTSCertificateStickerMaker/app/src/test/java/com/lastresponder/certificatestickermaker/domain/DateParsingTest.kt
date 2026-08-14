package com.lastresponder.certificatestickermaker.domain

import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DateParsingTest {

    @Test
    fun `parses MM slash DD slash YYYY`() {
        assertEquals(LocalDate.of(2026, 8, 10), DateParsing.parseDate("08/10/2026"))
    }

    @Test
    fun `parses MM dash DD dash YYYY`() {
        assertEquals(LocalDate.of(2026, 8, 10), DateParsing.parseDate("08-10-2026"))
    }

    @Test
    fun `parses ISO YYYY dash MM dash DD`() {
        assertEquals(LocalDate.of(2026, 8, 10), DateParsing.parseDate("2026-08-10"))
    }

    @Test
    fun `parses full month name`() {
        assertEquals(LocalDate.of(2026, 8, 10), DateParsing.parseDate("August 10, 2026"))
    }

    @Test
    fun `parses abbreviated month name`() {
        assertEquals(LocalDate.of(2026, 8, 10), DateParsing.parseDate("Aug 10, 2026"))
    }

    @Test
    fun `two-digit year pivots like strptime -- 68 and under is 2000s`() {
        assertEquals(LocalDate.of(2026, 8, 10), DateParsing.parseDate("08/10/26"))
    }

    @Test
    fun `two-digit year pivots like strptime -- 69 and over is 1900s`() {
        assertEquals(LocalDate.of(1969, 8, 10), DateParsing.parseDate("08/10/69"))
    }

    @Test
    fun `finds a numeric date embedded in surrounding text`() {
        assertEquals(LocalDate.of(2026, 8, 10), DateParsing.parseDate("Date of Cremation: 08/10/2026 - Operator JS"))
    }

    @Test
    fun `rejects an out-of-range year`() {
        assertNull(DateParsing.parseDate("08/10/1850"))
        assertNull(DateParsing.parseDate("08/10/2200"))
    }

    @Test
    fun `rejects an invalid calendar date`() {
        assertNull(DateParsing.parseDate("02/30/2026"))
    }

    @Test
    fun `blank or garbage input returns null`() {
        assertNull(DateParsing.parseDate(""))
        assertNull(DateParsing.parseDate(null))
        assertNull(DateParsing.parseDate("not a date"))
    }

    @Test
    fun `prettyDate formats a parsed date and falls back to cleaned text otherwise`() {
        assertEquals("August 10, 2026", DateParsing.prettyDate("2026-08-10"))
        assertEquals("not a date", DateParsing.prettyDate("  not a date  "))
    }
}
