/**
 * @file ColorClashEngine.js
 * @description 8-Bit ZX Spectrum Color Clash (Hücre Başına 2 Renk Sınırı) motoru.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class ColorClashEngine {
    /**
     * @param {HTMLCanvasElement} sourceCanvas 
     * @param {number} blockSize - Izgara boyutu (Varsayılan 8px)
     */
    render(sourceCanvas, blockSize = 8) {
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;

        const outputCanvas = canvasPool.getCanvas('clash_output', w, h);
        const ctx = outputCanvas.getContext('2d');

        const srcCtx = sourceCanvas.getContext('2d');
        const imgData = srcCtx.getImageData(0, 0, w, h);
        const d = imgData.data;

        // Her 8x8 bloğu tara
        for (let bx = 0; bx < w; bx += blockSize) {
            for (let by = 0; by < h; by += blockSize) {

                let minLum = 255, maxLum = 0;
                let darkR = 0, darkG = 0, darkB = 0;
                let lightR = 255, lightG = 255, lightB = 255;

                // 1. Adım: Bloğun en koyu (INK) ve en açık (PAPER) renklerini bul
                for (let py = 0; py < blockSize && (by + py) < h; py++) {
                    for (let px = 0; px < blockSize && (bx + px) < w; px++) {
                        const i = ((by + py) * w + (bx + px)) * 4;
                        const r = d[i], g = d[i + 1], b = d[i + 2];
                        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

                        if (lum < minLum) {
                            minLum = lum;
                            darkR = r; darkG = g; darkB = b;
                        }
                        if (lum > maxLum) {
                            maxLum = lum;
                            lightR = r; lightG = g; lightB = b;
                        }
                    }
                }

                // 2. Adım: Bloğun piksellerini sadece bu iki renkten birine zorla
                for (let py = 0; py < blockSize && (by + py) < h; py++) {
                    for (let px = 0; px < blockSize && (bx + px) < w; px++) {
                        const i = ((by + py) * w + (bx + px)) * 4;
                        const r = d[i], g = d[i + 1], b = d[i + 2];
                        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

                        const mid = (minLum + maxLum) / 2;
                        if (lum < mid) {
                            d[i] = darkR; d[i + 1] = darkG; d[i + 2] = darkB;
                        } else {
                            d[i] = lightR; d[i + 1] = lightG; d[i + 2] = lightB;
                        }
                    }
                }
            }
        }

        ctx.putImageData(imgData, 0, 0);
        return outputCanvas;
    }
}