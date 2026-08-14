package com.lastresponder.certificatestickermaker.ocr

import android.graphics.Bitmap
import android.graphics.Matrix
import com.lastresponder.certificatestickermaker.domain.BtpNameExtraction
import com.lastresponder.certificatestickermaker.domain.LogExtraction

enum class DocumentType { BTP, CREMATION_LOG }

data class OcrResult(val rotationDegrees: Int, val rawText: String)

/**
 * Runs the bundled ML Kit recognizer at four rotations and keeps the best
 * result, scored by how strongly the recognized text matches the vocabulary
 * expected on that document type. Ported from `app.py`'s `best_ocr()`, which
 * did the same thing against Tesseract for the same reason: a document photo
 * is not guaranteed to be captured right-side-up.
 *
 * OCR output is always a draft - callers must route it through the
 * confirmation/verification screen before it can reach a printed document.
 */
object DocumentOcrProcessor {

    private val ROTATIONS = intArrayOf(0, 90, 270, 180)

    suspend fun recognize(bitmap: Bitmap, documentType: DocumentType): OcrResult {
        var best: OcrResult? = null
        var bestScore = Double.NEGATIVE_INFINITY
        for (angle in ROTATIONS) {
            val rotated = if (angle == 0) bitmap else rotate(bitmap, angle)
            val text = try {
                TextRecognizerWrapper.recognize(rotated)
            } catch (error: Exception) {
                ""
            }
            val score = score(text, documentType)
            if (score > bestScore) {
                bestScore = score
                best = OcrResult(angle, text)
            }
        }
        return best ?: OcrResult(0, "")
    }

    private fun score(text: String, documentType: DocumentType): Double {
        val upper = text.uppercase()
        return if (documentType == DocumentType.BTP) {
            (if ("BURIAL-TRANSIT" in upper) 8.0 else 0.0) +
                (if ("NAME OF DECEASED" in upper) 5.0 else 0.0) +
                (if ("CREMATION" in upper) 3.0 else 0.0) +
                minOf(text.length / 300.0, 5.0)
        } else {
            (if ("DECEASED NAME" in upper) 8.0 else 0.0) +
                (if ("DISC" in upper || "DISK" in upper) 6.0 else 0.0) +
                (if ("FUNERAL HOME" in upper) 3.0 else 0.0) +
                minOf(text.length / 180.0, 5.0)
        }
    }

    private fun rotate(bitmap: Bitmap, degrees: Int): Bitmap {
        val matrix = Matrix().apply { postRotate(degrees.toFloat()) }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }
}

data class BtpOcrFields(val fullName: String)

fun OcrResult.toBtpFields(): BtpOcrFields = BtpOcrFields(BtpNameExtraction.extractBtpName(rawText))

fun OcrResult.toLogFields(): LogExtraction.LogFields = LogExtraction.extractLogFields(rawText)

fun OcrResult.toLogRows(): List<LogExtraction.LogRowCandidate> = LogExtraction.extractLogRows(rawText)
