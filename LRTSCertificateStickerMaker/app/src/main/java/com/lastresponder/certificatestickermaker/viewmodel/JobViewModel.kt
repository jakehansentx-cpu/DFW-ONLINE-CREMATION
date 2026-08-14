package com.lastresponder.certificatestickermaker.viewmodel

import android.app.Application
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.lastresponder.certificatestickermaker.data.ImageSource
import com.lastresponder.certificatestickermaker.data.model.IntakeMode
import com.lastresponder.certificatestickermaker.data.model.JobState
import com.lastresponder.certificatestickermaker.data.repository.ProfileRepository
import com.lastresponder.certificatestickermaker.domain.BtpNameExtraction
import com.lastresponder.certificatestickermaker.domain.DateParsing
import com.lastresponder.certificatestickermaker.ocr.DocumentOcrProcessor
import com.lastresponder.certificatestickermaker.ocr.DocumentType
import com.lastresponder.certificatestickermaker.ocr.toBtpFields
import com.lastresponder.certificatestickermaker.ocr.toLogRows
import com.lastresponder.certificatestickermaker.pdf.CertificateData
import com.lastresponder.certificatestickermaker.pdf.CertificateGenerator
import com.lastresponder.certificatestickermaker.pdf.LabelPrintData
import com.lastresponder.certificatestickermaker.pdf.LabelSheetGenerator
import com.lastresponder.certificatestickermaker.pdf.PdfFileManager
import com.lastresponder.certificatestickermaker.pdf.PdfFonts
import com.lastresponder.certificatestickermaker.util.JobFileManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.File

sealed interface PdfOutcome {
    data class Success(val file: File) : PdfOutcome
    data class Failure(val message: String) : PdfOutcome
}

/**
 * Holds the single in-progress case (see [JobState]) and the actions the
 * review/verification/print screens perform on it. One instance is shared
 * across the whole intake -> review -> verification -> print navigation
 * flow (scoped to the NavHost's owning Activity).
 */
class JobViewModel(application: Application) : AndroidViewModel(application) {

    private val jobFiles = JobFileManager(application)
    private val pdfFiles = PdfFileManager(application)
    private val profileRepository = ProfileRepository(application)
    private val fonts by lazy { PdfFonts.get(application) }

    private val _state = MutableStateFlow(JobState())
    val state: StateFlow<JobState> = _state

    fun setIntakeMode(mode: IntakeMode) = _state.update { it.copy(intakeMode = mode) }

    fun setBtpImage(uri: Uri?) = _state.update { it.copy(btpImageUri = uri, btpOcrResult = null) }
    fun setLogImage(uri: Uri?) = _state.update { it.copy(logImageUri = uri, logOcrResult = null, logRowCandidates = emptyList(), selectedLogRowIndex = null) }

    fun jobFileManager(): JobFileManager = jobFiles

    fun runBtpOcr() {
        val uri = _state.value.btpImageUri ?: return
        _state.update { it.copy(btpOcrRunning = true) }
        viewModelScope.launch {
            val bitmap = decodeBitmap(uri)
            val result = if (bitmap != null) DocumentOcrProcessor.recognize(bitmap, DocumentType.BTP) else null
            val name = result?.toBtpFields()?.fullName.orEmpty()
            _state.update {
                it.copy(
                    btpOcrRunning = false,
                    btpOcrResult = result,
                    btpName = name,
                    decedentName = it.decedentName.ifBlank { name },
                    legalName = if (name.isNotBlank()) BtpNameExtraction.splitLegalName(name) else it.legalName
                )
            }
        }
    }

    fun runLogOcr() {
        val uri = _state.value.logImageUri ?: return
        _state.update { it.copy(logOcrRunning = true) }
        viewModelScope.launch {
            val bitmap = decodeBitmap(uri)
            val result = if (bitmap != null) DocumentOcrProcessor.recognize(bitmap, DocumentType.CREMATION_LOG) else null
            val rows = result?.toLogRows().orEmpty()
            _state.update {
                it.copy(
                    logOcrRunning = false,
                    logOcrResult = result,
                    logRowCandidates = rows,
                    selectedLogRowIndex = if (rows.size == 1) 0 else null,
                    logName = if (rows.size == 1) rows[0].name else it.logName,
                    cremationDate = if (rows.size == 1) rows[0].cremationDate.ifBlank { it.cremationDate } else it.cremationDate,
                    discId = if (rows.size == 1) rows[0].discId.ifBlank { it.discId } else it.discId
                )
            }
        }
    }

    fun selectLogRow(index: Int) {
        val row = _state.value.logRowCandidates.getOrNull(index) ?: return
        _state.update {
            it.copy(
                selectedLogRowIndex = index,
                logName = row.name,
                cremationDate = row.cremationDate.ifBlank { it.cremationDate },
                discId = row.discId.ifBlank { it.discId }
            )
        }
    }

    private fun decodeBitmap(uri: Uri): Bitmap? = try {
        getApplication<Application>().contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
    } catch (error: Exception) {
        null
    }

    fun updateLegalName(legalName: com.lastresponder.certificatestickermaker.domain.LegalName) {
        _state.update { it.copy(legalName = legalName, decedentName = legalName.full) }
    }

    fun updateField(update: (JobState) -> JobState) = _state.update(update)

    fun applyProfileDefaults(profileId: String) {
        viewModelScope.launch {
            val profile = profileRepository.findById(profileId) ?: return@launch
            _state.update {
                it.copy(
                    selectedProfileId = profile.id,
                    funeralHome = profile.funeralHome,
                    funeralHomeCityState = profile.cityState,
                    labelQuantity = profile.defaultQuantity,
                    labelPreface = profile.preface,
                    labelDisclosure = profile.disclosure
                )
            }
        }
    }

    fun setReviewConfirmed(confirmed: Boolean) = _state.update { it.copy(reviewConfirmed = confirmed) }

    suspend fun generateCertificate(): PdfOutcome {
        val current = _state.value
        return try {
            val document = CertificateGenerator.generate(
                CertificateData(
                    decedentName = current.decedentName,
                    cremationDate = current.cremationDate,
                    discId = current.discId,
                    crematoryName = current.crematoryName,
                    crematoryCityState = current.crematoryCityState,
                    providerService = current.providerService,
                    providerLocation = current.providerLocation
                ),
                fonts
            )
            val file = pdfFiles.save(document, "Certificate_${current.decedentName.replace(" ", "_")}.pdf")
            _state.update { it.copy(lastCertificatePdfPath = file.absolutePath) }
            PdfOutcome.Success(file)
        } catch (error: IllegalArgumentException) {
            PdfOutcome.Failure(error.message ?: "Certificate could not be created.")
        }
    }

    suspend fun generateLabels(): PdfOutcome {
        val current = _state.value
        return try {
            val profile = profileRepository.findById(current.selectedProfileId)
            val logoBitmap = profile?.logoPath?.let { ImageSource.loadBitmap(getApplication(), it) }
            val data = LabelPrintData(
                labelProfileName = current.funeralHome.ifBlank { profile?.funeralHome.orEmpty() },
                funeralHome = current.funeralHome,
                funeralHomeCityState = current.funeralHomeCityState,
                printFuneralHome = profile?.printFuneralHome,
                printCityState = profile?.printCityState,
                decedentName = current.decedentName,
                preface = current.labelPreface,
                disclosure = current.labelDisclosure,
                logoBitmap = logoBitmap,
                headerMode = profile?.headerMode.orEmpty(),
                headerText = profile?.headerText.orEmpty()
            )
            val document = LabelSheetGenerator.generate(
                data,
                current.labelQuantity,
                current.labelPositions.toList(),
                fonts
            )
            val file = pdfFiles.save(document, "Avery_8464_${current.decedentName.replace(" ", "_")}.pdf")
            _state.update { it.copy(lastLabelsPdfPath = file.absolutePath) }
            PdfOutcome.Success(file)
        } catch (error: IllegalArgumentException) {
            PdfOutcome.Failure(error.message ?: "Labels could not be created.")
        }
    }

    fun pdfFileManager(): PdfFileManager = pdfFiles

    /** "Clear Current Job": wipes temp photos/working PDFs, resets state. Profiles (Room) are untouched. */
    fun clearJob() {
        jobFiles.clearJob()
        _state.value = JobState()
    }
}
