/**
 * @file CmykOffsetEngine.js
 * @description Hakiki CMYK Matbaa Tram Noktaları (Halftone Screen) ve Ofset Kayma Motoru.
 * GCR (Gray Component Replacement) matbaa renk ayrışımı ve hücre merkezli tram örneklemesi içerir.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class CmykOffsetEngine {
    /**
     * @param {HTMLCanvasElement} sourceCanvas 
     * @param {number} offsetPx - Matbaa kayma miktarı (px, app.js scaleFactor ile çarpılarak gelir)
     * @param {number} dotSize - Matbaa tram nokta boyutu (px, app.js scaleFactor ile çarpılarak gelir)
     */
    render(sourceCanvas, offsetPx = 5, dotSize = 8) {
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;

        // Güvenli parametre sınırları
        const dSize = Math.max(3, Math.round(dotSize));
        const offPx = Math.round(offsetPx);

        const outputCanvas = canvasPool.getCanvas('cmyk_output', w, h);
        const ctx = outputCanvas.getContext('2d');

        const srcCtx = sourceCanvas.getContext('2d');
        const imgData = srcCtx.getImageData(0, 0, w, h);
        const d = imgData.data;

        // Saf Fildişi Matbaa Kağıdı Zemin
        ctx.fillStyle = '#fcfaf7';
        ctx.fillRect(0, 0, w, h);

        // Matbaa Mürekkep Çakışması İçin Multiply (Çarpma) Modu
        ctx.globalCompositeOperation = 'multiply';

        const maxRadius = (dSize / 2) * 1.15;

        // 1. CYAN KATMANI (Sola / Yukarı Kaymış Mürekkep)
        ctx.fillStyle = '#00e5ff';
        for (let y = 0; y < h; y += dSize) {
            for (let x = 0; x < w; x += dSize) {
                const srcX = Math.min(w - 1, Math.floor(x + dSize / 2));
                const srcY = Math.min(h - 1, Math.floor(y + dSize / 2));
                const i = (srcY * w + srcX) * 4;

                const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, a = d[i + 3] / 255;
                if (a < 0.1) continue;

                // GCR Siyah Ayrışımı
                const k = 1 - Math.max(r, g, b);
                const c = k === 1 ? 0 : (1 - r - k) / (1 - k);

                if (c > 0.04) {
                    const radius = c * maxRadius;
                    ctx.beginPath();
                    ctx.arc(x - offPx, y - offPx * 0.5, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // 2. MAGENTA KATMANI (Sağa / Aşağı Kaymış Mürekkep)
        ctx.fillStyle = '#ff007f';
        for (let y = 0; y < h; y += dSize) {
            for (let x = 0; x < w; x += dSize) {
                const srcX = Math.min(w - 1, Math.floor(x + dSize / 2));
                const srcY = Math.min(h - 1, Math.floor(y + dSize / 2));
                const i = (srcY * w + srcX) * 4;

                const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, a = d[i + 3] / 255;
                if (a < 0.1) continue;

                const k = 1 - Math.max(r, g, b);
                const m = k === 1 ? 0 : (1 - g - k) / (1 - k);

                if (m > 0.04) {
                    const radius = m * maxRadius;
                    ctx.beginPath();
                    ctx.arc(x + offPx, y + offPx * 0.5, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // 3. YELLOW KATMANI (Hafif Dikey Kaymış Mürekkep)
        ctx.fillStyle = '#ffeb3b';
        for (let y = 0; y < h; y += dSize) {
            for (let x = 0; x < w; x += dSize) {
                const srcX = Math.min(w - 1, Math.floor(x + dSize / 2));
                const srcY = Math.min(h - 1, Math.floor(y + dSize / 2));
                const i = (srcY * w + srcX) * 4;

                const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, a = d[i + 3] / 255;
                if (a < 0.1) continue;

                const k = 1 - Math.max(r, g, b);
                const yVal = k === 1 ? 0 : (1 - b - k) / (1 - k);

                if (yVal > 0.04) {
                    const radius = yVal * maxRadius;
                    ctx.beginPath();
                    ctx.arc(x, y + offPx * 0.3, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // 4. KEY / BLACK KATMANI (GCR Hakiki Matbaa Siyah Tramı)
        ctx.fillStyle = '#1a1a1a';
        for (let y = 0; y < h; y += dSize) {
            for (let x = 0; x < w; x += dSize) {
                const srcX = Math.min(w - 1, Math.floor(x + dSize / 2));
                const srcY = Math.min(h - 1, Math.floor(y + dSize / 2));
                const i = (srcY * w + srcX) * 4;

                const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, a = d[i + 3] / 255;
                if (a < 0.1) continue;

                const k = 1 - Math.max(r, g, b);

                if (k > 0.05) {
                    const radius = k * maxRadius;
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