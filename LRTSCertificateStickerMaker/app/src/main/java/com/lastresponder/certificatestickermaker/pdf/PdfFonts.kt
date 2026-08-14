package com.lastresponder.certificatestickermaker.pdf

import android.content.Context
import android.graphics.Typeface

/**
 * Loads the same DejaVu faces the source mock registered with reportlab
 * (`LRTSSans` / `LRTSSansBold` / `LRTSSerifBold`, backed by
 * `/usr/share/fonts/truetype/dejavu/*.ttf`), bundled here as app assets so
 * certificate and label text renders identically without any network or
 * system-font dependency. Falls back to the platform default faces if an
 * asset ever fails to load, matching the original's Helvetica/Times-Bold
 * fallback behavior.
 */
class PdfFonts private constructor(
    val sans: Typeface,
    val sansBold: Typeface,
    val serifBold: Typeface
) {
    companion object {
        @Volatile private var instance: PdfFonts? = null

        fun get(context: Context): PdfFonts {
            instance?.let { return it }
            synchronized(this) {
                instance?.let { return it }
                val appContext = context.applicationContext
                val loaded = PdfFonts(
                    sans = loadOrFallback(appContext, "fonts/DejaVuSans.ttf", Typeface.NORMAL),
                    sansBold = loadOrFallback(appContext, "fonts/DejaVuSans-Bold.ttf", Typeface.BOLD),
                    serifBold = loadOrFallback(appContext, "fonts/DejaVuSerif-Bold.ttf", Typeface.BOLD)
                )
                instance = loaded
                return loaded
            }
        }

        private fun loadOrFallback(context: Context, assetPath: String, fallbackStyle: Int): Typeface {
            return try {
                Typeface.createFromAsset(context.assets, assetPath)
            } catch (error: Exception) {
                Typeface.create(Typeface.DEFAULT, fallbackStyle)
            }
        }
    }
}
