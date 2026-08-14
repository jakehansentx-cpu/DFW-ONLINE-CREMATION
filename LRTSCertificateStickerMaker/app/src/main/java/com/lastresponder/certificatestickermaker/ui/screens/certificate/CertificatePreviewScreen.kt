package com.lastresponder.certificatestickermaker.ui.screens.certificate

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.lastresponder.certificatestickermaker.pdf.PdfPreviewRenderer
import com.lastresponder.certificatestickermaker.pdf.printPdfFile
import com.lastresponder.certificatestickermaker.ui.components.LrtsTopBar
import com.lastresponder.certificatestickermaker.ui.components.SectionCard
import com.lastresponder.certificatestickermaker.ui.components.StepHeading
import com.lastresponder.certificatestickermaker.viewmodel.JobViewModel
import com.lastresponder.certificatestickermaker.viewmodel.PdfOutcome
import kotlinx.coroutines.launch
import java.io.File

/** Screen 7: certificate preview, with Print / Save PDF / Open PDF / Share PDF. */
@Composable
fun CertificatePreviewScreen(
    jobViewModel: JobViewModel,
    onBack: () -> Unit,
    onDone: () -> Unit,
    onMakeLabelsToo: () -> Unit
) {
    val context = LocalContext.current
    val state by jobViewModel.state.collectAsState()
    val scope = rememberCoroutineScope()
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isGenerating by remember { mutableStateOf(false) }
    var previewFile by remember { mutableStateOf<File?>(null) }

    LaunchedEffect(Unit) {
        isGenerating = true
        when (val outcome = jobViewModel.generateCertificate()) {
            is PdfOutcome.Success -> previewFile = outcome.file
            is PdfOutcome.Failure -> errorMessage = outcome.message
        }
        isGenerating = false
    }

    Scaffold(topBar = { LrtsTopBar("Certificate Preview", onBack) }) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            StepHeading(7, "Certificate of Cremation", "US Letter print-ready PDF. Print at 100% / Actual Size.")

            SectionCard {
                when {
                    isGenerating -> CircularProgressIndicator()
                    errorMessage != null -> Text(errorMessage!!, color = MaterialTheme.colorScheme.error)
                    previewFile != null -> {
                        val bitmap = remember(previewFile) { PdfPreviewRenderer.renderPage(previewFile!!, 0, 900) }
                        if (bitmap != null) {
                            Image(bitmap.asImageBitmap(), contentDescription = "Certificate preview", modifier = Modifier.fillMaxWidth())
                        } else {
                            Text("Preview unavailable, but the PDF was generated successfully.")
                        }
                    }
                }
            }

            if (previewFile != null) {
                val file = previewFile!!
                Button(onClick = { printPdfFile(context, file, "LRTS Certificate") }, modifier = Modifier.fillMaxWidth()) {
                    Text("Print")
                }
                OutlinedButton(
                    onClick = { scope.launch { jobViewModel.pdfFileManager().saveToDownloads(file) } },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Save PDF") }
                OutlinedButton(
                    onClick = { context.startActivity(jobViewModel.pdfFileManager().openIntent(file)) },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Open PDF") }
                OutlinedButton(
                    onClick = { context.startActivity(jobViewModel.pdfFileManager().shareIntent(file)) },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Share PDF") }
            }

            Button(onClick = onMakeLabelsToo, modifier = Modifier.fillMaxWidth()) { Text("Continue to sticker labels") }
            OutlinedButton(onClick = onDone, modifier = Modifier.fillMaxWidth()) { Text("Done - go to results") }
        }
    }
}
