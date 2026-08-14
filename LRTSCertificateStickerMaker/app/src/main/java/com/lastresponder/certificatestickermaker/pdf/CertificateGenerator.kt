package com.lastresponder.certificatestickermaker.pdf

import android.graphics.Color
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import com.lastresponder.certificatestickermaker.domain.DateParsing
import com.lastresponder.certificatestickermaker.domain.TextNormalization

/** Fields needed to print the certificate. Mirrors the case fields `make_certificate()` reads from `case`. */
data class CertificateData(
    val decedentName: String,
    val cremationDate: String,
    val discId: String,
    val crematoryName: String = "",
    val crematoryCityState: String = "",
    val providerService: String = "",
    val providerLocation: String = ""
)

class CertificateValidationException(missingFields: List<String>) :
    IllegalArgumentException("Certificate cannot be created until these fields are confirmed: " + missingFields.joinToString(", "))

/**
 * Ported from the source mock's `app.py` `make_certificate()`. Page size,
 * every x/y coordinate, line widths, and font sizes are unchanged from the
 * original reportlab implementation — only the drawing backend changed, from
 * reportlab's `canvas.Canvas` to Android's `PdfDocument` (via
 * [ReportLabStyleCanvas], which keeps the same bottom-up coordinate math).
 */
object CertificateGenerator {

    // 7.5in x 5.5in exactly (540pt x 396pt at 72pt/in) - the actual Metro
    // certificate stock paper size, not US Letter - see MIGRATION_MAP.md.
    const val PAGE_WIDTH_PT = 540f
    const val PAGE_HEIGHT_PT = 396f
    private const val CENTER_X = PAGE_WIDTH_PT / 2f

    fun generate(data: CertificateData, fonts: PdfFonts): PdfDocument {
        val missing = buildList {
            if (TextNormalization.cleanText(data.decedentName).isEmpty()) add("Decedent name")
            if (TextNormalization.cleanText(data.cremationDate).isEmpty()) add("Date of cremation")
            if (TextNormalization.cleanText(data.discId).isEmpty()) add("I.D. disc number")
        }
        if (missing.isNotEmpty()) throw CertificateValidationException(missing)

        val document = PdfDocument()
        val pageInfo = PdfDocument.PageInfo.Builder(
            PAGE_WIDTH_PT.toInt(),
            PAGE_HEIGHT_PT.toInt(),
            1
        ).create()
        val page = document.startPage(pageInfo)
        val rc = ReportLabStyleCanvas(page.canvas, PAGE_HEIGHT_PT)

        val blue = Color.parseColor("#003A9B")
        val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = blue; strokeWidth = 1.1f }
        rc.strokeRect(10f, 10f, PAGE_WIDTH_PT - 20f, PAGE_HEIGHT_PT - 20f, borderPaint)
        val innerBorderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = blue; strokeWidth = 0.45f }
        rc.strokeRect(15f, 15f, PAGE_WIDTH_PT - 30f, PAGE_HEIGHT_PT - 30f, innerBorderPaint)

        fitCentered(rc, "Certificate of Cremation", 326f, 420f, fonts.sansBold, 18f)
        fitCentered(rc, "This is to certify that the remains of", 296f, 390f, fonts.sans, 11f)
        fitCentered(rc, TextNormalization.displayName(data.decedentName), 267f, 410f, fonts.sansBold, 16f)
        fitCentered(rc, "were cremated as documented below at the", 239f, 410f, fonts.sans, 11f)
        fitCentered(
            rc,
            TextNormalization.cleanText(data.crematoryName.ifBlank { "Metro Mortuary & Crematory" }),
            214f, 430f, fonts.sansBold, 14f
        )
        fitCentered(
            rc,
            TextNormalization.cleanText(data.crematoryCityState.ifBlank { "Sachse, Texas" }),
            190f, 390f, fonts.sans, 11f
        )

        val black = Color.BLACK
        val leftX = 82f
        val rightX = 300f
        val lineY = 146f
        val providerService = TextNormalization.cleanText(data.providerService.ifBlank { "Metro Mortuary & Crematory Service" })
        val providerLocation = TextNormalization.cleanText(data.providerLocation.ifBlank { "Sachse, Texas 75048" })
        val dateText = DateParsing.prettyDate(data.cremationDate)

        val body82 = textPaint(fonts.sans, 8.2f, black)
        val body72 = textPaint(fonts.sans, 7.2f, black)
        val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = black; strokeWidth = 1f }

        rc.drawString(leftX, lineY + 4f, providerService, body82)
        rc.line(leftX, lineY, 250f, lineY, linePaint)
        rc.drawString(leftX + 3f, lineY - 14f, "Services provided by:", body72)

        rc.line(rightX, lineY, 448f, lineY, linePaint)
        rc.drawString(rightX + 3f, lineY - 14f, "Signature of Metro Crematory Official", body72)

        rc.drawString(leftX, 93f, providerLocation, body82)
        rc.line(leftX, 90f, 240f, 90f, linePaint)
        rc.drawString(leftX + 3f, 77f, "Provider City, State Zip", body72)

        rc.drawString(rightX, 93f, dateText, body82)
        rc.line(rightX, 90f, 448f, 90f, linePaint)
        rc.drawString(rightX + 3f, 77f, "Date of Cremation", body72)

        fitCentered(rc, TextNormalization.cleanText(data.discId), 39f, 200f, fonts.sansBold, 14f)

        document.finishPage(page)
        return document
    }

    private fun textPaint(typeface: android.graphics.Typeface, size: Float, color: Int) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        this.typeface = typeface
        this.textSize = size
        this.color = color
    }

    /** Mirrors `draw_centered_fit()`: shrink-to-fit text centered on the certificate's fixed center x. */
    private fun fitCentered(
        rc: ReportLabStyleCanvas,
        text: String,
        y: Float,
        maxWidth: Float,
        typeface: android.graphics.Typeface,
        size: Float,
        minSize: Float = 8f
    ) {
        val cleaned = TextNormalization.cleanText(text)
        val fitted = ReportLabStyleCanvas.fitTextSize(cleaned, maxWidth, typeface, size, minSize)
        val paint = textPaint(typeface, fitted, Color.BLACK)
        rc.drawCentredString(CENTER_X, y, cleaned, paint)
    }
}
