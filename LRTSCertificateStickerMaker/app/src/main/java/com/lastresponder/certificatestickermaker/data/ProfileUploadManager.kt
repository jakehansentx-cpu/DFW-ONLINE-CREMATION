package com.lastresponder.certificatestickermaker.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import java.io.File
import java.io.FileOutputStream

/**
 * Saves a staff-picked logo or design-reference file into internal app
 * storage. Mirrors `app.py`'s `save_profile_upload()`: logos are decoded,
 * downscaled to fit within 1400x800 (same cap as the original's
 * `image.thumbnail((1400, 800), ...)`), and re-encoded as PNG; design
 * references (PDF or image) are copied through unchanged.
 */
class ProfileUploadManager(private val context: Context) {

    private val uploadsDir: File
        get() = File(context.filesDir, "profile_uploads").apply { mkdirs() }

    private val maxLogoWidth = 1400
    private val maxLogoHeight = 800

    fun saveLogo(profileId: String, uri: Uri): String {
        val bitmap = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
            ?: throw IllegalArgumentException("The logo image could not be read.")
        val scaled = downscale(bitmap, maxLogoWidth, maxLogoHeight)
        val output = File(uploadsDir, "${profileId}_logo.png")
        FileOutputStream(output).use { stream -> scaled.compress(Bitmap.CompressFormat.PNG, 100, stream) }
        return output.absolutePath
    }

    fun saveDesignReference(profileId: String, uri: Uri, originalFileName: String?): String {
        val extension = originalFileName?.substringAfterLast('.', "")?.lowercase().orEmpty()
        val allowed = setOf("pdf", "png", "jpg", "jpeg", "webp")
        val safeExtension = if (extension in allowed) extension else "pdf"
        val output = File(uploadsDir, "${profileId}_design.$safeExtension")
        context.contentResolver.openInputStream(uri)?.use { input ->
            FileOutputStream(output).use { out -> input.copyTo(out) }
        } ?: throw IllegalArgumentException("The sticker design reference could not be read.")
        return output.absolutePath
    }

    fun deleteIfInternal(path: String) {
        if (path.isBlank() || ImageSource.isAsset(path)) return
        val file = File(path)
        if (file.exists() && file.parentFile == uploadsDir) file.delete()
    }

    private fun downscale(bitmap: Bitmap, maxWidth: Int, maxHeight: Int): Bitmap {
        if (bitmap.width <= maxWidth && bitmap.height <= maxHeight) return bitmap
        val scale = minOf(maxWidth.toFloat() / bitmap.width, maxHeight.toFloat() / bitmap.height)
        val width = (bitmap.width * scale).toInt().coerceAtLeast(1)
        val height = (bitmap.height * scale).toInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(bitmap, width, height, true)
    }
}
