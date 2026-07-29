/**
 * @file CrtTvEngine.js
 * @description CRT tüplü ekran, RGB tüp kayması, tarama çizgileri ve fosfor ışıması motoru.
 * Çözünürlükten bağımsız ölçekleme, kromatik sapma ve orantılı scanline kalınlığı içerir.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class CrtTvEngine {
    /**
     * @param {HTMLCanvasElement} sourceCanvas 
     * @param {number} scanlineGap - Tarama çizgisi sıklığı (px, app.js scaleFactor ile çarpılarak gelir)
     * @param {boolean} phosphorGlow - Fosfor ışıması (Bloom)
     */
    render(sourceCanvas, scanlineGap = 3, phosphorGlow = true) {
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;

        const maxDim = Math.max(w, h);
        const scale = maxDim / 1200;

        const outputCanvas = canvasPool.getCanvas('crt_output', w, h);
        const ctx = outputCanvas.getContext('2d');

        ctx.clearRect(0, 0, w, h);

        // 1. ADIM: Ana Görseli Çiz
        ctx.drawImage(sourceCanvas, 0, 0);

        // 2. ADIM: CRT KROMATİK SAPMA (RGB Kenar Kayması)
        const shiftPx = Math.max(1, Math.round(2 * scale));
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.35;
        // Kırmızı/Mavi tüp kayması
        ctx.drawImage(sourceCanvas, -shiftPx, 0);
        ctx.restore();

        // 3. ADIM: FOSFOR IŞIMASI (Bloom Efekti - Çözünürlük Ölçekli Blur)
        if (phosphorGlow) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.30;
            const blurPx = Math.max(2, Math.round(6 * scale));
            ctx.filter = `blur(${blurPx}px) brightness(1.25)`;
            ctx.drawImage(sourceCanvas, 0, 0);
            ctx.restore();
        }

        // 4. ADIM: YATAY TARAMA ÇİZGİLERİ (Scanlines - Orantılı Çizgi Kalınlığı)
        const gap = Math.max(2, Math.round(scanlineGap));
        const lineH = Math.max(1, Math.round(gap * 0.45)); // Çizgi kalınlığı boşlukla orantılı büyür

        ctx.fillStyle = 'rgba(0, 0, 0, 0.40)';
        for (let y = 0; y < h; y += gap) {
            ctx.fillRect(0, y, w, lineH);
        }

        // 5. ADIM: CRT TÜP CAM KENAR GÖLGESİ (Vignette)
        const radGrad = ctx.createRadialGradient(
            w / 2, h / 2, Math.min(w, h) * 0.40,
            w / 2, h / 2, Math.max(w, h) * 0.72
        );
        radGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        radGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.25)');
        radGrad.addColorStop(1, 'rgba(0, 0, 0, 0.85)');

        ctx.fillStyle = radGrad;
        ctx.fillRect(0, 0, w, h);

        return outputCanvas;
    }
}