package com.lastresponder.certificatestickermaker.pdf

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream

/**
 * Writes a generated [PdfDocument] to app-external "Documents" storage (no
 * WRITE_EXTERNAL_STORAGE permission needed - it's app-scoped external
 * storage), and builds the Preview/Open/Share intents through the app's
 * [androidx.core.content.FileProvider] (see res/xml/file_paths.xml). "Save
 * PDF" additionally exports a copy to the public Downloads collection via
 * MediaStore (API 29+) so it is easy to find outside the app; no extra
 * storage permission is requested for this, in keeping with the
 * minimal-permissions requirement.
 */
class PdfFileManager(private val context: Context) {

    private val documentsDir: File
        get() = File(context.getExternalFilesDir(null), "documents").apply { mkdirs() }

    fun save(document: PdfDocument, fileName: String): File {
        val safeName = fileName.replace(Regex("[^A-Za-z0-9_.-]"), "_")
        val file = File(documentsDir, safeName)
        FileOutputStream(file).use { document.writeTo(it) }
        document.close()
        return file
    }

    fun uriFor(file: File): Uri =
        FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)

    fun openIntent(file: File): Intent {
        val uri = uriFor(file)
        return Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/pdf")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }

    fun shareIntent(file: File): Intent {
        val uri = uriFor(file)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "application/pdf"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        return Intent.createChooser(send, "Share PDF").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }

    /**
     * "Save PDF": exports a copy to the public Downloads collection on API
     * 29+ via MediaStore (no permission required for a scoped-storage
     * insert). On API 26-28 the file already lives in app-external storage
     * from [save]; this returns null there rather than requesting
     * WRITE_EXTERNAL_STORAGE for a mock-test build.
     */
    fun saveToDownloads(file: File): Uri? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, file.name)
            put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf")
            put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
        }
        val resolver = context.contentResolver
        val target = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return null
        resolver.openOutputStream(target)?.use { output ->
            file.inputStream().use { input -> input.copyTo(output) }
        }
        return target
    }
}
