package com.lastresponder.certificatestickermaker.ocr

import android.graphics.Bitmap
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
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

    suspend fun recognize(bitmap: Bitmap): String = suspendCancellableCoroutine { continuation ->
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        val image = InputImage.fromBitmap(bitmap, 0)
        recognizer.process(image)
            .addOnSuccessListener { result -> continuation.resume(result.text) }
            .addOnFailureListener { error -> continuation.resumeWithException(error) }
        continuation.invokeOnCancellation { recognizer.close() }
    }
}
