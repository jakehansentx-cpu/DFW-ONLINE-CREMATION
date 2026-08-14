package com.lastresponder.certificatestickermaker.ui.screens.profiles

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Card
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.lastresponder.certificatestickermaker.data.db.FuneralHomeProfileEntity
import com.lastresponder.certificatestickermaker.ui.components.LrtsTopBar
import com.lastresponder.certificatestickermaker.viewmodel.ProfileViewModel

/** Screen 12: funeral-home profile manager (add/edit/duplicate/activate/delete, all local to Room). */
@Composable
fun ProfileManagerScreen(
    profileViewModel: ProfileViewModel,
    onBack: () -> Unit,
    onAddProfile: () -> Unit,
    onEditProfile: (String) -> Unit
) {
    val profiles by profileViewModel.profiles.collectAsState()

    Scaffold(
        topBar = { LrtsTopBar("Funeral-Home Profiles", onBack) },
        floatingActionButton = {
            FloatingActionButton(onClick = onAddProfile) { Icon(Icons.Filled.Add, contentDescription = "Add funeral home") }
        }
    ) { padding ->
        LazyColumn(
            Modifier.padding(padding).fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            item {
                Text(
                    "Profiles are saved on this device and remain available after the app closes. " +
                        "Clearing a job never deletes them.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            items(profiles, key = { it.id }) { profile ->
                ProfileRow(profile, profileViewModel, onEditProfile)
            }
        }
    }
}

@Composable
private fun ProfileRow(profile: FuneralHomeProfileEntity, profileViewModel: ProfileViewModel, onEdit: (String) -> Unit) {
    var confirmingDelete by remember { mutableStateOf(false) }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(profile.funeralHome, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                Switch(
                    checked = profile.active,
                    onCheckedChange = { profileViewModel.setActive(profile.id, it) }
                )
            }
            Text(
                (profile.cityState.ifBlank { "No city/state on file" }) + " • ${profile.labelType} • Default ${profile.defaultQuantity}",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (profile.sourceStatus == "needs-correct-avery-link") {
                Text("SOURCE LINK NEEDS CORRECTION", color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.SemiBold)
            } else if (profile.sourceStatus == "identified-from-logo") {
                Text("Identified from supplied logo", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (profile.disclosure.isBlank()) {
                Text("No standard disclosure on this label.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { onEdit(profile.id) }) { Text("Edit") }
                if (!confirmingDelete) {
                    TextButton(
                        onClick = { confirmingDelete = true },
                        enabled = !profile.protectedFromDelete
                    ) { Text(if (profile.protectedFromDelete) "Built-in" else "Delete") }
                } else {
                    TextButton(onClick = {
                        profileViewModel.deleteProfile(profile.id) {}
                        confirmingDelete = false
                    }) { Text("Confirm delete", color = MaterialTheme.colorScheme.error) }
                    TextButton(onClick = { confirmingDelete = false }) { Text("Cancel") }
                }
            }
        }
    }
}
