package com.lastresponder.certificatestickermaker.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import androidx.navigation.NavType
import com.lastresponder.certificatestickermaker.ui.screens.capture.BtpCaptureScreen
import com.lastresponder.certificatestickermaker.ui.screens.capture.LogCaptureScreen
import com.lastresponder.certificatestickermaker.ui.screens.certificate.CertificatePreviewScreen
import com.lastresponder.certificatestickermaker.ui.screens.funeralhome.FuneralHomeSelectScreen
import com.lastresponder.certificatestickermaker.ui.screens.home.HomeScreen
import com.lastresponder.certificatestickermaker.ui.screens.labels.LabelPreviewScreen
import com.lastresponder.certificatestickermaker.ui.screens.labels.LabelQuantityScreen
import com.lastresponder.certificatestickermaker.ui.screens.manual.ManualEntryScreen
import com.lastresponder.certificatestickermaker.ui.screens.profiles.ProfileEditScreen
import com.lastresponder.certificatestickermaker.ui.screens.profiles.ProfileManagerScreen
import com.lastresponder.certificatestickermaker.ui.screens.results.ResultsScreen
import com.lastresponder.certificatestickermaker.ui.screens.review.OcrReviewScreen
import com.lastresponder.certificatestickermaker.ui.screens.settings.SettingsScreen
import com.lastresponder.certificatestickermaker.ui.screens.verification.VerificationScreen
import com.lastresponder.certificatestickermaker.viewmodel.JobViewModel
import com.lastresponder.certificatestickermaker.viewmodel.ProfileViewModel

@Composable
fun LrtsNavHost(
    navController: NavHostController,
    jobViewModel: JobViewModel,
    profileViewModel: ProfileViewModel
) {
    NavHost(navController = navController, startDestination = Routes.HOME) {
        composable(Routes.HOME) {
            HomeScreen(
                jobViewModel = jobViewModel,
                onStartIntake = { mode ->
                    jobViewModel.setIntakeMode(mode)
                    navController.navigate(if (mode == com.lastresponder.certificatestickermaker.data.model.IntakeMode.MANUAL) Routes.MANUAL_ENTRY else Routes.CAPTURE_BTP)
                },
                onOpenProfiles = { navController.navigate(Routes.PROFILE_MANAGER) },
                onOpenSettings = { navController.navigate(Routes.SETTINGS) }
            )
        }
        composable(Routes.CAPTURE_BTP) {
            BtpCaptureScreen(
                jobViewModel = jobViewModel,
                onBack = { navController.popBackStack() },
                onNext = { navController.navigate(Routes.CAPTURE_LOG) },
                onSkipToLog = { navController.navigate(Routes.CAPTURE_LOG) }
            )
        }
        composable(Routes.CAPTURE_LOG) {
            LogCaptureScreen(
                jobViewModel = jobViewModel,
                onBack = { navController.popBackStack() },
                onNext = { navController.navigate(Routes.OCR_REVIEW) }
            )
        }
        composable(Routes.MANUAL_ENTRY) {
            ManualEntryScreen(
                jobViewModel = jobViewModel,
                onBack = { navController.popBackStack() },
                onNext = { navController.navigate(Routes.VERIFICATION) }
            )
        }
        composable(Routes.OCR_REVIEW) {
            OcrReviewScreen(
                jobViewModel = jobViewModel,
                onBack = { navController.popBackStack() },
                onNext = { navController.navigate(Routes.VERIFICATION) }
            )
        }
        composable(Routes.VERIFICATION) {
            VerificationScreen(
                jobViewModel = jobViewModel,
                onBack = { navController.popBackStack() },
                onContinueToCertificate = { navController.navigate(Routes.CERTIFICATE_PREVIEW) },
                onContinueToLabels = { navController.navigate(Routes.FUNERAL_HOME_SELECT) }
            )
        }
        composable(Routes.CERTIFICATE_PREVIEW) {
            CertificatePreviewScreen(
                jobViewModel = jobViewModel,
                onBack = { navController.popBackStack() },
                onDone = { navController.navigate(Routes.RESULTS) },
                onMakeLabelsToo = { navController.navigate(Routes.FUNERAL_HOME_SELECT) }
            )
        }
        composable(Routes.FUNERAL_HOME_SELECT) {
            FuneralHomeSelectScreen(
                jobViewModel = jobViewModel,
                profileViewModel = profileViewModel,
                onBack = { navController.popBackStack() },
                onNext = { navController.navigate(Routes.LABEL_QUANTITY) },
                onManageProfiles = { navController.navigate(Routes.PROFILE_MANAGER) }
            )
        }
        composable(Routes.LABEL_QUANTITY) {
            LabelQuantityScreen(
                jobViewModel = jobViewModel,
                onBack = { navController.popBackStack() },
                onNext = { navController.navigate(Routes.LABEL_PREVIEW) }
            )
        }
        composable(Routes.LABEL_PREVIEW) {
            LabelPreviewScreen(
                jobViewModel = jobViewModel,
                onBack = { navController.popBackStack() },
                onDone = { navController.navigate(Routes.RESULTS) }
            )
        }
        composable(Routes.RESULTS) {
            ResultsScreen(
                jobViewModel = jobViewModel,
                onNewCase = {
                    jobViewModel.clearJob()
                    navController.navigate(Routes.HOME) {
                        popUpTo(Routes.HOME) { inclusive = true }
                    }
                },
                onBackHome = { navController.navigate(Routes.HOME) { popUpTo(Routes.HOME) { inclusive = true } } }
            )
        }
        composable(Routes.PROFILE_MANAGER) {
            ProfileManagerScreen(
                profileViewModel = profileViewModel,
                onBack = { navController.popBackStack() },
                onAddProfile = { navController.navigate(Routes.PROFILE_ADD) },
                onEditProfile = { id -> navController.navigate(Routes.profileEdit(id)) }
            )
        }
        composable(Routes.PROFILE_ADD) {
            ProfileEditScreen(
                profileViewModel = profileViewModel,
                profileId = null,
                onBack = { navController.popBackStack() },
                onSaved = { navController.popBackStack() }
            )
        }
        composable(
            Routes.PROFILE_EDIT_PATTERN,
            arguments = listOf(navArgument("profileId") { type = NavType.StringType })
        ) { backStackEntry ->
            ProfileEditScreen(
                profileViewModel = profileViewModel,
                profileId = backStackEntry.arguments?.getString("profileId"),
                onBack = { navController.popBackStack() },
                onSaved = { navController.popBackStack() }
            )
        }
        composable(Routes.SETTINGS) {
            SettingsScreen(onBack = { navController.popBackStack() })
        }
    }
}
