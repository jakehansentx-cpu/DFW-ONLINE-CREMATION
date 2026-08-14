package com.lastresponder.certificatestickermaker.data.model

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Manual-correction and required-confirmation-blocking behavior. `certificateReady`/
 * `labelsReady` are what every print button in the UI is wired to
 * (see VerificationScreen / CertificatePreviewScreen / LabelPreviewScreen).
 */
class JobStateTest {

    private val readyBase = JobState(
        decedentName = "Jake Hansen",
        cremationDate = "2026-01-01",
        discId = "TEST-00000",
        selectedProfileId = "all-texas-cremation",
        labelQuantity = 3,
        labelPositions = setOf(1, 2, 3)
    )

    @Test
    fun `certificate is blocked until reviewConfirmed is true, even with all fields filled`() {
        assertFalse(readyBase.copy(reviewConfirmed = false).certificateReady)
        assertTrue(readyBase.copy(reviewConfirmed = true).certificateReady)
    }

    @Test
    fun `certificate is blocked when any required field is missing, confirmed or not`() {
        assertFalse(readyBase.copy(reviewConfirmed = true, decedentName = "").certificateReady)
        assertFalse(readyBase.copy(reviewConfirmed = true, cremationDate = "").certificateReady)
        assertFalse(readyBase.copy(reviewConfirmed = true, discId = "").certificateReady)
    }

    @Test
    fun `labels are blocked until reviewConfirmed is true`() {
        assertFalse(readyBase.copy(reviewConfirmed = false).labelsReady)
        assertTrue(readyBase.copy(reviewConfirmed = true).labelsReady)
    }

    @Test
    fun `labels are blocked without a selected profile, a quantity, or any positions`() {
        assertFalse(readyBase.copy(reviewConfirmed = true, selectedProfileId = "").labelsReady)
        assertFalse(readyBase.copy(reviewConfirmed = true, labelQuantity = 0).labelsReady)
        assertFalse(readyBase.copy(reviewConfirmed = true, labelPositions = emptySet()).labelsReady)
    }

    @Test
    fun `manually correcting a field after OCR overrides the extracted value`() {
        val afterOcr = JobState(btpName = "MANDUJANO, ALEXIS", decedentName = "Mandujano Alexis")
        val corrected = afterOcr.copy(decedentName = "Alexis Mandujano")
        assertTrue(corrected.decedentName == "Alexis Mandujano")
        // The original OCR source value is preserved for the comparison banner, not overwritten.
        assertTrue(corrected.btpName == "MANDUJANO, ALEXIS")
    }

    @Test
    fun `clearing the job resets every field to defaults`() {
        val cleared = JobState()
        assertTrue(cleared.decedentName.isEmpty())
        assertTrue(cleared.reviewConfirmed.not())
        assertTrue(cleared.labelPositions == setOf(1, 2, 3, 4, 5, 6))
    }
}
