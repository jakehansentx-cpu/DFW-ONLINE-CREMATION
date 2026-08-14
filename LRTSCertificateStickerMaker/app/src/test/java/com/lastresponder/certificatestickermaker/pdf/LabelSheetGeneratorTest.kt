package com.lastresponder.certificatestickermaker.pdf

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.io.FileOutputStream

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class LabelSheetGeneratorTest {

    private val context: Context get() = ApplicationProvider.getApplicationContext()
    private val fonts get() = PdfFonts.get(context)

    private fun writeToTempFile(document: android.graphics.pdf.PdfDocument): File {
        val file = File.createTempFile("labels_test", ".pdf")
        FileOutputStream(file).use { document.writeTo(it) }
        document.close()
        return file
    }

    @Test
    fun `All Texas -- quantity 3 at positions 1, 3, 6 produces one page`() {
        val data = LabelPrintData(
            labelProfileName = "All Texas Cremation",
            funeralHome = "All Texas Cremation",
            funeralHomeCityState = "Plano, Texas",
            decedentName = "Jake Hansen"
        )
        val document = LabelSheetGenerator.generate(data, 3, listOf(1, 3, 6), fonts)
        val file = writeToTempFile(document)
        assertEquals(1, PdfPreviewRenderer.pageCount(file))
        file.delete()
    }

    @Test
    fun `Pilar -- quantity 1 at position 4 produces one page`() {
        val data = LabelPrintData(
            labelProfileName = "Funeraria Pilar Funeral Home",
            funeralHome = "Funeraria Pilar Funeral Home",
            funeralHomeCityState = "",
            printFuneralHome = "",
            printCityState = "",
            decedentName = "Jake Hansen"
        )
        val document = LabelSheetGenerator.generate(data, 1, listOf(4), fonts)
        val file = writeToTempFile(document)
        assertEquals(1, PdfPreviewRenderer.pageCount(file))
        file.delete()
    }

    @Test
    fun `Temple and Sons -- quantity 2 at positions 2 and 6 produces one page`() {
        val data = LabelPrintData(
            labelProfileName = "Temple and Sons Funeral Directors",
            funeralHome = "Temple and Sons Funeral Directors",
            funeralHomeCityState = "Oklahoma City, OK",
            decedentName = "Jake Hansen",
            headerMode = "text",
            headerText = "Metro Mortuary & Crematory\nSachse, Texas"
        )
        val document = LabelSheetGenerator.generate(data, 2, listOf(2, 6), fonts)
        val file = writeToTempFile(document)
        assertEquals(1, PdfPreviewRenderer.pageCount(file))
        file.delete()
    }

    @Test
    fun `Hiett's -- full sheet of 6 produces one page with all six labels`() {
        val data = LabelPrintData(
            labelProfileName = "Hiett's LyBrand Funeral Home",
            funeralHome = "Hiett's LyBrand Funeral Home",
            funeralHomeCityState = "",
            printFuneralHome = "",
            printCityState = "",
            decedentName = "Jake Hansen"
        )
        val document = LabelSheetGenerator.generate(data, 6, listOf(1, 2, 3, 4, 5, 6), fonts)
        val file = writeToTempFile(document)
        assertEquals(1, PdfPreviewRenderer.pageCount(file))
        file.delete()
    }

    @Test
    fun `Commerce -- no standard disclosure does not crash and produces a valid sheet`() {
        val data = LabelPrintData(
            labelProfileName = "Commerce Funeral Home & Cremation Service",
            funeralHome = "Commerce Funeral Home & Cremation Service",
            funeralHomeCityState = "Commerce, Texas",
            decedentName = "Jake Hansen",
            disclosure = "" // Commerce's source design has no standard disclosure.
        )
        val document = LabelSheetGenerator.generate(data, 2, listOf(1, 2), fonts)
        val file = writeToTempFile(document)
        assertEquals(1, PdfPreviewRenderer.pageCount(file))
        file.delete()
    }

    @Test
    fun `multipage -- 10 labels with only 3 first-sheet positions spans 3 pages`() {
        val data = LabelPrintData(
            labelProfileName = "All Texas Cremation",
            funeralHome = "All Texas Cremation",
            funeralHomeCityState = "Plano, Texas",
            decedentName = "Jake Hansen"
        )
        val document = LabelSheetGenerator.generate(data, 10, listOf(1, 2, 3), fonts)
        val file = writeToTempFile(document)
        assertEquals(3, PdfPreviewRenderer.pageCount(file))
        file.delete()
    }

    @Test
    fun `missing decedent name blocks generation`() {
        val data = LabelPrintData(
            labelProfileName = "All Texas Cremation",
            funeralHome = "All Texas Cremation",
            funeralHomeCityState = "Plano, Texas",
            decedentName = ""
        )
        assertThrows(LabelValidationException::class.java) {
            LabelSheetGenerator.generate(data, 1, listOf(1), fonts)
        }
    }

    @Test
    fun `no positions selected blocks generation`() {
        val data = LabelPrintData(
            labelProfileName = "All Texas Cremation",
            funeralHome = "All Texas Cremation",
            funeralHomeCityState = "Plano, Texas",
            decedentName = "Jake Hansen"
        )
        assertThrows(LabelValidationException::class.java) {
            LabelSheetGenerator.generate(data, 3, emptyList(), fonts)
        }
    }

    @Test
    fun `sheet page size is US Letter`() {
        val data = LabelPrintData(
            labelProfileName = "All Texas Cremation",
            funeralHome = "All Texas Cremation",
            funeralHomeCityState = "Plano, Texas",
            decedentName = "Jake Hansen"
        )
        val document = LabelSheetGenerator.generate(data, 1, listOf(1), fonts)
        val file = writeToTempFile(document)
        val bitmap = PdfPreviewRenderer.renderPage(file, 0, 612)
        // At 1px-per-point scale (matches PAGE_WIDTH_PT), height should match PAGE_HEIGHT_PT (792pt).
        assertEquals(792, bitmap?.height)
        file.delete()
    }
}
