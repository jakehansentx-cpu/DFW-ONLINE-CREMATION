package com.lastresponder.certificatestickermaker.pdf

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface

/**
 * A thin coordinate-flipping wrapper around Android's [Canvas] that mimics
 * reportlab's `canvas.Canvas` drawing API (`drawString`, `drawCentredString`,
 * `line`, `rect`, all in bottom-up PDF points). `app.py`'s `make_certificate`
 * and `draw_label` were written entirely in that coordinate system; this
 * wrapper lets the Kotlin port keep the exact same x/y numbers instead of
 * re-deriving a top-down layout by hand, which is where transcription bugs
 * would otherwise creep in.
 */
class ReportLabStyleCanvas(private val canvas: Canvas, private val pageHeightPt: Float) {

    private fun flipY(y: Float): Float = pageHeightPt - y

    fun drawString(x: Float, y: Float, text: String, paint: Paint) {
        val left = Paint(paint).apply { textAlign = Paint.Align.LEFT }
        canvas.drawText(text, x, flipY(y), left)
    }

    fun drawCentredString(centerX: Float, y: Float, text: String, paint: Paint) {
        val centered = Paint(paint).apply { textAlign = Paint.Align.CENTER }
        canvas.drawText(text, centerX, flipY(y), centered)
    }

    fun line(x1: Float, y1: Float, x2: Float, y2: Float, paint: Paint) {
        canvas.drawLine(x1, flipY(y1), x2, flipY(y2), paint)
    }

    /** Stroke a rectangle spanning (x, y) to (x + w, y + h) in bottom-up points, like reportlab's `rect()`. */
    fun strokeRect(x: Float, y: Float, w: Float, h: Float, paint: Paint) {
        val stroke = Paint(paint).apply { style = Paint.Style.STROKE }
        canvas.drawRect(RectF(x, flipY(y + h), x + w, flipY(y)), stroke)
    }

    fun drawImage(bitmap: android.graphics.Bitmap, x: Float, y: Float, w: Float, h: Float) {
        val dest = RectF(x, flipY(y + h), x + w, flipY(y))
        canvas.drawBitmap(bitmap, null, dest, Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
    }

    /** Draws multi-line, center-wrapped body text (used for the label disclosure paragraph). */
    fun drawWrappedCentered(
        text: String,
        centerX: Float,
        topY: Float,
        maxWidth: Float,
        maxHeight: Float,
        typeface: Typeface,
        fontSize: Float,
        leading: Float
    ) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            this.typeface = typeface
            this.textSize = fontSize
            this.textAlign = Paint.Align.CENTER
        }
        val lines = wrapText(text, maxWidth, paint)
        val totalHeight = lines.size * leading
        val startY = topY - maxOf(0f, (maxHeight - totalHeight) / 2f)
        lines.forEachIndexed { index, line ->
            canvas.drawText(line, centerX, flipY(startY - index * leading), paint)
        }
    }

    companion object {
        /** Shrinks [size] down to [minSize] until [text] fits within [maxWidth], mirroring `draw_centered_fit`. */
        fun fitTextSize(text: String, maxWidth: Float, typeface: Typeface, size: Float, minSize: Float): Float {
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.typeface = typeface }
            var current = size
            paint.textSize = current
            while (current > minSize && paint.measureText(text) > maxWidth) {
                current -= 0.5f
                paint.textSize = current
            }
            return current
        }

        fun wrapText(text: String, maxWidth: Float, paint: Paint): List<String> {
            if (text.isBlank()) return emptyList()
            val words = text.trim().split(Regex("\\s+"))
            val lines = mutableListOf<String>()
            var current = StringBuilder()
            for (word in words) {
                val candidate = if (current.isEmpty()) word else "$current $word"
                if (paint.measureText(candidate) <= maxWidth || current.isEmpty()) {
                    current = StringBuilder(candidate)
                } else {
                    lines.add(current.toString())
                    current = StringBuilder(word)
                }
            }
            if (current.isNotEmpty()) lines.add(current.toString())
            return lines
        }
    }
}
