/**
 * @file ThermalPaperEngine.js
 * @description Market fişi, termal yazıcı ve yırtılmış kağıt doku motoru.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class ThermalPaperEngine {
    /**
     * @param {HTMLCanvasElement} sourceCanvas 
     * @param {string} paperType - 'aged' (Sararmış kafein fişi) veya 'fresh' (Beyaz termal)
     * @param {number} wear - Yazıcı kafa aşınması ve şerit çizgileri (0 - 100)
     * @param {boolean} tornEdge - Tırtıklı yırtık kağıt kenarı
     */
    render(sourceCanvas, paperType = 'aged', wear = 30, tornEdge = true) {
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;

        const outputCanvas = canvasPool.getCanvas('thermal_output', w, h);
        const ctx = outputCanvas.getContext('2d');

        // 1. Adım: Kağıt Arka Planı
        const bgColor = paperType === 'aged' ? '#f4eedb' : '#f8f8f6';
        const dotColor = paperType === 'aged' ? '#2b2927' : '#111111';

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, w, h);

        // 2. Adım: Yüksek Kontrast Dither Görseli İşleme
        const srcCtx = sourceCanvas.getContext('2d');
        const imgData = srcCtx.getImageData(0, 0, w, h);
        const d = imgData.data;

        const dotSize = 3; // Fiş pikselleri
        ctx.fillStyle = dotColor;

        for (let y = 0; y < h; y += dotSize) {
            for (let x = 0; x < w; x += dotSize) {
                const i = (y * w + x) * 4;
                const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

                // Termal yazıcı eşikleme + hafif rasgele nokta gürültüsü
                const threshold = 128 + (Math.random() - 0.5) * 30;
                if (lum < threshold) {
                    ctx.fillRect(x, y, dotSize, dotSize);
                }
            }
        }

        // 3. Adım: Yazıcı Kafa Çizgileri (Şerit Atlamaları)
        if (wear > 0) {
            const streakCount = Math.floor((wear / 100) * 12);
            ctx.fillStyle = bgColor;

            for (let s = 0; s < streakCount; s++) {
                const streakX = Math.floor(Math.random() * w);
                const streakW = Math.floor(Math.random() * 3) + 1;
                ctx.fillRect(streakX, 0, streakW, h);
            }
        }

        // 4. Adım: Tırtıklı Kağıt Yırtılması (Top & Bottom Edge)
        if (tornEdge) {
            ctx.fillStyle = 'transparent';
            ctx.globalCompositeOperation = 'destination-out';

            const teethSize = 12;
            // Üst Kenar Yırtığı
            ctx.beginPath();
            ctx.moveTo(0, 0);
            for (let x = 0; x < w; x += teethSize) {
                ctx.lineTo(x + teethSize / 2, (Math.random() * 8) + 4);
                ctx.lineTo(x + teethSize, 0);
            }
            ctx.lineTo(w, 0);
            ctx.closePath();
            ctx.fill();

            // Alt Kenar Yırtığı
            ctx.beginPath();
            ctx.moveTo(0, h);
            for (let x = 0; x < w; x += teethSize) {
                ctx.lineTo(x + teethSize / 2, h - ((Math.random() * 8) + 4));
                ctx.lineTo(x + teethSize, h);
            }
            ctx.lineTo(w, h);
            ctx.closePath();
            ctx.fill();

            ctx.globalCompositeOperation = 'source-over';
        }

        return outputCanvas;
    }
}