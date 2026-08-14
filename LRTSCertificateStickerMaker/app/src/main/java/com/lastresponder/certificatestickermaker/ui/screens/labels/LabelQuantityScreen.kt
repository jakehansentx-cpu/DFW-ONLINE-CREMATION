package com.lastresponder.certificatestickermaker.ui.screens.labels

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.lastresponder.certificatestickermaker.pdf.LabelPagination
import com.lastresponder.certificatestickermaker.ui.components.LrtsTopBar
import com.lastresponder.certificatestickermaker.ui.components.SectionCard
import com.lastresponder.certificatestickermaker.ui.components.StepHeading
import com.lastresponder.certificatestickermaker.viewmodel.JobViewModel

/** Screen 9: label quantity and sheet-position selection. Positions 1-6, upper-left through lower-right. */
@Composable
fun LabelQuantityScreen(
    jobViewModel: JobViewModel,
    onBack: () -> Unit,
    onNext: () -> Unit
) {
    val state by jobViewModel.state.collectAsState()

    Scaffold(topBar = { LrtsTopBar("Label Quantity & Positions", onBack) }) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            StepHeading(9, "How many stickers, and where", "Select every position that is empty on the first Avery 8464 sheet.")

            SectionCard {
                OutlinedTextField(
                    value = state.labelQuantity.toString(),
                    onValueChange = { value ->
                        val quantity = value.toIntOrNull() ?: state.labelQuantity
                        jobViewModel.updateField { it.copy(labelQuantity = LabelPagination.clampQuantity(quantity)) }
                    },
                    label = { Text("Number of stickers") },
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth()
                )

                Text("Available positions on the first sheet", fontWeight = FontWeight.SemiBold)
                Text("Position 1 is upper-left; position 6 is lower-right.", color = MaterialTheme.colorScheme.onSurfaceVariant)

                PositionGrid(
                    selected = state.labelPositions,
                    onToggle = { position ->
                        jobViewModel.updateField {
                            val updated = if (position in it.labelPositions) it.labelPositions - position else it.labelPositions + position
                            it.copy(labelPositions = updated)
                        }
                    }
                )

                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedButton(onClick = { jobViewModel.updateField { it.copy(labelPositions = setOf(1, 2, 3, 4, 5, 6)) } }) {
                        Text("All 6 unused")
                    }
                    OutlinedButton(onClick = { jobViewModel.updateField { it.copy(labelPositions = emptySet()) } }) {
                        Text("Clear positions")
                    }
                }
            }

            Button(
                onClick = onNext,
                enabled = state.labelPositions.isNotEmpty() && state.labelQuantity > 0,
                modifier = Modifier.fillMaxWidth()
            ) { Text("Continue to label preview") }
        }
    }
}

@Composable
private fun PositionGrid(selected: Set<Int>, onToggle: (Int) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        for (row in 0..2) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                for (col in 0..1) {
                    val position = row * 2 + col + 1
                    val isSelected = position in selected
                    Card(
                        onClick = { onToggle(position) },
                        shape = RoundedCornerShape(10.dp),
                        colors = CardDefaults.cardColors(
                            containerColor = if (isSelected) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.surfaceVariant
                        ),
                        modifier = Modifier.size(width = 96.dp, height = 56.dp)
                    ) {
                        Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                "$position",
                                color = if (isSelected) MaterialTheme.colorScheme.onSecondary else MaterialTheme.colorScheme.onSurfaceVariant,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }
        }
    }
}
