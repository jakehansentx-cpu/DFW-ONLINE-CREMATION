package com.lastresponder.certificatestickermaker.ui.screens.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.lastresponder.certificatestickermaker.data.model.IntakeMode
import com.lastresponder.certificatestickermaker.ui.components.LrtsTopBar
import com.lastresponder.certificatestickermaker.viewmodel.JobViewModel

private data class IntakeOption(val mode: IntakeMode, val title: String, val subtitle: String)

private val OPTIONS = listOf(
    IntakeOption(IntakeMode.SCAN, "Scan documents", "Photograph or upload the BTP and cremation log"),
    IntakeOption(IntakeMode.MANUAL, "Manual entry", "Type every certificate and sticker detail"),
    IntakeOption(IntakeMode.HYBRID, "Hybrid entry", "Scan what you have; type the rest")
)

@Composable
fun HomeScreen(
    jobViewModel: JobViewModel,
    onStartIntake: (IntakeMode) -> Unit,
    onOpenProfiles: () -> Unit,
    onOpenSettings: () -> Unit
) {
    val state by jobViewModel.state.collectAsState()
    val jobInProgress = state.decedentName.isNotBlank() || state.btpImageUri != null || state.logImageUri != null

    Scaffold(topBar = { LrtsTopBar("LRTS Certificate & Sticker Maker") }) { padding ->
        LazyColumn(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                Text(
                    "Last Responder Transport Services LLC",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    "One reviewed case record. Two print-ready documents.",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(top = 4.dp, bottom = 8.dp)
                )
            }

            if (jobInProgress) {
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                        Column(Modifier.padding(16.dp)) {
                            Text("A case is already in progress", fontWeight = FontWeight.SemiBold)
                            Text(
                                state.decedentName.ifBlank { "Unnamed case" },
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            TextButton(onClick = { jobViewModel.clearJob() }, modifier = Modifier.padding(top = 8.dp)) {
                                Text("Clear Current Job")
                            }
                        }
                    }
                }
            }

            item { Text("Choose how to enter the case", style = MaterialTheme.typography.titleLarge) }

            items(OPTIONS) { option ->
                Card(
                    onClick = { onStartIntake(option.mode) },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(Modifier.padding(16.dp)) {
                        Text(option.title, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.titleMedium)
                        Text(option.subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }

            item {
                Column(Modifier.fillMaxWidth().padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(onClick = onOpenProfiles, modifier = Modifier.fillMaxWidth()) {
                        Text("Manage Funeral Homes")
                    }
                    Button(onClick = onOpenSettings, modifier = Modifier.fillMaxWidth()) {
                        Text("Settings / About / Mock-Test Status")
                    }
                }
            }
        }
    }
}
