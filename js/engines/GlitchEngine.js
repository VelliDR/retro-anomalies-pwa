/**
 * @file GlitchEngine.js
 * @description Datamosh, RGB Kanal Kayması, Blok Bozulması ve Dijital Gürültü Motoru.
 * Çözünürlükten bağımsız ölçekleme, GPU hızlandırmalı dilimleme ve artırılmış glitch dozu içerir.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class GlitchEngine {
    /**
     * @param {HTMLCanvasElement} sourceCanvas 
     * @param {number} intensity - Glitch yoğunluğu (1 - 100)
     */
    render(sourceCanvas, intensity = 40) {
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;

        const maxDim = Math.max(w, h);
        const scale = maxDim / 1200;

        const outputCanvas = canvasPool.getCanvas('glitch_output', w, h);
        const ctx = outputCanvas.getContext('2d');

        // 1. ADIM: Temel Görsel Çizimi
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(sourceCanvas, 0, 0);

        const normIntensity = Math.min(1.0, Math.max(0.05, intensity / 100));

        // 2. ADIM: RGB KROMATİK KANAL KAYMASI (Datamosh Renk Ayrışması)
        const rgbShiftPx = Math.round((6 + normIntensity * 28) * scale);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.5 * normIntensity;
        // Kırmızı Kanalı Sola Kaydır
        ctx.drawImage(sourceCanvas, -rgbShiftPx, 0);
        // Mavi Kanalı Sağa Kaydır
        ctx.drawImage(sourceCanvas, rgbShiftPx, 0);
        ctx.restore();

        // 3. ADIM: GPU HIZLANDIRMALI YATAY DİLİM KAYDIRMASI (Slice Shift)
        // getImageData yerine drawImage kullanılarak 4K'da ışık hızında çalışır
        const sliceCount = Math.floor(10 + normIntensity * 35); // Doz artırıldı (10 - 45 şerit)
        const maxShift = w * 0.18 * normIntensity; // Maksimum kayma genişliği artırıldı

        for (let i = 0; i < sliceCount; i++) {
            const sliceH = Math.floor((Math.random() * 0.08 + 0.01) * h * scale); // Şerit yüksekliği
            const sliceY = Math.floor(Math.random() * (h - sliceH));
            const shiftX = Math.floor((Math.random() - 0.5) * maxShift);

            // Sadece kaydırılan parçayı drawImage ile üzerine çiz
            ctx.drawImage(
                sourceCanvas,
                0, sliceY, w, sliceH,       // Kaynak kırpma
                shiftX, sliceY, w, sliceH    // Hedef konum
            );
        }

        // 4. ADIM: RENK TERS ÇEVİRME & DIJİTAL BLOK BOZULMALARI (Block Corruptions)
        if (normIntensity > 0.2) {
            const blockCount = Math.floor(2 + normIntensity * 8);
            for (let b = 0; b < blockCount; b++) {
                const bw = Math.floor((Math.random() * 0.22 + 0.05) * w);
                const bh = Math.floor((Math.random() * 0.05 + 0.01) * h);
                const bx = Math.floor(Math.random() * (w - bw));
                const by = Math.floor(Math.random() * (h - bh));

                // Blok verisini al ve renklerini ters çevir / boz
                const blockData = ctx.getImageData(bx, by, bw, bh);
                const bd = blockData.data;

                const invert = Math.random() < 0.6;
                for (let p = 0; p < bd.length; p += 4) {
                    if (invert) {
                        bd[p]     = 255 - bd[p];     // R
                        bd[p + 1] = 255 - bd[p + 1]; // G
                        bd[p + 2] = 255 - bd[p + 2]; // B
                    } else {
                        // Dijital Karıncalanma / Parazit Bloğu
                        if (Math.random() < 0.4) {
                            bd[p]     = Math.random() < 0.5 ? 255 : 0;
                            bd[p + 1] = Math.random() < 0.5 ? 255 : 0;
                            bd[p + 2] = Math.random() < 0.5 ? 255 : 0;
                        }
                    }
                }
                ctx.putImageData(blockData, bx, by);
            }
        }

        // 5. ADIM: MİKRO DİJİTAL PARAZİT ÇİZGİLERİ (Scanline Noise Strips)
        const lineNoiseCount = Math.floor(3 + normIntensity * 12);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        for (let ln = 0; ln < lineNoiseCount; ln++) {
            const lineY = Math.floor(Math.random() * h);
            const lineH = Math.max(1, Math.round((1 + Math.random() * 3) * scale));
            ctx.fillRect(0, lineY, w, lineH);
        }

        return outputCanvas;
    }
}