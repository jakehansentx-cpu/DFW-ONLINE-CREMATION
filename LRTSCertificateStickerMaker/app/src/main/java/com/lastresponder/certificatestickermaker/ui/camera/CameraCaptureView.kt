package com.lastresponder.certificatestickermaker.ui.camera

import android.net.Uri
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Camera
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.lastresponder.certificatestickermaker.util.JobFileManager
import java.io.File
import java.util.concurrent.Executor

/**
 * In-app CameraX capture surface: live preview plus a shutter button that
 * writes a JPEG into the job's temp cache and hands back its [Uri].
 */
@Composable
fun CameraCaptureView(
    fileManager: JobFileManager,
    filePrefix: String,
    onCaptured: (Uri) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val mainExecutor: Executor = remember { ContextCompat.getMainExecutor(context) }
    var imageCapture by remember { mutableStateOf<ImageCapture?>(null) }
    var isCapturing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    BoxWithConstraints(modifier.fillMaxWidth()) {
        Box(Modifier.fillMaxWidth().aspectRatio(3f / 4f)) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx ->
                    val previewView = PreviewView(ctx)
                    val providerFuture = ProcessCameraProvider.getInstance(ctx)
                    providerFuture.addListener({
                        val provider = providerFuture.get()
                        val preview = Preview.Builder().build().also {
                            it.setSurfaceProvider(previewView.surfaceProvider)
                        }
                        val capture = ImageCapture.Builder().build()
                        try {
                            provider.unbindAll()
                            provider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, capture)
                            imageCapture = capture
                        } catch (exc: Exception) {
                            error = "Camera could not start: ${exc.message}"
                        }
                    }, mainExecutor)
                    previewView
                }
            )
        }
        DisposableEffect(Unit) {
            onDispose {
                runCatching { ProcessCameraProvider.getInstance(context).get().unbindAll() }
            }
        }
    }

    Box(Modifier.fillMaxWidth().padding(top = 12.dp), contentAlignment = Alignment.Center) {
        if (isCapturing) {
            CircularProgressIndicator()
        } else {
            Button(onClick = {
                val capture = imageCapture ?: return@Button
                isCapturing = true
                val target: File = fileManager.newCapturedPhotoFile(filePrefix)
                val outputOptions = ImageCapture.OutputFileOptions.Builder(target).build()
                capture.takePicture(
                    outputOptions,
                    mainExecutor,
                    object : ImageCapture.OnImageSavedCallback {
                        override fun onImageSaved(outputResults: ImageCapture.OutputFileResults) {
                            isCapturing = false
                            onCaptured(fileManager.uriForFile(target))
                        }

                        override fun onError(exception: ImageCaptureException) {
                            isCapturing = false
                            error = "Photo could not be saved: ${exception.message}"
                        }
                    }
                )
            }) {
                Icon(Icons.Filled.Camera, contentDescription = null)
                Text("  Capture photo")
            }
        }
    }
    error?.let { message ->
        Text(message, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp))
    }
}
