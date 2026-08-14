package com.lastresponder.certificatestickermaker.ui.screens.labels

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.lastresponder.certificatestickermaker.pdf.LabelPagination
import com.lastresponder.certificatestickermaker.pdf.PdfPreviewRenderer
import com.lastresponder.certificatestickermaker.pdf.printPdfFile
import com.lastresponder.certificatestickermaker.ui.components.LrtsTopBar
import com.lastresponder.certificatestickermaker.ui.components.SectionCard
import com.lastresponder.certificatestickermaker.ui.components.StepHeading
import com.lastresponder.certificatestickermaker.viewmodel.JobViewModel
import com.lastresponder.certificatestickermaker.viewmodel.PdfOutcome
import kotlinx.coroutines.launch
import java.io.File

/** Screen 10: final label-sheet checkpoint, then the rendered preview with Print/Save/Open/Share. */
@Composable
fun LabelPreviewScreen(
    jobViewModel: JobViewModel,
    onBack: () -> Unit,
    onDone: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val state by jobViewModel.state.collectAsState()
    var printCheckConfirmed by remember { mutableStateOf(false) }
    var generatedFile by remember { mutableStateOf<File?>(null) }
    var isGenerating by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    val quantity = state.labelQuantity
    val positions = state.labelPositions.sorted()
    val firstSheetCount = minOf(quantity, positions.size)
    val additional = maxOf(0, quantity - firstSheetCount)
    val extraSheets = if (additional > 0) (additional + LabelPagination.POSITIONS_PER_SHEET - 1) / LabelPagination.POSITIONS_PER_SHEET else 0

    Scaffold(topBar = { LrtsTopBar("Sticker Print Checkpoint", onBack) }) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            StepHeading(10, "Verify before printing", "Confirm the funeral home, decedent, quantity, and exact sheet positions.")

            SectionCard {
                SummaryRow("Funeral home", state.funeralHome)
                SummaryRow("Decedent name", state.decedentName)
                SummaryRow("Number of stickers", quantity.toString())
                SummaryRow("First-sheet positions", positions.joinToString(", ").ifBlank { "None" })
                SummaryRow(
                    "Additional sheets",
                    if (extraSheets > 0) "$extraSheets fresh sheet${if (extraSheets == 1) "" else "s"} after the first" else "No additional sheets"
                )
            }

            SectionCard {
                Text("First-sheet preview", fontWeight = FontWeight.SemiBold)
                MiniSheet(printingPositions = positions.take(firstSheetCount).toSet())
                Text(
                    if (additional > 0) {
                        "$firstSheetCount sticker(s) will print on the selected positions of the first sheet. " +
                            "The remaining $additional will begin at position 1 on $extraSheets fresh sheet(s)."
                    } else {
                        "Only the highlighted positions will be printed. Everything else on the sheet stays blank."
                    },
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            if (generatedFile == null) {
                SectionCard {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = printCheckConfirmed, onCheckedChange = { printCheckConfirmed = it })
                        Text("I verified the sticker count and the available positions on the physical label sheet.")
                    }
                }
                errorMessage?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                Button(
                    onClick = {
                        scope.launch {
                            isGenerating = true
                            when (val outcome = jobViewModel.generateLabels()) {
                                is PdfOutcome.Success -> generatedFile = outcome.file
                                is PdfOutcome.Failure -> errorMessage = outcome.message
                            }
                            isGenerating = false
                        }
                    },
                    enabled = printCheckConfirmed && !isGenerating,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    if (isGenerating) CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp))
                    Text(if (isGenerating) "Creating sticker PDF..." else "Create Sticker PDF")
                }
            } else {
                val file = generatedFile!!
                SectionCard {
                    val bitmap = remember(file) { PdfPreviewRenderer.renderPage(file, 0, 900) }
                    if (bitmap != null) {
                        Image(bitmap.asImageBitmap(), contentDescription = "Label sheet preview", modifier = Modifier.fillMaxWidth())
                    }
                    val pageCount = remember(file) { PdfPreviewRenderer.pageCount(file) }
                    if (pageCount > 1) {
                        Text("$pageCount sheets total. Print all pages at 100% / Actual Size.")
                    }
                }
                Button(onClick = { printPdfFile(context, file, "LRTS Avery 8464 Labels") }, modifier = Modifier.fillMaxWidth()) { Text("Print") }
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
                Button(onClick = onDone, modifier = Modifier.fillMaxWidth()) { Text("Done - go to results") }
            }
        }
    }
}

@Composable
private fun MiniSheet(printingPositions: Set<Int>) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        for (row in 0..2) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                for (col in 0..1) {
                    val position = row * 2 + col + 1
                    val printing = position in printingPositions
                    Card(
                        shape = RoundedCornerShape(8.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = if (printing) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.errorContainer
                        ),
                        modifier = Modifier.size(width = 88.dp, height = 50.dp)
                    ) {
                        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                "$position",
                                color = if (printing) MaterialTheme.colorScheme.onSecondary else MaterialTheme.colorScheme.onErrorContainer,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SummaryRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value.ifBlank { "—" })
    }
}
