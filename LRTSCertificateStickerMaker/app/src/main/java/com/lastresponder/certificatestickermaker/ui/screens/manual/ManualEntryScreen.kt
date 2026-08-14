package com.lastresponder.certificatestickermaker.ui.screens.manual

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.lastresponder.certificatestickermaker.ui.components.LrtsTopBar
import com.lastresponder.certificatestickermaker.ui.components.SectionCard
import com.lastresponder.certificatestickermaker.ui.components.StepHeading
import com.lastresponder.certificatestickermaker.viewmodel.JobViewModel

@Composable
fun ManualEntryScreen(
    jobViewModel: JobViewModel,
    onBack: () -> Unit,
    onNext: () -> Unit
) {
    val state by jobViewModel.state.collectAsState()
    val legalName = state.legalName

    Scaffold(topBar = { LrtsTopBar("Manual Entry", onBack) }) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            StepHeading(1, "Enter the decedent's legal name", "Every field below is typed directly - nothing is assumed.")

            SectionCard {
                LabeledField("First name", legalName.first) {
                    jobViewModel.updateLegalName(legalName.copy(first = it))
                }
                LabeledField("Middle name or initial (if present)", legalName.middle) {
                    jobViewModel.updateLegalName(legalName.copy(middle = it))
                }
                LabeledField("Last name", legalName.last) {
                    jobViewModel.updateLegalName(legalName.copy(last = it))
                }
                LabeledField("Suffix (if present)", legalName.suffix) {
                    jobViewModel.updateLegalName(legalName.copy(suffix = it))
                }
            }

            SectionCard {
                Text("Cremation details")
                LabeledField("Date of cremation (YYYY-MM-DD)", state.cremationDate) { value ->
                    jobViewModel.updateField { it.copy(cremationDate = value) }
                }
                LabeledField("I.D. disc/disk number", state.discId) { value ->
                    jobViewModel.updateField { it.copy(discId = value) }
                }
                LabeledField("Approximate weight (optional)", state.approxWeight) { value ->
                    jobViewModel.updateField { it.copy(approxWeight = value) }
                }
                LabeledField("Start time (optional)", state.startTime) { value ->
                    jobViewModel.updateField { it.copy(startTime = value) }
                }
                LabeledField("Retort (optional)", state.retort) { value ->
                    jobViewModel.updateField { it.copy(retort = value) }
                }
                LabeledField("Operator (optional)", state.operator) { value ->
                    jobViewModel.updateField { it.copy(operator = value) }
                }
                LabeledField("Case type (optional)", state.caseType) { value ->
                    jobViewModel.updateField { it.copy(caseType = value) }
                }
            }

            Button(onClick = onNext, modifier = Modifier.fillMaxWidth()) { Text("Continue to review") }
        }
    }
}

@Composable
private fun LabeledField(label: String, value: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = true,
        modifier = Modifier.fillMaxWidth()
    )
}
