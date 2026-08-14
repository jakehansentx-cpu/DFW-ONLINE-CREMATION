package com.lastresponder.certificatestickermaker.pdf

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import com.lastresponder.certificatestickermaker.domain.TextNormalization

/**
 * Fields `draw_label()` needs. [printFuneralHome]/[printCityState] are
 * nullable to preserve a subtle rule from `app.py`: several imported
 * profiles (Pilar, Mesquite, Allen Family, Chamberland, Hiett's) carry an
 * explicit-but-blank `print_funeral_home` / `print_city_state` key, which
 * intentionally suppresses that text on the label (their logo art already
 * shows the name), while every other profile has no such key and falls back
 * to [funeralHome] / [funeralHomeCityState]. `null` here means "key absent,
 * use the fallback"; `""` means "key present and blank, print nothing".
 */
data class LabelPrintData(
    val labelProfileName: String,
    val funeralHome: String,
    val funeralHomeCityState: String,
    val printFuneralHome: String? = null,
    val printCityState: String? = null,
    val decedentName: String,
    val preface: String = "The Cremated Remains of",
    val disclosure: String = "",
    val logoBitmap: Bitmap? = null,
    val headerMode: String = "",
    val headerText: String = ""
)

class LabelValidationException(message: String) : IllegalArgumentException(message)

/**
 * Ported from the source mock's `app.py` `draw_label()` / `make_labels()`.
 * Every coordinate, font size, and fallback rule below matches the original;
 * only [com.lastresponder.certificatestickermaker.pdf.LabelPagination] (quantity/position math) and drawing calls changed
 * backend from reportlab to `android.graphics.pdf.PdfDocument`.
 */
object LabelSheetGenerator {

    fun generate(
        data: LabelPrintData,
        rawQuantity: Int,
        rawFirstSheetPositions: List<Int>,
        fonts: PdfFonts
    ): PdfDocument {
        if (TextNormalization.cleanText(data.decedentName).isEmpty()) {
            throw LabelValidationException("A decedent name is required for the sticker.")
        }
        val quantity = LabelPagination.clampQuantity(rawQuantity)
        val firstSheetPositions = LabelPagination.sanitizePositions(rawFirstSheetPositions)
        val placements = try {
            LabelPagination.computePlacements(quantity, firstSheetPositions)
        } catch (error: IllegalArgumentException) {
            throw LabelValidationException(error.message ?: "Select at least one available label position on the first sheet.")
        }

        val document = PdfDocument()
        var currentPageIndex = -1
        var currentPage: PdfDocument.Page? = null
        for (placement in placements) {
            if (placement.pageIndex != currentPageIndex) {
                currentPage?.let { document.finishPage(it) }
                currentPageIndex = placement.pageIndex
                val info = PdfDocument.PageInfo.Builder(
                    LabelPagination.PAGE_WIDTH_PT.toInt(),
                    LabelPagination.PAGE_HEIGHT_PT.toInt(),
                    currentPageIndex + 1
                ).create()
                currentPage = document.startPage(info)
            }
            val rc = ReportLabStyleCanvas(currentPage!!.canvas, LabelPagination.PAGE_HEIGHT_PT)
            drawLabel(rc, data, placement.x, placement.y, LabelPagination.LABEL_WIDTH_PT, LabelPagination.LABEL_HEIGHT_PT, fonts)
        }
        currentPage?.let { document.finishPage(it) }
        return document
    }

    private fun drawLabel(
        rc: ReportLabStyleCanvas,
        data: LabelPrintData,
        x: Float,
        y: Float,
        w: Float,
        h: Float,
        fonts: PdfFonts
    ) {
        val profile = TextNormalization.cleanText(data.labelProfileName.ifBlank { "All Texas Cremation" })
        val funeralHome = data.printFuneralHome?.let { TextNormalization.cleanText(it) }
            ?: TextNormalization.cleanText(data.funeralHome.ifBlank { profile })
        val cityState = data.printCityState?.let { TextNormalization.cleanText(it) }
            ?: TextNormalization.cleanText(data.funeralHomeCityState)
        val name = TextNormalization.displayName(data.decedentName)
        val preface = TextNormalization.cleanText(data.preface.ifBlank { "The Cremated Remains of" })
        val disclosure = TextNormalization.cleanText(data.disclosure)

        val headerMode = TextNormalization.cleanText(
            data.headerMode.ifBlank { if (data.logoBitmap != null) "logo" else "name" }
        ).lowercase()
        val headerLines = data.headerText.lines().map { TextNormalization.cleanText(it) }.filter { it.isNotEmpty() }

        when {
            headerMode == "none" -> Unit
            headerMode == "logo" && data.logoBitmap != null -> {
                val box = aspectFitBox(data.logoBitmap.width, data.logoBitmap.height, x + 92f, y + h - 69f, 104f, 56f)
                rc.drawImage(data.logoBitmap, box[0], box[1], box[2], box[3])
            }
            headerMode == "text" && headerLines.isNotEmpty() -> {
                headerLines.take(2).forEachIndexed { index, line ->
                    fitCenteredAt(rc, line, x + w / 2f, y + h - 29f - index * 13f, w - 34f, fonts.serifBold, 10.5f, 6.5f)
                }
            }
            else -> fitCenteredAt(rc, profile.uppercase(), x + w / 2f, y + h - 35f, w - 36f, fonts.sansBold, 12f, 7f)
        }

        rc.drawCentredString(x + w / 2f, y + h - 78f, preface, textPaint(fonts.sans, 11f))

        val measure = Paint(Paint.ANTI_ALIAS_FLAG).apply { typeface = fonts.sansBold }
        var nameSize = 15f
        measure.textSize = nameSize
        while (nameSize > 9f && measure.measureText(name) > w - 42f) {
            nameSize -= 0.5f
            measure.textSize = nameSize
        }
        rc.drawCentredString(x + w / 2f, y + h - 112f, name, textPaint(fonts.sansBold, nameSize))

        fitCenteredAt(rc, funeralHome, x + w / 2f, y + h - 140f, w - 32f, fonts.serifBold, 10.5f, 6.5f)
        fitCenteredAt(rc, cityState, x + w / 2f, y + h - 154f, w - 32f, fonts.serifBold, 10.5f, 6.5f)

        drawDisclosure(rc, disclosure, x + w / 2f, y, w, fonts.sans)
    }

    /**
     * Approximates reportlab's `Paragraph` flowable (fontSize 6.4, leading
     * 7.1, wrapped to `w - 32`, vertically centered in a 43pt band starting
     * 17pt above the label's bottom edge) using plain greedy word-wrap. Exact
     * glyph-level reportlab metrics aren't reproduced, but every layout
     * constant from `app.py` is unchanged.
     */
    private fun drawDisclosure(rc: ReportLabStyleCanvas, disclosure: String, centerX: Float, y: Float, w: Float, sans: Typeface) {
        if (disclosure.isEmpty()) return
        val paint = textPaint(sans, 6.4f).apply { textAlign = Paint.Align.CENTER }
        val wrapWidth = w - 32f
        val lines = ReportLabStyleCanvas.wrapText(disclosure, wrapWidth, paint)
        if (lines.isEmpty()) return
        val leading = 7.1f
        val contentHeight = lines.size * leading
        val verticalOffset = maxOf(0f, (43f - contentHeight) / 2f)
        val blockBottom = y + 17f + verticalOffset
        val topBaseline = blockBottom + contentHeight - leading
        lines.forEachIndexed { index, line ->
            rc.drawCentredString(centerX, topBaseline - index * leading, line, paint)
        }
    }

    private fun aspectFitBox(bitmapW: Int, bitmapH: Int, boxX: Float, boxY: Float, boxW: Float, boxH: Float): FloatArray {
        if (bitmapW <= 0 || bitmapH <= 0) return floatArrayOf(boxX, boxY, boxW, boxH)
        val scale = minOf(boxW / bitmapW, boxH / bitmapH)
        val fitW = bitmapW * scale
        val fitH = bitmapH * scale
        return floatArrayOf(boxX + (boxW - fitW) / 2f, boxY + (boxH - fitH) / 2f, fitW, fitH)
    }

    private fun textPaint(typeface: Typeface, size: Float) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        this.typeface = typeface
        this.textSize = size
        this.color = Color.BLACK
    }

    /** Mirrors `draw_centered_fit_at()`. */
    private fun fitCenteredAt(
        rc: ReportLabStyleCanvas,
        text: String,
        centerX: Float,
        y: Float,
        maxWidth: Float,
        typeface: Typeface,
        size: Float,
        minSize: Float
    ) {
        val cleaned = TextNormalization.cleanText(text)
        val fitted = ReportLabStyleCanvas.fitTextSize(cleaned, maxWidth, typeface, size, minSize)
        rc.drawCentredString(centerX, y, cleaned, textPaint(typeface, fitted))
    }
}
