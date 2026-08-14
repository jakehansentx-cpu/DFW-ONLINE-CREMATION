package com.lastresponder.certificatestickermaker.pdf

import androidx.test.core.app.ApplicationProvider
import android.content.Context
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import java.io.FileOutputStream

/**
 * Certificate PDF generation. Uses "Jake Hansen", a clearly marked test
 * cremation date, and a clearly marked test disc number - test data only,
 * per the task's "do not use actual decedent information in automated
 * tests" requirement.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class CertificateGeneratorTest {

    private val context: Context get() = ApplicationProvider.getApplicationContext()
    private val fonts get() = PdfFonts.get(context)

    @Test
    fun `certificate test case -- Jake Hansen, test date, test disc number`() {
        val data = CertificateData(
            decedentName = "Jake Hansen",
            cremationDate = "2026-01-01", // clearly a test date, not an actual case
            discId = "TEST-00000" // clearly marked test disc number
        )
        val document = CertificateGenerator.generate(data, fonts)
        val file = File.createTempFile("certificate_test", ".pdf")
        FileOutputStream(file).use { document.writeTo(it) }
        document.close()

        assertEquals(1, PdfPreviewRenderer.pageCount(file))
        file.delete()
    }

    @Test
    fun `certificate page size matches the source stock-paper template, not US Letter`() {
        assertEquals(540f, CertificateGenerator.PAGE_WIDTH_PT)
        assertEquals(396.85f, CertificateGenerator.PAGE_HEIGHT_PT)
    }

    @Test
    fun `missing decedent name blocks generation`() {
        val error = assertThrows(CertificateValidationException::class.java) {
            CertificateGenerator.generate(
                CertificateData(decedentName = "", cremationDate = "2026-01-01", discId = "TEST-00000"),
                fonts
            )
        }
        assert(error.message!!.contains("Decedent name"))
    }

    @Test
    fun `missing cremation date blocks generation`() {
        assertThrows(CertificateValidationException::class.java) {
            CertificateGenerator.generate(
                CertificateData(decedentName = "Jake Hansen", cremationDate = "", discId = "TEST-00000"),
                fonts
            )
        }
    }

    @Test
    fun `missing disc number blocks generation`() {
        assertThrows(CertificateValidationException::class.java) {
            CertificateGenerator.generate(
                CertificateData(decedentName = "Jake Hansen", cremationDate = "2026-01-01", discId = ""),
                fonts
            )
        }
    }

    @Test
    fun `all three missing fields are named in the error`() {
        val error = assertThrows(CertificateValidationException::class.java) {
            CertificateGenerator.generate(CertificateData(decedentName = "", cremationDate = "", discId = ""), fonts)
        }
        assert(error.message!!.contains("Decedent name"))
        assert(error.message!!.contains("Date of cremation"))
        assert(error.message!!.contains("I.D. disc number"))
    }
}
