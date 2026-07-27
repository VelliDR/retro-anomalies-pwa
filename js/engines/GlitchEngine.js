/**
 * @file GlitchEngine.js
 * @description Datamosh, bellek bozulması ve dijital gürültü motoru.
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

        const outputCanvas = canvasPool.getCanvas('glitch_output', w, h);
        const ctx = outputCanvas.getContext('2d');

        // Temel görseli kopyala
        ctx.drawImage(sourceCanvas, 0, 0);

        const normalizedIntensity = intensity / 100;
        const sliceCount = Math.floor(5 + normalizedIntensity * 25);

        // 1. Adım: Slice Shift (Yatay şerit kaydırmaları)
        for (let i = 0; i < sliceCount; i++) {
            const sliceH = Math.floor(Math.random() * (h * 0.08)) + 4;
            const sliceY = Math.floor(Math.random() * (h - sliceH));
            const shiftX = Math.floor((Math.random() - 0.5) * (w * 0.15) * normalizedIntensity);

            // Geçici şeridi kopyala ve yana kaydırarak tekrar çiz
            const sliceData = ctx.getImageData(0, sliceY, w, sliceH);
            ctx.putImageData(sliceData, shiftX, sliceY);
        }

        // 2. Adım: Color Inversion Band (Rastgele bir şeridin renklerini ters çevir)
        if (normalizedIntensity > 0.3) {
            const invertY = Math.floor(Math.random() * (h * 0.7));
            const invertH = Math.floor(Math.random() * (h * 0.05)) + 6;
            const bandData = ctx.getImageData(0, invertY, w, invertH);
            const d = bandData.data;

            for (let j = 0; j < d.length; j += 4) {
                d[j] = 255 - d[j];         // Red Invert
                d[j + 1] = 255 - d[j + 1]; // Green Invert
                d[j + 2] = 255 - d[j + 2]; // Blue Invert
            }
            ctx.putImageData(bandData, 0, invertY);
        }

        // 3. Adım: Byte Noise (Piksel seviyesinde karıncalanma)
        const finalData = ctx.getImageData(0, 0, w, h);
        const data = finalData.data;
        const noiseCount = Math.floor(w * h * 0.005 * normalizedIntensity);

        for (let n = 0; n < noiseCount; n++) {
            const p = Math.floor(Math.random() * (data.length / 4)) * 4;
            data[p] = Math.random() < 0.5 ? 255 : 0;
            data[p + 1] = Math.random() < 0.5 ? 255 : 0;
            data[p + 2] = Math.random() < 0.5 ? 255 : 0;
        }

        ctx.putImageData(finalData, 0, 0);
        return outputCanvas;
    }
}