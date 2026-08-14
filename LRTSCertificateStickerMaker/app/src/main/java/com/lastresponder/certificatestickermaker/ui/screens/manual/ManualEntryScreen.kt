package com.lastresponder.certificatestickermaker.ui.screens.manual

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material3.Button
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.lastresponder.certificatestickermaker.ui.components.LrtsTopBar
import com.lastresponder.certificatestickermaker.ui.components.SectionCard
import com.lastresponder.certificatestickermaker.ui.components.StepHeading
import com.lastresponder.certificatestickermaker.viewmodel.JobViewModel
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

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
                DateField("Date of cremation", state.cremationDate) { value ->
                    jobViewModel.updateField { it.copy(cremationDate = value) }
                }
                LabeledField("I.D. disc/disk number", state.discId) { value ->
                    jobViewModel.updateField { it.copy(discId = value) }
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

/**
 * Read-only date field backed by a calendar picker rather than free-text
 * entry, so the date can only ever come out in valid YYYY-MM-DD form -
 * nothing here is typed or guessed.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateField(label: String, value: String, onChange: (String) -> Unit) {
    var showPicker by remember { mutableStateOf(false) }

    Box(Modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = value,
            onValueChange = {},
            label = { Text(label) },
            singleLine = true,
            readOnly = true,
            trailingIcon = { Icon(Icons.Default.CalendarMonth, contentDescription = "Pick date") },
            modifier = Modifier.fillMaxWidth()
        )
        // OutlinedTextField's own touch handling does not reliably surface a
        // click when readOnly, so a transparent overlay is what actually
        // opens the picker on tap anywhere in the field.
        Box(Modifier.matchParentSize().clickable { showPicker = true })
    }

    if (showPicker) {
        val initialMillis = runCatching {
            LocalDate.parse(value).atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        }.getOrNull()
        val pickerState = rememberDatePickerState(initialSelectedDateMillis = initialMillis)
        DatePickerDialog(
            onDismissRequest = { showPicker = false },
            confirmButton = {
                TextButton(onClick = {
                    pickerState.selectedDateMillis?.let { millis ->
                        val date = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate()
                        onChange(date.toString())
                    }
                    showPicker = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { showPicker = false }) { Text("Cancel") } }
        ) {
            DatePicker(state = pickerState)
        }
    }
}
