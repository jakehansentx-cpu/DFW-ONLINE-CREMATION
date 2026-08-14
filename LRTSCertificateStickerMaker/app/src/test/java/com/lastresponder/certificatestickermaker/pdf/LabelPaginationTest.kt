package com.lastresponder.certificatestickermaker.pdf

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

/**
 * Avery 8464 quantity/position/pagination math, including every scenario
 * named in the task's required test list.
 */
class LabelPaginationTest {

    @Test
    fun `All Texas -- quantity 3 at positions 1, 3, and 6`() {
        val placements = LabelPagination.computePlacements(3, listOf(1, 3, 6))
        assertEquals(3, placements.size)
        assertEquals(listOf(1, 3, 6), placements.map { it.position })
        assertEquals(listOf(0, 0, 0), placements.map { it.pageIndex })
        assertEquals(1, LabelPagination.pageCount(placements))
    }

    @Test
    fun `Pilar -- quantity 1 at position 4`() {
        val placements = LabelPagination.computePlacements(1, listOf(4))
        assertEquals(1, placements.size)
        assertEquals(4, placements[0].position)
        assertEquals(0, placements[0].pageIndex)
    }

    @Test
    fun `Temple and Sons -- quantity 2 at positions 2 and 6`() {
        val placements = LabelPagination.computePlacements(2, listOf(2, 6))
        assertEquals(listOf(2, 6), placements.map { it.position })
        assertEquals(listOf(0, 0), placements.map { it.pageIndex })
    }

    @Test
    fun `Hiett's -- full sheet of 6`() {
        val placements = LabelPagination.computePlacements(6, listOf(1, 2, 3, 4, 5, 6))
        assertEquals(6, placements.size)
        assertEquals(listOf(1, 2, 3, 4, 5, 6), placements.map { it.position })
        assertEquals(1, LabelPagination.pageCount(placements))
    }

    @Test
    fun `multipage pagination -- more labels than first-sheet positions spills onto fresh sheets`() {
        // 10 requested, only 3 positions available on the first sheet.
        val placements = LabelPagination.computePlacements(10, listOf(1, 2, 3))
        assertEquals(10, placements.size)
        assertEquals(3, LabelPagination.pageCount(placements))

        val byPage = placements.groupBy { it.pageIndex }
        assertEquals(listOf(1, 2, 3), byPage.getValue(0).map { it.position })
        assertEquals(listOf(1, 2, 3, 4, 5, 6), byPage.getValue(1).map { it.position })
        assertEquals(listOf(1), byPage.getValue(2).map { it.position })
    }

    @Test
    fun `additional sheets always restart at position 1`() {
        val placements = LabelPagination.computePlacements(8, listOf(5, 6))
        val secondSheetOnward = placements.filter { it.pageIndex >= 1 }
        assertEquals(listOf(1, 2, 3, 4, 5, 6), secondSheetOnward.map { it.position })
    }

    @Test
    fun `quantity is clamped between 1 and 60`() {
        assertEquals(1, LabelPagination.clampQuantity(0))
        assertEquals(1, LabelPagination.clampQuantity(-5))
        assertEquals(60, LabelPagination.clampQuantity(500))
        assertEquals(30, LabelPagination.clampQuantity(30))
    }

    @Test
    fun `positions are sanitized to the 1-6 range, de-duplicated and sorted`() {
        assertEquals(listOf(1, 3, 6), LabelPagination.sanitizePositions(listOf(6, 3, 1, 3, 0, 7, -1)))
    }

    @Test
    fun `no first-sheet positions selected throws rather than guessing`() {
        assertThrows(IllegalArgumentException::class.java) {
            LabelPagination.computePlacements(3, emptyList())
        }
    }

    @Test
    fun `US Letter page size and Avery 8464 label geometry match the source layout`() {
        assertEquals(612f, LabelPagination.PAGE_WIDTH_PT)
        assertEquals(792f, LabelPagination.PAGE_HEIGHT_PT)
        assertEquals(4f * 72f, LabelPagination.LABEL_WIDTH_PT)
        assertEquals((10f / 3f) * 72f, LabelPagination.LABEL_HEIGHT_PT, 0.001f)
    }

    @Test
    fun `label position 1 is upper-left and position 6 is lower-right`() {
        val (x1, y1) = LabelPagination.labelOrigin(1)
        val (x6, y6) = LabelPagination.labelOrigin(6)
        // Position 1: left column, top row -> smallest x, largest bottom-up y (closest to the top).
        assertEquals(LabelPagination.LEFT_MARGIN_PT, x1)
        // Position 6: right column, bottom row -> largest x, smallest bottom-up y (closest to the bottom).
        assertEquals(LabelPagination.LEFT_MARGIN_PT + LabelPagination.LABEL_WIDTH_PT, x6)
        assertEquals(true, y1 > y6)
    }
}
