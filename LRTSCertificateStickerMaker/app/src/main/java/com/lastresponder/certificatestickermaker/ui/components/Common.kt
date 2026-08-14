package com.lastresponder.certificatestickermaker.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.lastresponder.certificatestickermaker.domain.NameMatcher
import com.lastresponder.certificatestickermaker.ui.theme.LrtsAmber
import com.lastresponder.certificatestickermaker.ui.theme.LrtsAmberPale
import com.lastresponder.certificatestickermaker.ui.theme.LrtsGreen
import com.lastresponder.certificatestickermaker.ui.theme.LrtsGreenPale
import com.lastresponder.certificatestickermaker.ui.theme.LrtsRed
import com.lastresponder.certificatestickermaker.ui.theme.LrtsRedPale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LrtsTopBar(title: String, onBack: (() -> Unit)? = null) {
    CenterAlignedTopAppBar(
        title = { Text(title, fontWeight = FontWeight.SemiBold) },
        navigationIcon = {
            if (onBack != null) {
                IconButton(onClick = onBack) {
                    Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                }
            }
        },
        colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
            containerColor = MaterialTheme.colorScheme.primary,
            titleContentColor = MaterialTheme.colorScheme.onPrimary,
            navigationIconContentColor = MaterialTheme.colorScheme.onPrimary
        )
    )
}

@Composable
fun StepHeading(step: Int, title: String, subtitle: String) {
    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary),
            contentAlignment = Alignment.Center
        ) {
            Text("$step", color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        }
        Column {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
fun SectionCard(modifier: Modifier = Modifier, content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
    }
}

@Composable
fun MatchBanner(result: NameMatcher.MatchResult) {
    val (bg, fg, message) = when (result.level) {
        NameMatcher.MatchLevel.NEUTRAL -> Triple(
            MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.colorScheme.onSurfaceVariant,
            "Enter or extract both names to run the identity match check."
        )
        NameMatcher.MatchLevel.GOOD -> Triple(
            LrtsGreenPale, LrtsGreen,
            "Identity check passed (${result.score}% match). Confirm the spelling before printing."
        )
        NameMatcher.MatchLevel.WARN -> Triple(
            LrtsAmberPale, LrtsAmber,
            "Review required: the BTP and log names are only a ${result.score}% match."
        )
        NameMatcher.MatchLevel.BAD -> Triple(
            LrtsRedPale, LrtsRed,
            "STOP: possible identity mismatch (${result.score}% match). Do not print until staff resolves it."
        )
    }
    Card(colors = CardDefaults.cardColors(containerColor = bg), shape = RoundedCornerShape(12.dp)) {
        Text(message, color = fg, modifier = Modifier.padding(12.dp), fontWeight = FontWeight.Medium)
    }
}

@Composable
fun Banner(message: String, background: Color, foreground: Color) {
    Card(colors = CardDefaults.cardColors(containerColor = background), shape = RoundedCornerShape(12.dp)) {
        Text(message, color = foreground, modifier = Modifier.padding(12.dp), fontWeight = FontWeight.Medium)
    }
}
