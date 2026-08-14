package com.lastresponder.certificatestickermaker

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.rememberNavController
import com.lastresponder.certificatestickermaker.ui.navigation.LrtsNavHost
import com.lastresponder.certificatestickermaker.ui.theme.LrtsTheme
import com.lastresponder.certificatestickermaker.viewmodel.JobViewModel
import com.lastresponder.certificatestickermaker.viewmodel.ProfileViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            LrtsApp()
        }
    }
}

@Composable
private fun LrtsApp() {
    LrtsTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            // Shared for the whole flow: one Activity-scoped JobViewModel/ProfileViewModel
            // instance, so state survives navigating between the 14 screens.
            val jobViewModel: JobViewModel = viewModel()
            val profileViewModel: ProfileViewModel = viewModel()
            val navController = rememberNavController()
            LrtsNavHost(
                navController = navController,
                jobViewModel = jobViewModel,
                profileViewModel = profileViewModel
            )
        }
    }
}
