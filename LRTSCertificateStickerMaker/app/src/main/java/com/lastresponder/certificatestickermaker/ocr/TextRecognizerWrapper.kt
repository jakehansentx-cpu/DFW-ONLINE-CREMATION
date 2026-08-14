package com.lastresponder.certificatestickermaker.ocr

import android.graphics.Bitmap
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.lastresponder.certificatestickermaker.domain.OcrLine
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Bundled (on-device, offline) ML Kit Latin text recognizer. Using
 * `com.google.mlkit:text-recognition` rather than the Play-services-backed
 * variant means the recognition model ships inside the APK - no download,
 * no network permission, works with the device offline.
 */
object TextRecognizerWrapper {

    data class RecognizedText(val fullText: String, val lines: List<OcrLine>)

    suspend fun recognize(bitmap: Bitmap): RecognizedText = suspendCancellableCoroutine { continuation ->
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        val image = InputImage.fromBitmap(bitmap, 0)
        recognizer.process(image)
            .addOnSuccessListener { result ->
                val lines = result.textBlocks.flatMap { block -> block.lines }.map { line ->
                    val box = line.boundingBox
                    OcrLine(
                        text = line.text,
                        left = box?.left ?: 0,
                        top = box?.top ?: 0,
                        right = box?.right ?: 0,
                        bottom = box?.bottom ?: 0
                    )
                }
                continuation.resume(RecognizedText(result.text, lines))
            }
            .addOnFailureListener { error -> continuation.resumeWithException(error) }
        continuation.invokeOnCancellation { recognizer.close() }
    }
}
