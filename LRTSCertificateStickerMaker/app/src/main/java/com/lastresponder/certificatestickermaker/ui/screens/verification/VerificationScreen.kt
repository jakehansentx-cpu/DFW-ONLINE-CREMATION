package com.lastresponder.certificatestickermaker.ui.screens.verification

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.lastresponder.certificatestickermaker.domain.DateParsing
import com.lastresponder.certificatestickermaker.ui.components.Banner
import com.lastresponder.certificatestickermaker.ui.components.LrtsTopBar
import com.lastresponder.certificatestickermaker.ui.components.MatchBanner
import com.lastresponder.certificatestickermaker.ui.components.SectionCard
import com.lastresponder.certificatestickermaker.ui.components.StepHeading
import com.lastresponder.certificatestickermaker.ui.theme.LrtsAmber
import com.lastresponder.certificatestickermaker.ui.theme.LrtsAmberPale
import com.lastresponder.certificatestickermaker.viewmodel.JobViewModel

/**
 * Screen 6: required verification. Printing (certificate or labels) is
 * disabled everywhere downstream until [state.reviewConfirmed] is true -
 * mirrors the source mock's hard block on `#certificateButton`/`#labelsButton`
 * until "I compared the information with the source documents..." is checked.
 */
@Composable
fun VerificationScreen(
    jobViewModel: JobViewModel,
    onBack: () -> Unit,
    onContinueToCertificate: () -> Unit,
    onContinueToLabels: () -> Unit
) {
    val state by jobViewModel.state.collectAsState()

    Scaffold(topBar = { LrtsTopBar("Required Verification", onBack) }) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            StepHeading(6, "Confirm before printing", "OCR results are drafts only. Printing is blocked until this is confirmed.")

            MatchBanner(state.nameMatch)

            SectionCard {
                Text("Final values", style = MaterialTheme.typography.titleMedium)
                SummaryRow("Decedent name", state.decedentName)
                SummaryRow("Date of cremation", DateParsing.prettyDate(state.cremationDate))
                SummaryRow("I.D. disc/disk number", state.discId)
                SummaryRow("BTP source name", state.btpName)
                SummaryRow("Cremation-log source name", state.logName)
            }

            if (!state.certificateReady && (state.decedentName.isBlank() || state.cremationDate.isBlank() || state.discId.isBlank())) {
                Banner(
                    "Certificate printing needs a decedent name, cremation date, and disc number before it can be created.",
                    LrtsAmberPale, LrtsAmber
                )
            }

            SectionCard {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = state.reviewConfirmed,
                        onCheckedChange = { checked -> jobViewModel.setReviewConfirmed(checked) }
                    )
                    Text(
                        "I reviewed the source documents and confirm this information is correct.",
                        style = MaterialTheme.typography.bodyLarge
                    )
                }
            }

            Button(
                onClick = onContinueToCertificate,
                enabled = state.certificateReady,
                modifier = Modifier.fillMaxWidth()
            ) { Text("Continue to certificate preview") }

            OutlinedButton(
                onClick = onContinueToLabels,
                enabled = state.reviewConfirmed && state.decedentName.isNotBlank(),
                modifier = Modifier.fillMaxWidth()
            ) { Text("Continue to sticker labels") }
        }
    }
}

@Composable
private fun SummaryRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value.ifBlank { "—" }, style = MaterialTheme.typography.bodyLarge)
    }
}
