package com.lastresponder.certificatestickermaker.ui.screens.review

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.lastresponder.certificatestickermaker.domain.BtpNameExtraction
import com.lastresponder.certificatestickermaker.ui.components.LrtsTopBar
import com.lastresponder.certificatestickermaker.ui.components.MatchBanner
import com.lastresponder.certificatestickermaker.ui.components.SectionCard
import com.lastresponder.certificatestickermaker.ui.components.StepHeading
import com.lastresponder.certificatestickermaker.viewmodel.JobViewModel

/** Screen 5: OCR results and document comparison. Every extracted value is editable; nothing is final here. */
@Composable
fun OcrReviewScreen(
    jobViewModel: JobViewModel,
    onBack: () -> Unit,
    onNext: () -> Unit
) {
    val state by jobViewModel.state.collectAsState()

    Scaffold(topBar = { LrtsTopBar("Review the Case Record", onBack) }) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            StepHeading(5, "Compare the source documents", "OCR results are drafts. Correct anything before it becomes the printed record.")

            MatchBanner(state.nameMatch)

            SectionCard {
                Text("Burial-Transit Permit", style = MaterialTheme.typography.titleMedium)
                if (state.btpImageUri != null) {
                    AsyncImage(
                        model = state.btpImageUri,
                        contentDescription = "BTP source photo",
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxWidth().aspectRatio(4f / 3f)
                    )
                } else {
                    Text("No BTP photo was captured for this case.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                OutlinedTextField(
                    value = state.btpName,
                    onValueChange = { value ->
                        jobViewModel.updateField { it.copy(btpName = value) }
                    },
                    label = { Text("BTP legal name") },
                    modifier = Modifier.fillMaxWidth()
                )
            }

            SectionCard {
                Text("Cremation Log", style = MaterialTheme.typography.titleMedium)
                if (state.logImageUri != null) {
                    AsyncImage(
                        model = state.logImageUri,
                        contentDescription = "Cremation log source photo",
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxWidth().aspectRatio(4f / 3f)
                    )
                } else {
                    Text("No cremation-log photo was captured for this case.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                OutlinedTextField(
                    value = state.logName,
                    onValueChange = { value -> jobViewModel.updateField { it.copy(logName = value) } },
                    label = { Text("Cremation-log name") },
                    modifier = Modifier.fillMaxWidth()
                )
            }

            SectionCard {
                Text("Proposed final values", style = MaterialTheme.typography.titleMedium)
                OutlinedTextField(
                    value = state.decedentName,
                    onValueChange = { value ->
                        jobViewModel.updateLegalName(BtpNameExtraction.splitLegalName(value))
                    },
                    label = { Text("Confirmed decedent name") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = state.cremationDate,
                    onValueChange = { value -> jobViewModel.updateField { it.copy(cremationDate = value) } },
                    label = { Text("Date of cremation") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = state.discId,
                    onValueChange = { value -> jobViewModel.updateField { it.copy(discId = value) } },
                    label = { Text("I.D. disc/disk number") },
                    modifier = Modifier.fillMaxWidth()
                )
            }

            Button(onClick = onNext, modifier = Modifier.fillMaxWidth()) { Text("Continue to required verification") }
        }
    }
}
