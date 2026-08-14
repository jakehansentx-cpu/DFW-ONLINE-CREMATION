package com.lastresponder.certificatestickermaker.ui.screens.results

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.lastresponder.certificatestickermaker.ui.components.LrtsTopBar
import com.lastresponder.certificatestickermaker.ui.components.SectionCard
import com.lastresponder.certificatestickermaker.ui.theme.LrtsGreen
import com.lastresponder.certificatestickermaker.viewmodel.JobViewModel
import java.io.File

/** Screen 11: print/save/share results summary. */
@Composable
fun ResultsScreen(
    jobViewModel: JobViewModel,
    onNewCase: () -> Unit,
    onBackHome: () -> Unit
) {
    val context = LocalContext.current
    val state by jobViewModel.state.collectAsState()

    Scaffold(topBar = { LrtsTopBar("Case Complete") }) { padding ->
        Column(Modifier.padding(padding).fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            SectionCard {
                Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = LrtsGreen)
                Text("Case reviewed and confirmed", style = MaterialTheme.typography.titleLarge)
                Text(state.decedentName.ifBlank { "Unnamed case" }, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            state.lastCertificatePdfPath?.let { path ->
                DocumentRow(context, "Certificate of Cremation", path, jobViewModel)
            }
            state.lastLabelsPdfPath?.let { path ->
                DocumentRow(context, "Avery 8464 Labels", path, jobViewModel)
            }
            if (state.lastCertificatePdfPath == null && state.lastLabelsPdfPath == null) {
                Text("No documents were generated for this case yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            Text(
                "Print both PDFs at 100% / Actual Size. Certificate and sticker PDFs are separate files.",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Button(onClick = onNewCase, modifier = Modifier.fillMaxWidth()) { Text("Clear Current Job / New Case") }
            OutlinedButton(onClick = onBackHome, modifier = Modifier.fillMaxWidth()) { Text("Back to Home") }
        }
    }
}

@Composable
private fun DocumentRow(context: android.content.Context, title: String, path: String, jobViewModel: JobViewModel) {
    val file = File(path)
    SectionCard {
        Text(title, style = MaterialTheme.typography.titleMedium)
        Text(file.name, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedButton(
            onClick = { context.startActivity(jobViewModel.pdfFileManager().openIntent(file)) },
            modifier = Modifier.fillMaxWidth()
        ) { Text("Open PDF") }
        OutlinedButton(
            onClick = { context.startActivity(jobViewModel.pdfFileManager().shareIntent(file)) },
            modifier = Modifier.fillMaxWidth()
        ) { Text("Share PDF") }
    }
}
