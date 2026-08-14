package com.lastresponder.certificatestickermaker.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class DiscNumberExtractionTest {

    @Test
    fun `extracts a plain 5-digit disc number`() {
        assertEquals("18566", DiscNumberExtraction.extractDiscId("I.D. Disc: 18566"))
    }

    @Test
    fun `never prepends a hard-coded 17`() {
        // "17" was only ever a visual reference to the disc-number position on the
        // certificate template, not a value to prefix onto every disc number.
        val result = DiscNumberExtraction.extractDiscId("Disc 4821")
        assertEquals("4821", result)
        assertFalse("must not fabricate a 17-prefixed value", result.startsWith("17") && result != "4821")
    }

    @Test
    fun `does not mistake a calendar year for a disc number`() {
        // A bare "2026" (a year) must be filtered out; a real disc number nearby should win.
        assertEquals("54321", DiscNumberExtraction.extractDiscId("Cremation date 2026 - Disc 54321"))
    }

    @Test
    fun `a disc number that itself starts with 17 is preserved, not stripped`() {
        assertEquals("17234", DiscNumberExtraction.extractDiscId("Disc 17234"))
    }

    @Test
    fun `no plausible candidate returns empty string, never a guess`() {
        assertEquals("", DiscNumberExtraction.extractDiscId("Cremation performed 2026"))
    }

    @Test
    fun `picks the first plausible non-year candidate when several numbers are present`() {
        assertEquals("60214", DiscNumberExtraction.extractDiscId("Case 2026 log page 3 disc 60214 weight 4 lbs"))
    }
}
