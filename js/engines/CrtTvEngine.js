/**
 * @file CrtTvEngine.js
 * @description CRT tüplü ekran, tarama çizgileri ve fosfor ışıması motoru.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class CrtTvEngine {
    /**
     * @param {HTMLCanvasElement} sourceCanvas 
     * @param {number} scanlineGap - Tarama çizgisi sıklığı (2 - 6px)
     * @param {boolean} phosphorGlow - Fosfor ışıması (Bloom)
     */
    render(sourceCanvas, scanlineGap = 3, phosphorGlow = true) {
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;

        const outputCanvas = canvasPool.getCanvas('crt_output', w, h);
        const ctx = outputCanvas.getContext('2d');

        // 1. Adım: Ana Resmi Çiz
        ctx.drawImage(sourceCanvas, 0, 0);

        // 2. Adım: Fosfor Işıması (Bloom Efekti)
        if (phosphorGlow) {
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = 0.25;
            ctx.filter = 'blur(6px) brightness(1.2)';
            ctx.drawImage(sourceCanvas, 0, 0);
            ctx.restore();
        }

        // 3. Adım: Yatay Tarama Çizgileri (Scanlines)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        for (let y = 0; y < h; y += scanlineGap) {
            ctx.fillRect(0, y, w, 1);
        }

        // 4. Adım: CRT Tüp Cam Kenar Gölgesi (Vignette)
        const radGrad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.7);
        radGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        radGrad.addColorStop(1, 'rgba(0, 0, 0, 0.75)');

        ctx.fillStyle = radGrad;
        ctx.fillRect(0, 0, w, h);

        return outputCanvas;
    }
}