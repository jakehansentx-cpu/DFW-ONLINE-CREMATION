package com.lastresponder.certificatestickermaker.ui.screens.capture

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import coil.compose.AsyncImage
import com.lastresponder.certificatestickermaker.ui.camera.CameraCaptureView
import com.lastresponder.certificatestickermaker.ui.components.LrtsTopBar
import com.lastresponder.certificatestickermaker.ui.components.SectionCard
import com.lastresponder.certificatestickermaker.ui.components.StepHeading
import com.lastresponder.certificatestickermaker.util.JobFileManager
import com.lastresponder.certificatestickermaker.viewmodel.JobViewModel

@Composable
fun LogCaptureScreen(
    jobViewModel: JobViewModel,
    onBack: () -> Unit,
    onNext: () -> Unit
) {
    val context = LocalContext.current
    val state by jobViewModel.state.collectAsState()
    val fileManager = remember { JobFileManager(context) }
    var showCamera by remember { mutableStateOf(false) }
    var hasCameraPermission by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        hasCameraPermission = granted
        if (granted) showCamera = true
    }
    val pickerLauncher = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) jobViewModel.setLogImage(uri)
    }

    Scaffold(topBar = { LrtsTopBar("Cremation Log", onBack) }) { padding ->
        Column(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            StepHeading(3, "Photograph or upload the cremation log", "Source for the cremation date, I.D. disc number, and other log details.")

            SectionCard {
                if (showCamera) {
                    CameraCaptureView(
                        fileManager = fileManager,
                        filePrefix = "log",
                        onCaptured = { uri ->
                            jobViewModel.setLogImage(uri)
                            showCamera = false
                        }
                    )
                } else if (state.logImageUri != null) {
                    AsyncImage(
                        model = state.logImageUri,
                        contentDescription = "Cremation log preview",
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxWidth().aspectRatio(3f / 4f)
                    )
                } else {
                    Text("No cremation-log photo selected yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }

                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = { if (hasCameraPermission) showCamera = true else permissionLauncher.launch(Manifest.permission.CAMERA) },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Take or retake log photo") }
                    OutlinedButton(
                        onClick = { pickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Choose from gallery") }
                }

                if (state.logImageUri != null) {
                    Button(
                        onClick = { jobViewModel.runLogOcr() },
                        enabled = !state.logOcrRunning,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        if (state.logOcrRunning) CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp))
                        Text(if (state.logOcrRunning) "Reading the photo..." else "Extract log information")
                    }
                }
            }

            if (state.logRowCandidates.size > 1) {
                SectionCard {
                    Text("Multiple log rows were detected", style = MaterialTheme.typography.titleMedium)
                    Text(
                        "Select the row that matches this case. Nothing is assumed automatically.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    state.logRowCandidates.forEachIndexed { index, row ->
                        val selected = state.selectedLogRowIndex == index
                        Card(
                            onClick = { jobViewModel.selectLogRow(index) },
                            colors = CardDefaults.cardColors(
                                containerColor = if (selected) MaterialTheme.colorScheme.secondaryContainer else MaterialTheme.colorScheme.surfaceVariant
                            ),
                            border = if (selected) BorderStroke(2.dp, MaterialTheme.colorScheme.secondary) else null,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(Modifier.padding(12.dp)) {
                                Row(index, selected)
                                Text("Name: ${row.name.ifBlank { "(not detected)" }}")
                                Text("Date: ${row.cremationDate.ifBlank { "(not detected)" }}")
                                Text("Disc/disk: ${row.discId.ifBlank { "(not detected)" }}")
                                Text(
                                    "Raw: ${row.rawLine}",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            } else if (state.logOcrResult != null) {
                Text(
                    "Extraction complete (rotation used: ${state.logOcrResult?.rotationDegrees}°). Review every field on the next screen.",
                    color = MaterialTheme.colorScheme.secondary
                )
            }

            Button(onClick = onNext, modifier = Modifier.fillMaxWidth()) { Text("Continue to review") }
        }
    }
}

@Composable
private fun Row(index: Int, selected: Boolean) {
    androidx.compose.foundation.layout.Row(verticalAlignment = Alignment.CenterVertically) {
        RadioButton(selected = selected, onClick = null)
        Text("Row ${index + 1}", style = MaterialTheme.typography.titleMedium)
    }
}
