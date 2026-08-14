package com.lastresponder.certificatestickermaker.domain

/**
 * One recognized line of text plus where it sits on the page, in the pixel
 * space of whichever rotated bitmap ML Kit actually read. Deliberately plain
 * Int coordinates (not an Android Rect) so this type - and the extraction
 * logic that consumes it - stays testable outside the Android SDK.
 *
 * This exists because flattened text order from a multi-column table (like
 * the BTP's First/Middle/Last columns) does not reliably match the table's
 * visual layout: ML Kit's block reading order can interleave columns. Pairing
 * a column's label with the value line nearest it on the page is far more
 * reliable than pairing by proximity in the text.
 */
data class OcrLine(val text: String, val left: Int, val top: Int, val right: Int, val bottom: Int) {
    val centerX: Int get() = (left + right) / 2
}
