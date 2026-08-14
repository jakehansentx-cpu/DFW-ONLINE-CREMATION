package com.lastresponder.certificatestickermaker.data.model

import android.net.Uri
import com.lastresponder.certificatestickermaker.domain.LegalName
import com.lastresponder.certificatestickermaker.domain.NameMatcher
import com.lastresponder.certificatestickermaker.ocr.OcrResult
import com.lastresponder.certificatestickermaker.domain.LogExtraction

enum class IntakeMode { SCAN, MANUAL, HYBRID }

/**
 * The single in-progress case/job. Equivalent to the `state` object plus all
 * of the form fields in the source mock's `static/app.js` / `index.html`,
 * collected into one immutable snapshot the UI renders from. Nothing here is
 * persisted - "Clear Current Job" simply replaces this with a fresh instance
 * and deletes any temp photo/PDF files it referenced (funeral-home profiles
 * live in Room and are untouched).
 */
data class JobState(
    val intakeMode: IntakeMode = IntakeMode.SCAN,

    // Source documents
    val btpImageUri: Uri? = null,
    val btpOcrResult: OcrResult? = null,
    val btpOcrRunning: Boolean = false,
    val logImageUri: Uri? = null,
    val logOcrResult: OcrResult? = null,
    val logOcrRunning: Boolean = false,
    val logRowCandidates: List<LogExtraction.LogRowCandidate> = emptyList(),
    val selectedLogRowIndex: Int? = null,

    // Review / confirmed record
    val btpName: String = "",
    val logName: String = "",
    val legalName: LegalName = LegalName(),
    val decedentName: String = "",
    val cremationDate: String = "",
    val discId: String = "",
    val approxWeight: String = "",
    val startTime: String = "",
    val retort: String = "",
    val operator: String = "",
    val caseType: String = "",

    // Certificate settings
    val crematoryName: String = "Metro Mortuary & Crematory",
    val crematoryCityState: String = "Sachse, Texas",
    val providerService: String = "Metro Mortuary & Crematory Service",
    val providerLocation: String = "Sachse, Texas 75048",

    // Sticker settings
    val selectedProfileId: String = "",
    val funeralHome: String = "",
    val funeralHomeCityState: String = "",
    val labelQuantity: Int = 6,
    val labelPreface: String = "The Cremated Remains of",
    val labelDisclosure: String = "",
    val labelPositions: Set<Int> = setOf(1, 2, 3, 4, 5, 6),

    // Required verification
    val reviewConfirmed: Boolean = false,

    // Print results
    val lastCertificatePdfPath: String? = null,
    val lastLabelsPdfPath: String? = null
) {
    val nameMatch: NameMatcher.MatchResult
        get() = NameMatcher.evaluate(btpName, logName)

    val certificateReady: Boolean
        get() = reviewConfirmed &&
            decedentName.isNotBlank() &&
            cremationDate.isNotBlank() &&
            discId.isNotBlank()

    val labelsReady: Boolean
        get() = reviewConfirmed &&
            decedentName.isNotBlank() &&
            labelQuantity > 0 &&
            labelPositions.isNotEmpty() &&
            selectedProfileId.isNotBlank()
}
