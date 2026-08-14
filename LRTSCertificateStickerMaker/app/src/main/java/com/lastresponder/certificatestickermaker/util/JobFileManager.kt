package com.lastresponder.certificatestickermaker.util

import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File

/**
 * Owns temporary, job-scoped files: captured BTP/log photos and generated
 * working PDFs. Everything lives under the app cache dir's "job/" subfolder
 * (declared in res/xml/file_paths.xml as `cache-path name="job_cache"`), so
 * "Clear Current Job" can wipe it all in one call without touching the
 * Room-backed funeral-home profiles, which live elsewhere entirely.
 */
class JobFileManager(private val context: Context) {

    private val jobDir: File
        get() = File(context.cacheDir, "job").apply { mkdirs() }

    /** A fresh destination file for a CameraX capture (BTP or log photo). */
    fun newCapturedPhotoFile(prefix: String): File =
        File(jobDir, "${prefix}_${System.currentTimeMillis()}.jpg")

    fun uriForFile(file: File): Uri =
        FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)

    fun fileForUri(uri: Uri): File? {
        if (uri.scheme == "file") return uri.path?.let { File(it) }
        val name = uri.lastPathSegment?.substringAfterLast('/') ?: return null
        val candidate = File(jobDir, name)
        return if (candidate.exists()) candidate else null
    }

    /** Deletes every temporary photo/working file for the current job. Profiles in Room are untouched. */
    fun clearJob() {
        jobDir.listFiles()?.forEach { it.delete() }
    }
}
