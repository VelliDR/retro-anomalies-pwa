/**
 * @file AsciiMatrixEngine.js
 * @description ASCII Karakter Sanatı, Matrix Terminal ve Tipografik Matris Motoru.
 * Çözünürlükten bağımsız ölçekleme, en/boy oranı korumalı ızgara ve fosfor ışıması içerir.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class AsciiMatrixEngine {
    constructor() {
        this.charSets = {
            'density': ' .:-=+*#%@',
            'binary': '01',
            'hex': '0123456789ABCDEF'
        };
    }

    /**
     * @param {HTMLCanvasElement} sourceCanvas 
     * @param {string} charSetKey - 'density', 'binary', 'hex' veya Özel Metin
     * @param {string} colorMode - 'matrix' (Yeşil), 'amber' (Turuncu), 'fullcolor'
     * @param {number} fontSize - Karakter yüksekliği (px, app.js scaleFactor ile çarpılarak gelir)
     */
    render(sourceCanvas, charSetKey = 'density', colorMode = 'matrix', fontSize = 10) {
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;

        const outputCanvas = canvasPool.getCanvas('ascii_output', w, h);
        const ctx = outputCanvas.getContext('2d');

        // Terminal Derin Arka Planı
        ctx.fillStyle = '#040804';
        ctx.fillRect(0, 0, w, h);

        const srcCtx = sourceCanvas.getContext('2d');
        const imgData = srcCtx.getImageData(0, 0, w, h);
        const d = imgData.data;

        // Monospace En/Boy Oranı Hesabı (~0.6)
        const cellH = Math.max(6, Math.round(fontSize));
        const cellW = Math.max(3, Math.round(cellH * 0.6));

        ctx.font = `bold ${cellH}px "Courier New", Courier, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const chars = this.charSets[charSetKey] || charSetKey || ' .:-=+*#%@';
        let customCharIdx = 0;

        for (let y = 0; y < h; y += cellH) {
            for (let x = 0; x < w; x += cellW) {
                // Hücre Merkezinden Piksel Örnekleme
                const srcX = Math.min(w - 1, Math.floor(x + cellW / 2));
                const srcY = Math.min(h - 1, Math.floor(y + cellH / 2));
                const i = (srcY * w + srcX) * 4;

                const r = d[i];
                const g = d[i + 1];
                const b = d[i + 2];
                const a = d[i + 3] / 255;

                if (a < 0.1) continue;

                const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

                // Karakter Seçimi
                let charToDraw = '';
                if (this.charSets[charSetKey]) {
                    const charIdx = Math.floor(lum * (chars.length - 1));
                    charToDraw = chars[charIdx];
                } else {
                    charToDraw = chars[customCharIdx % chars.length];
                    customCharIdx++;
                }

                // Renk ve Fosfor Işıması Modları
                if (colorMode === 'matrix') {
                    // Yüksek parlaklıkta fosfor beyaza kaçar
                    const green = Math.floor(50 + lum * 205);
                    const redBlue = lum > 0.75 ? Math.floor((lum - 0.75) * 4 * 180) : 0;
                    ctx.fillStyle = `rgb(${redBlue}, ${green}, ${Math.max(20, redBlue)})`;
                } else if (colorMode === 'amber') {
                    // Amber CRT Monitör Tayfı
                    const red = Math.floor(80 + lum * 175);
                    const green = Math.floor(lum * 180);
                    const blue = lum > 0.85 ? Math.floor((lum - 0.85) * 6 * 150) : 0;
                    ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
                } else {
                    // Orijinal Renk
                    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                }

                // Karakteri Hücre Merkezine Çiz
                ctx.fillText(charToDraw, x + cellW / 2, y + cellH / 2);
            }
        }

        return outputCanvas;
    }
}