package com.lastresponder.certificatestickermaker.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.File

/**
 * Resolves the small path scheme used by [com.lastresponder.certificatestickermaker.data.db.FuneralHomeProfileEntity]
 * logo/design-reference fields: bundled seed images live under
 * `assets/profiles/...` ("asset://profiles/xxx.png"), staff uploads live in
 * internal app storage as a plain absolute path.
 */
object ImageSource {
    private const val ASSET_PREFIX = "asset://"

    fun loadBitmap(context: Context, path: String): Bitmap? {
        if (path.isBlank()) return null
        return try {
            if (path.startsWith(ASSET_PREFIX)) {
                val assetPath = path.removePrefix(ASSET_PREFIX)
                context.assets.open(assetPath).use { BitmapFactory.decodeStream(it) }
            } else {
                val file = File(path)
                if (file.exists()) BitmapFactory.decodeFile(file.absolutePath) else null
            }
        } catch (error: Exception) {
            null
        }
    }

    /** True when [path] points at a PDF, by scheme-stripped file extension. */
    fun isPdf(path: String): Boolean = path.substringAfterLast('.', "").equals("pdf", ignoreCase = true)

    fun isAsset(path: String): Boolean = path.startsWith(ASSET_PREFIX)
}
