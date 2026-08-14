package com.lastresponder.certificatestickermaker.pdf

/**
 * Avery 8464 quantity/position/pagination math. Ported line-for-line from the
 * source mock's `app.py` `make_labels()` (the parts that decide how many
 * sheets are needed and where each label lands), kept separate from PDF
 * drawing so it is plain-Kotlin unit testable.
 *
 * Sheet geometry: US Letter, six 4in x 3-1/3in labels, position 1 is
 * upper-left through position 6 lower-right, 0.25in side margin / 0.5in
 * top margin — the same numbers as `app.py`.
 */
object LabelPagination {

    const val LABEL_WIDTH_PT = 4f * 72f
    const val LABEL_HEIGHT_PT = (10f / 3f) * 72f
    const val LEFT_MARGIN_PT = 0.25f * 72f
    const val TOP_MARGIN_PT = 0.5f * 72f

    // US Letter, in PDF points (72 per inch) — matches reportlab.lib.pagesizes.letter.
    const val PAGE_WIDTH_PT = 612f
    const val PAGE_HEIGHT_PT = 792f

    const val MIN_QUANTITY = 1
    const val MAX_QUANTITY = 60
    const val POSITIONS_PER_SHEET = 6

    data class LabelPlacement(val pageIndex: Int, val position: Int, val x: Float, val y: Float)

    fun clampQuantity(rawQuantity: Int): Int = rawQuantity.coerceIn(MIN_QUANTITY, MAX_QUANTITY)

    /** Keeps only 1-6, de-duplicated and sorted — mirrors the server's position sanitizing. */
    fun sanitizePositions(rawPositions: Collection<Int>): List<Int> =
        rawPositions.filter { it in 1..POSITIONS_PER_SHEET }.toSortedSet().toList()

    /**
     * The full, in-order list of sheet positions to print, one entry per
     * label. The selected first-sheet positions are used first (capped at
     * the requested quantity); anything beyond that starts a fresh sheet at
     * position 1 and fills complete sheets of six.
     */
    fun computePositionSequence(quantity: Int, firstSheetPositions: List<Int>): List<Int> {
        require(firstSheetPositions.isNotEmpty()) {
            "Select at least one available label position on the first sheet."
        }
        val positions = firstSheetPositions.take(quantity).toMutableList()
        var remaining = quantity - positions.size
        while (remaining > 0) {
            val take = minOf(remaining, POSITIONS_PER_SHEET)
            positions.addAll(1..take)
            remaining -= take
        }
        return positions
    }

    /** One placement (page + on-page x/y) per label, in print order. */
    fun computePlacements(quantity: Int, firstSheetPositions: List<Int>): List<LabelPlacement> {
        val positions = computePositionSequence(quantity, firstSheetPositions)
        val firstPageCount = minOf(quantity, firstSheetPositions.size)
        return positions.mapIndexed { index, position ->
            val pageIndex = if (index < firstPageCount) 0 else 1 + (index - firstPageCount) / POSITIONS_PER_SHEET
            val (x, y) = labelOrigin(position)
            LabelPlacement(pageIndex, position, x, y)
        }
    }

    fun pageCount(placements: List<LabelPlacement>): Int = (placements.maxOfOrNull { it.pageIndex } ?: 0) + 1

    /**
     * Bottom-left corner of the label box, in reportlab-style bottom-up PDF
     * points (y = 0 at the bottom of the page). [com.lastresponder.certificatestickermaker.pdf.ReportLabStyleCanvas]
     * flips this to Android's top-down canvas space at draw time.
     */
    fun labelOrigin(position: Int): Pair<Float, Float> {
        require(position in 1..POSITIONS_PER_SHEET) { "Position must be 1-6, was $position" }
        val zeroBased = position - 1
        val row = zeroBased / 2
        val column = zeroBased % 2
        val x = LEFT_MARGIN_PT + column * LABEL_WIDTH_PT
        val y = PAGE_HEIGHT_PT - TOP_MARGIN_PT - (row + 1) * LABEL_HEIGHT_PT
        return x to y
    }
}
