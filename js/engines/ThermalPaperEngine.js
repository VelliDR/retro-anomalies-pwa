/**
 * @file ThermalPaperEngine.js
 * @description Market fişi, POS termal yazıcı, Bayer Dithering ve yırtılmış kağıt doku motoru.
 * Çözünürlükten bağımsız ölçekleme, otantik termal şerit çizgileri ve tırtıklı kenarlar içerir.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class ThermalPaperEngine {
    constructor() {
        // 4x4 Bayer Dithering Matrisi (Termal POS Yazıcı Nokta Gölgelendirmesi)
        this.bayerMatrix4x4 = [
            [ 0,  8,  2, 10],
            [12,  4, 14,  6],
            [ 3, 11,  1,  9],
            [15,  7, 13,  5]
        ];
    }

    /**
     * @param {HTMLCanvasElement} sourceCanvas 
     * @param {string} paperType - 'aged' (Sararmış kafein fişi) veya 'fresh' (Taze beyaz termal)
     * @param {number} wear - Yazıcı kafa aşınması ve şerit çizgileri (0 - 100)
     * @param {boolean} tornEdge - Tırtıklı yırtık kağıt kenarı
     */
    render(sourceCanvas, paperType = 'aged', wear = 30, tornEdge = true) {
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;

        const maxDim = Math.max(w, h);
        const scale = maxDim / 1200;

        const outputCanvas = canvasPool.getCanvas('thermal_output', w, h);
        const ctx = outputCanvas.getContext('2d');

        // 1. ADIM: Kağıt Arka Plan Rengi ve Termal Mürekkep Tonu
        const bgColor = paperType === 'aged' ? '#f3ebd7' : '#f7f7f4';
        const dotColor = paperType === 'aged' ? '#221e1a' : '#111111';

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, w, h);

        const srcCtx = sourceCanvas.getContext('2d');
        const imgData = srcCtx.getImageData(0, 0, w, h);
        const d = imgData.data;

        // 2. ADIM: Çözünürlüğe Göre Orantılı Termal Nokta Boyutu
        const dSize = Math.max(2, Math.round(3 * scale));
        ctx.fillStyle = dotColor;

        const matrixCols = Math.floor(w / dSize);
        const matrixRows = Math.floor(h / dSize);

        for (let gy = 0; gy < matrixRows; gy++) {
            const y = gy * dSize;
            for (let gx = 0; gx < matrixCols; gx++) {
                const x = gx * dSize;

                // Hücre Merkezinden Piksel Örnekleme
                const srcX = Math.min(w - 1, Math.floor(x + dSize / 2));
                const srcY = Math.min(h - 1, Math.floor(y + dSize / 2));
                const i = (srcY * w + srcX) * 4;

                const a = d[i + 3] / 255;
                if (a < 0.1) continue;

                const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

                // Bayer Dithering Eşikleme
                const bayerVal = (this.bayerMatrix4x4[gy % 4][gx % 4] / 16.0) - 0.5;
                const ditheredLum = Math.min(255, Math.max(0, lum + bayerVal * 60));

                if (ditheredLum < 128) {
                    ctx.fillRect(x, y, dSize, dSize);
                }
            }
        }

        // 3. ADIM: YAZICI KAFA AŞINMASI VE BOŞ ŞERİT ÇİZGİLERİ (Printer Wear Streaks)
        const normWear = wear / 100;
        if (normWear > 0) {
            const streakCount = Math.floor((3 + normWear * 14) * scale);
            ctx.fillStyle = bgColor;

            for (let s = 0; s < streakCount; s++) {
                const streakX = Math.floor(Math.random() * w);
                const streakW = Math.max(1, Math.round((1 + Math.random() * 2.5) * scale));
                ctx.fillRect(streakX, 0, streakW, h);
            }
        }

        // 4. ADIM: TIRTILIKLI KAĞIT YIRTIĞI (Top & Bottom Edge)
        if (tornEdge) {
            ctx.save();
            ctx.globalCompositeOperation = 'destination-out';

            const teethSize = Math.max(10, Math.round(18 * scale));
            const toothH = Math.max(4, Math.round(8 * scale));

            // Üst Kenar Yırtık Dişleri
            ctx.beginPath();
            ctx.moveTo(0, 0);
            for (let x = 0; x < w; x += teethSize) {
                ctx.lineTo(x + teethSize / 2, (Math.random() * toothH) + (toothH * 0.5));
                ctx.lineTo(x + teethSize, 0);
            }
            ctx.lineTo(w, 0);
            ctx.closePath();
            ctx.fill();

            // Alt Kenar Yırtık Dişleri
            ctx.beginPath();
            ctx.moveTo(0, h);
            for (let x = 0; x < w; x += teethSize) {
                ctx.lineTo(x + teethSize / 2, h - ((Math.random() * toothH) + (toothH * 0.5)));
                ctx.lineTo(x + teethSize, h);
            }
            ctx.lineTo(w, h);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        }

        return outputCanvas;
    }
}