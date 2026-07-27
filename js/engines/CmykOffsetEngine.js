/**
 * @file CmykOffsetEngine.js
 * @description Hakiki CMYK Matbaa Tram Noktaları (Halftone Screen) ve Ofset Kayma Motoru.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class CmykOffsetEngine {
    /**
     * @param {HTMLCanvasElement} sourceCanvas 
     * @param {number} offsetPx - Matbaa kayma miktarı (px)
     * @param {number} dotSize - Matbaa tram nokta boyutu (px)
     */
    render(sourceCanvas, offsetPx = 5, dotSize = 8) {
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;

        const outputCanvas = canvasPool.getCanvas('cmyk_output', w, h);
        const ctx = outputCanvas.getContext('2d');

        const srcCtx = sourceCanvas.getContext('2d');
        const imgData = srcCtx.getImageData(0, 0, w, h);
        const d = imgData.data;

        // Saf Beyaz Kağıt Zemin
        ctx.fillStyle = '#faf8f5';
        ctx.fillRect(0, 0, w, h);

        // Matbaa Mürekkep Çakışması İçin Multiply Modu
        ctx.globalCompositeOperation = 'multiply';

        // 1. CYAN KATMANI (Sola/Yukarıya Kaymış Tram Noktaları)
        ctx.fillStyle = '#00ffff';
        for (let y = 0; y < h; y += dotSize) {
            for (let x = 0; x < w; x += dotSize) {
                const i = (y * w + x) * 4;
                const r = d[i] / 255;
                const cyanVal = 1 - r; // Kırmızı eksikliği = Cyan miktarı

                if (cyanVal > 0.08) {
                    const radius = (cyanVal * (dotSize / 2)) * 1.1;
                    ctx.beginPath();
                    ctx.arc(x - offsetPx, y - offsetPx / 2, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // 2. MAGENTA KATMANI (Sağa/Aşağıya Kaymış Tram Noktaları)
        ctx.fillStyle = '#ff00ff';
        for (let y = 0; y < h; y += dotSize) {
            for (let x = 0; x < w; x += dotSize) {
                const i = (y * w + x) * 4;
                const g = d[i + 1] / 255;
                const magVal = 1 - g; // Yeşil eksikliği = Magenta miktarı

                if (magVal > 0.08) {
                    const radius = (magVal * (dotSize / 2)) * 1.1;
                    ctx.beginPath();
                    ctx.arc(x + offsetPx, y + offsetPx / 2, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // 3. YELLOW KATMANI (Hizalı Tram Noktaları)
        ctx.fillStyle = '#ffff00';
        for (let y = 0; y < h; y += dotSize) {
            for (let x = 0; x < w; x += dotSize) {
                const i = (y * w + x) * 4;
                const b = d[i + 2] / 255;
                const yellowVal = 1 - b; // Mavi eksikliği = Yellow miktarı

                if (yellowVal > 0.08) {
                    const radius = (yellowVal * (dotSize / 2)) * 1.1;
                    ctx.beginPath();
                    ctx.arc(x, y, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // 4. KEY / BLACK (KONTUR & AŞIRI KOYULUKLAR)
        ctx.fillStyle = '#111111';
        for (let y = 0; y < h; y += dotSize) {
            for (let x = 0; x < w; x += dotSize) {
                const i = (y * w + x) * 4;
                const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
                const blackVal = 1 - lum;

                if (blackVal > 0.5) { // Sadece koyu yerlere siyah tram at
                    const radius = ((blackVal - 0.5) * dotSize);
                    ctx.beginPath();
                    ctx.arc(x, y, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        ctx.globalCompositeOperation = 'source-over';
        return outputCanvas;
    }
}