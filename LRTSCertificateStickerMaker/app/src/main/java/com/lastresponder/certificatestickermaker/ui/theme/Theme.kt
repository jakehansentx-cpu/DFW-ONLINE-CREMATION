package com.lastresponder.certificatestickermaker.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val LrtsLightColors = lightColorScheme(
    primary = LrtsBlue,
    onPrimary = LrtsWhite,
    primaryContainer = LrtsBluePale,
    onPrimaryContainer = LrtsNavy,
    secondary = LrtsGreen,
    onSecondary = LrtsWhite,
    secondaryContainer = LrtsGreenPale,
    onSecondaryContainer = LrtsGreenDeep,
    tertiary = LrtsAmber,
    background = LrtsWhite,
    onBackground = LrtsInk,
    surface = LrtsWhite,
    onSurface = LrtsInk,
    surfaceVariant = LrtsBluePale,
    onSurfaceVariant = LrtsMuted,
    error = LrtsRed,
    errorContainer = LrtsRedPale
)

private val LrtsDarkColors = darkColorScheme(
    primary = LrtsBlueLight,
    onPrimary = LrtsNavyDeep,
    primaryContainer = LrtsNavyPanel,
    onPrimaryContainer = LrtsBluePale,
    secondary = LrtsGreen,
    onSecondary = LrtsNavyDeep,
    secondaryContainer = LrtsGreenDeep,
    onSecondaryContainer = LrtsGreenPale,
    tertiary = LrtsAmber,
    background = LrtsNavyDeep,
    onBackground = LrtsWhite,
    surface = LrtsNavyPanel,
    onSurface = LrtsWhite,
    surfaceVariant = LrtsNavyPanel,
    onSurfaceVariant = LrtsMuted,
    error = LrtsRed,
    errorContainer = LrtsRedPale
)

@Composable
fun LrtsTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) LrtsDarkColors else LrtsLightColors
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = LrtsNavy.toArgb()
            window.navigationBarColor = LrtsNavy.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
        }
    }
    MaterialTheme(
        colorScheme = colorScheme,
        typography = LrtsTypography,
        content = content
    )
}
