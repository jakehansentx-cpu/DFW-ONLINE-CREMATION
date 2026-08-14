package com.lastresponder.certificatestickermaker.ui.screens.profiles

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.lastresponder.certificatestickermaker.data.ImageSource
import com.lastresponder.certificatestickermaker.pdf.LabelPrintData
import com.lastresponder.certificatestickermaker.pdf.LabelSheetGenerator
import com.lastresponder.certificatestickermaker.pdf.PdfFonts
import com.lastresponder.certificatestickermaker.pdf.PdfPreviewRenderer
import com.lastresponder.certificatestickermaker.ui.components.LrtsTopBar
import com.lastresponder.certificatestickermaker.ui.components.SectionCard
import com.lastresponder.certificatestickermaker.viewmodel.ProfileViewModel
import java.io.File

/** Screen 13: add/edit a funeral-home profile, with duplicate and test-label preview. */
@Composable
fun ProfileEditScreen(
    profileViewModel: ProfileViewModel,
    profileId: String?,
    onBack: () -> Unit,
    onSaved: () -> Unit
) {
    val context = LocalContext.current
    val isEditing = profileId != null

    var funeralHome by remember { mutableStateOf("") }
    var cityState by remember { mutableStateOf("") }
    var defaultQuantity by remember { mutableStateOf("1") }
    var preface by remember { mutableStateOf("The Cremated Remains of") }
    var disclosure by remember { mutableStateOf("") }
    var active by remember { mutableStateOf(true) }
    var existingLogoPath by remember { mutableStateOf("") }
    var newLogoUri by remember { mutableStateOf<android.net.Uri?>(null) }
    var newDesignUri by remember { mutableStateOf<android.net.Uri?>(null) }
    var newDesignFileName by remember { mutableStateOf<String?>(null) }
    var statusMessage by remember { mutableStateOf<String?>(null) }
    var testLabelFile by remember { mutableStateOf<File?>(null) }

    LaunchedEffect(profileId) {
        if (profileId != null) {
            profileViewModel.findById(profileId)?.let { profile ->
                funeralHome = profile.funeralHome
                cityState = profile.cityState
                defaultQuantity = profile.defaultQuantity.toString()
                preface = profile.preface
                disclosure = profile.disclosure
                active = profile.active
                existingLogoPath = profile.logoPath
            }
        }
    }

    val logoPickerLauncher = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) newLogoUri = uri
    }
    val designPickerLauncher = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            newDesignUri = uri
            newDesignFileName = queryDisplayName(context, uri)
        }
    }

    Scaffold(topBar = { LrtsTopBar(if (isEditing) "Edit Funeral Home" else "Add Funeral Home", onBack) }) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            SectionCard {
                OutlinedTextField(funeralHome, { funeralHome = it }, label = { Text("Funeral-home name") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(cityState, { cityState = it }, label = { Text("City, State") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(
                    defaultQuantity,
                    { defaultQuantity = it.filter(Char::isDigit) },
                    label = { Text("Default number of stickers") },
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(preface, { preface = it }, label = { Text("Text above decedent name") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(
                    disclosure,
                    { disclosure = it },
                    label = { Text("Disclosure text (leave blank for none)") },
                    modifier = Modifier.fillMaxWidth().height(120.dp)
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = active, onCheckedChange = { active = it })
                    Text("Active (offered when selecting a funeral home for labels)")
                }
            }

            SectionCard {
                Text("Logo")
                val previewBitmap = remember(newLogoUri, existingLogoPath) {
                    newLogoUri?.let { null } ?: ImageSource.loadBitmap(context, existingLogoPath)
                }
                previewBitmap?.let {
                    Image(it.asImageBitmap(), contentDescription = "Current logo", modifier = Modifier.height(80.dp))
                }
                newLogoUri?.let { Text("New logo selected - will replace the current one on save.") }
                OutlinedButton(
                    onClick = { logoPickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Upload logo image") }
            }

            SectionCard {
                Text("Original sticker-design reference (PDF or image)")
                newDesignFileName?.let { Text("New file selected: $it") }
                OutlinedButton(
                    onClick = { designPickerLauncher.launch("*/*") },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Upload reference PDF/image") }
            }

            if (isEditing) {
                SectionCard {
                    Text("Preview a test label")
                    OutlinedButton(
                        onClick = {
                            val fonts = PdfFonts.get(context)
                            val logoBitmap = newLogoUri?.let { null } ?: ImageSource.loadBitmap(context, existingLogoPath)
                            val document = LabelSheetGenerator.generate(
                                LabelPrintData(
                                    labelProfileName = funeralHome,
                                    funeralHome = funeralHome,
                                    funeralHomeCityState = cityState,
                                    decedentName = "Test Decedent",
                                    preface = preface,
                                    disclosure = disclosure,
                                    logoBitmap = logoBitmap
                                ),
                                1,
                                listOf(1),
                                fonts
                            )
                            val file = File(context.cacheDir, "profile_test_label.pdf")
                            java.io.FileOutputStream(file).use { document.writeTo(it) }
                            document.close()
                            testLabelFile = file
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Generate test label preview") }
                    testLabelFile?.let { file ->
                        val bitmap = remember(file) { PdfPreviewRenderer.renderPage(file, 0, 700) }
                        bitmap?.let { Image(it.asImageBitmap(), contentDescription = "Test label preview", modifier = Modifier.fillMaxWidth()) }
                    }
                }

                SectionCard {
                    Text("Duplicate this profile")
                    Text(
                        "Use when only the logo or the location changes for another location of the same funeral home.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    OutlinedButton(
                        onClick = {
                            profileViewModel.duplicateProfile(profileId!!, "$funeralHome (Copy)", cityState) { result ->
                                statusMessage = result.fold(
                                    { "Duplicated as \"${it.funeralHome}\"." },
                                    { error -> error.message }
                                )
                            }
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Duplicate profile") }
                }
            }

            statusMessage?.let { Text(it, color = MaterialTheme.colorScheme.secondary) }

            Button(
                onClick = {
                    val quantity = defaultQuantity.toIntOrNull() ?: 1
                    if (isEditing) {
                        profileViewModel.updateProfileFields(
                            profileId!!, funeralHome, cityState, quantity, preface, disclosure, active,
                            newLogoUri, newDesignUri, newDesignFileName
                        ) { result ->
                            result.fold({ onSaved() }, { error -> statusMessage = error.message })
                        }
                    } else {
                        profileViewModel.createProfile(
                            funeralHome, cityState, quantity, preface, disclosure,
                            newLogoUri, newDesignUri, newDesignFileName
                        ) { result ->
                            result.fold({ onSaved() }, { error -> statusMessage = error.message })
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth()
            ) { Text("Save Funeral-Home Profile") }
        }
    }
}

private fun queryDisplayName(context: android.content.Context, uri: android.net.Uri): String? {
    return try {
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val nameIndex = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
            if (cursor.moveToFirst() && nameIndex >= 0) cursor.getString(nameIndex) else null
        }
    } catch (error: Exception) {
        null
    }
}
