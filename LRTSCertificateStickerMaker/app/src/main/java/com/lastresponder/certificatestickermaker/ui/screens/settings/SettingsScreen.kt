package com.lastresponder.certificatestickermaker.ui.screens.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.lastresponder.certificatestickermaker.BuildConfig
import com.lastresponder.certificatestickermaker.ui.components.Banner
import com.lastresponder.certificatestickermaker.ui.components.LrtsTopBar
import com.lastresponder.certificatestickermaker.ui.components.SectionCard
import com.lastresponder.certificatestickermaker.ui.theme.LrtsAmber
import com.lastresponder.certificatestickermaker.ui.theme.LrtsAmberPale

/** Screen 14: settings / about / mock-test status. */
@Composable
fun SettingsScreen(onBack: () -> Unit) {
    Scaffold(topBar = { LrtsTopBar("Settings / About", onBack) }) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Banner(
                "MOCK-TEST BUILD — This app is for training and workflow verification. " +
                    "Automated tests use fictional names and dates only.",
                LrtsAmberPale, LrtsAmber
            )

            SectionCard {
                Text("App", fontWeight = FontWeight.SemiBold)
                Text("LRTS Certificate & Sticker Maker — Mock Test")
                Text("Version ${BuildConfig.VERSION_NAME} (build ${BuildConfig.VERSION_CODE})")
                Text("Package: ${BuildConfig.APPLICATION_ID}")
            }

            SectionCard {
                Text("Privacy and security", fontWeight = FontWeight.SemiBold)
                Text("• Decedent information and source-document photos never leave this device.")
                Text("• No analytics or crash-reporting SDK is included.")
                Text("• No documents are uploaded to any cloud service.")
                Text("• OCR runs fully offline using a bundled ML Kit model.")
                Text("• No production credentials are required.")
            }

            SectionCard {
                Text("Permissions used", fontWeight = FontWeight.SemiBold)
                Text("• Camera - to photograph the BTP and cremation log. Not requested until you choose \"Take photo.\"")
                Text("• No Internet permission is requested.")
                Text("• No broad storage permission is requested - photos and PDFs use app-scoped storage and the system photo picker.")
            }

            SectionCard {
                Text("Data & storage", fontWeight = FontWeight.SemiBold)
                Text("• Funeral-home profiles are stored locally in a Room database and persist after the app closes.")
                Text("• \"Clear Current Job\" deletes temporary photos and working PDFs for the case in progress only - it never touches saved profiles.")
            }

            Text(
                "© Last Responder Transport Services LLC — internal mock-test tool.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}
