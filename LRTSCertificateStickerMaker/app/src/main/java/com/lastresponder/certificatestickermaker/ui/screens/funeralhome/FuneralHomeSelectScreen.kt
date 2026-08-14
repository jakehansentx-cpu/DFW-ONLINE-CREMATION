package com.lastresponder.certificatestickermaker.ui.screens.funeralhome

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.lastresponder.certificatestickermaker.ui.components.LrtsTopBar
import com.lastresponder.certificatestickermaker.ui.components.StepHeading
import com.lastresponder.certificatestickermaker.viewmodel.JobViewModel
import com.lastresponder.certificatestickermaker.viewmodel.ProfileViewModel

/** Screen 8: funeral-home selection for the sticker sheet. */
@Composable
fun FuneralHomeSelectScreen(
    jobViewModel: JobViewModel,
    profileViewModel: ProfileViewModel,
    onBack: () -> Unit,
    onNext: () -> Unit,
    onManageProfiles: () -> Unit
) {
    val jobState by jobViewModel.state.collectAsState()
    val profiles by profileViewModel.activeProfiles.collectAsState()

    Scaffold(topBar = { LrtsTopBar("Select Funeral Home", onBack) }) { padding ->
        Column(Modifier.padding(padding).fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            StepHeading(8, "Choose the funeral-home profile", "Determines the sticker's logo, wording, disclosure, and default quantity.")
            OutlinedButton(onClick = onManageProfiles, modifier = Modifier.fillMaxWidth()) { Text("Manage Funeral Homes") }

            LazyColumn(Modifier.weight(1f, fill = false), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(profiles, key = { it.id }) { profile ->
                    val selected = jobState.selectedProfileId == profile.id
                    Card(
                        onClick = { jobViewModel.applyProfileDefaults(profile.id) },
                        colors = CardDefaults.cardColors(
                            containerColor = if (selected) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surface
                        ),
                        border = if (selected) BorderStroke(2.dp, MaterialTheme.colorScheme.secondary) else null,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(Modifier.padding(14.dp)) {
                            Text(profile.funeralHome, fontWeight = FontWeight.SemiBold)
                            Text(
                                (profile.cityState.ifBlank { "No city/state on file" }) + " • Default ${profile.defaultQuantity}",
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            if (profile.sourceStatus == "needs-correct-avery-link") {
                                Text(
                                    "Design reference needs correction - see profile manager.",
                                    color = MaterialTheme.colorScheme.error
                                )
                            }
                        }
                    }
                }
            }

            Button(
                onClick = onNext,
                enabled = jobState.selectedProfileId.isNotBlank(),
                modifier = Modifier.fillMaxWidth()
            ) { Text("Continue to label quantity") }
        }
    }
}
