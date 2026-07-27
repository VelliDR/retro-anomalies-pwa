/**
 * @file PunkFanzineEngine.js
 * @description Kötü fotokopi, Xerox toner gürültüsü ve fanzin estetiği motoru.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class PunkFanzineEngine {
    /**
     * @param {HTMLCanvasElement} sourceCanvas 
     * @param {number} contrastBoost - Kontrast sertliği (1.0 - 4.0)
     * @param {number} tonerNoise - Toner leke miktarı (0 - 100)
     */
    render(sourceCanvas, contrastBoost = 2.5, tonerNoise = 40) {
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;

        const outputCanvas = canvasPool.getCanvas('fanzine_output', w, h);
        const ctx = outputCanvas.getContext('2d');

        const srcCtx = sourceCanvas.getContext('2d');
        const imgData = srcCtx.getImageData(0, 0, w, h);
        const d = imgData.data;

        const noiseAmount = (tonerNoise / 100) * 80;

        for (let i = 0; i < d.length; i += 4) {
            let lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

            // Sert Sigmoidal Kontrast Eğrisi (Aşırı Siyah / Aşırı Beyaz)
            lum = (lum - 128) * contrastBoost + 128;

            // Toner Gürültüsü
            const randNoise = (Math.random() - 0.5) * noiseAmount;
            lum += randNoise;

            const finalPixel = lum < 120 ? 0 : 245;

            d[i] = finalPixel;
            d[i + 1] = finalPixel;
            d[i + 2] = finalPixel;
        }

        ctx.putImageData(imgData, 0, 0);

        // Taranmış Fotokopi Kapağı Gölgesi (Edge Vignette)
        const grad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.max(w, h) * 0.7);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.65)');

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        return outputCanvas;
    }
}