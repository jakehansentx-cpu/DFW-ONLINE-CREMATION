package com.lastresponder.certificatestickermaker.ui.screens.capture

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
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
import androidx.compose.runtime.setValue
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
fun BtpCaptureScreen(
    jobViewModel: JobViewModel,
    onBack: () -> Unit,
    onNext: () -> Unit,
    onSkipToLog: () -> Unit
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
        if (uri != null) jobViewModel.setBtpImage(uri)
    }

    Scaffold(topBar = { LrtsTopBar("Burial-Transit Permit", onBack) }) { padding ->
        Column(
            Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            StepHeading(2, "Photograph or upload the BTP", "Primary source for the decedent's legal name.")

            SectionCard {
                if (showCamera) {
                    CameraCaptureView(
                        fileManager = fileManager,
                        filePrefix = "btp",
                        onCaptured = { uri ->
                            jobViewModel.setBtpImage(uri)
                            showCamera = false
                        }
                    )
                } else if (state.btpImageUri != null) {
                    AsyncImage(
                        model = state.btpImageUri,
                        contentDescription = "BTP preview",
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxWidth().aspectRatio(3f / 4f)
                    )
                } else {
                    Text("No BTP photo selected yet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }

                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = {
                            if (hasCameraPermission) showCamera = true else permissionLauncher.launch(Manifest.permission.CAMERA)
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Take or retake BTP photo") }
                    OutlinedButton(
                        onClick = { pickerLauncher.launch(androidx.activity.result.PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Choose from gallery") }
                }

                if (state.btpImageUri != null) {
                    Button(
                        onClick = { jobViewModel.runBtpOcr() },
                        enabled = !state.btpOcrRunning,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        if (state.btpOcrRunning) CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp))
                        Text(if (state.btpOcrRunning) "Reading the photo..." else "Extract BTP name")
                    }
                    if (state.btpOcrResult != null) {
                        Text(
                            "Extraction complete (rotation used: ${state.btpOcrResult?.rotationDegrees}°). " +
                                "Extracted name: \"${state.btpName.ifBlank { "not found - enter manually" }}\". " +
                                "This is a draft; review it on the next screen.",
                            color = MaterialTheme.colorScheme.secondary
                        )
                    }
                }
            }

            Button(onClick = onNext, modifier = Modifier.fillMaxWidth()) { Text("Continue to cremation log") }
            OutlinedButton(onClick = onSkipToLog, modifier = Modifier.fillMaxWidth()) { Text("Skip BTP for now") }
        }
    }
}
