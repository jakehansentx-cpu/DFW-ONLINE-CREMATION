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

/**
 * Groups recognized lines into visual rows by y-position. A gridded document
 * (a table with borders, or a spreadsheet) can have ML Kit recognize each
 * cell as its own line even when several cells share one visual row, so
 * anything that reads a table needs this before it can tell which pieces of
 * text belong to the same row.
 */
fun List<OcrLine>.groupIntoRows(): List<List<OcrLine>> {
    val sorted = sortedBy { it.top }
    val rows = mutableListOf<MutableList<OcrLine>>()
    for (line in sorted) {
        val lineHeight = maxOf(line.bottom - line.top, 10)
        val currentRow = rows.lastOrNull()
        if (currentRow != null && line.top - currentRow.first().top <= lineHeight) {
            currentRow.add(line)
        } else {
            rows.add(mutableListOf(line))
        }
    }
    return rows
}

/** A horizontal band on the page, used to say which table column a cell belongs to. */
data class ColumnBand(val minX: Int, val maxX: Int) {
    operator fun contains(x: Int) = x in minX..maxX
}

/**
 * Finds the row containing three cells matching [isFirst], [isSecond], and
 * [isThird] respectively, in that left-to-right order - i.e. an actual table
 * header row, not just three matching words scattered anywhere on the page.
 * Requiring all three to co-occur in one row, in the expected column order,
 * is what keeps a decoy elsewhere on the page (a stray label near a
 * signature block, misread chrome text) from ever being mistaken for the
 * header: a decoy never sits in the same row as the other two real labels.
 */
fun List<List<OcrLine>>.findOrderedHeaderRow(
    isFirst: (String) -> Boolean,
    isSecond: (String) -> Boolean,
    isThird: (String) -> Boolean
): Triple<OcrLine, OcrLine, OcrLine>? {
    for (row in this) {
        val sorted = row.sortedBy { it.left }
        val a = sorted.firstOrNull { isFirst(it.text) } ?: continue
        val b = sorted.firstOrNull { isSecond(it.text) } ?: continue
        val c = sorted.firstOrNull { isThird(it.text) } ?: continue
        if (a.left < b.left && b.left < c.left) return Triple(a, b, c)
    }
    return null
}

/**
 * Three column bands derived from a header row's own three label cells - the
 * boundary between two columns is the midpoint between where one label ends
 * and the next begins. Values are assigned to a column by which band they
 * fall in, rather than by matching a single label's own left edge, so a wide
 * or oddly-positioned label cell (e.g. "Name of Deceased - First") does not
 * throw off which value belongs to it.
 */
fun columnBandsFrom(first: OcrLine, second: OcrLine, third: OcrLine): List<ColumnBand> {
    val firstSecondBoundary = (first.right + second.left) / 2
    val secondThirdBoundary = (second.right + third.left) / 2
    return listOf(
        ColumnBand(Int.MIN_VALUE, firstSecondBoundary),
        ColumnBand(firstSecondBoundary + 1, secondThirdBoundary),
        ColumnBand(secondThirdBoundary + 1, Int.MAX_VALUE)
    )
}

/** The text of every cell in [row] that falls within [band], left to right. */
fun bandText(row: List<OcrLine>, band: ColumnBand): String =
    row.filter { it.centerX in band }.sortedBy { it.left }.joinToString(" ") { it.text }
