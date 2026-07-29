/**
 * @file ColorClashEngine.js
 * @description Hakiki 8-Bit ZX Spectrum Color Clash (Hücre Başına 2 Palet Renk Sınırı) motoru.
 * Kontrast kapısı ile kumlanmayı engeller, pikselleri 15 ana ZX Spectrum rengine kilitler.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class ColorClashEngine {
    constructor() {
        // Otantik 15 Renk ZX Spectrum Paleti (Normal + Bright Modları)
        this.spectrumPalette = [
            [0, 0, 0],       // 0: Black
            [0, 0, 192],     // 1: Dark Blue
            [192, 0, 0],     // 2: Dark Red
            [192, 0, 192],   // 3: Dark Magenta
            [0, 192, 0],     // 4: Dark Green
            [0, 192, 192],   // 5: Dark Cyan
            [192, 192, 0],   // 6: Dark Yellow
            [192, 192, 192], // 7: Dark White / Gray
            [0, 0, 255],     // 8: Bright Blue
            [255, 0, 0],     // 9: Bright Red
            [255, 0, 255],   // 10: Bright Magenta
            [0, 255, 0],     // 11: Bright Green
            [0, 255, 255],   // 12: Bright Cyan
            [255, 255, 0],   // 13: Bright Yellow
            [255, 255, 255]  // 14: Bright White
        ];
    }

    /**
     * @param {HTMLCanvasElement} sourceCanvas 
     * @param {number} blockSize - Izgara boyutu (Varsayılan 8px, 1200px referansına göre ölçeklenir)
     */
    render(sourceCanvas, blockSize = 8) {
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;

        // ImageLoader (1200px) referansına göre dinamik ölçek hesabı
        const maxDim = Math.max(w, h);
        const scale = maxDim / 1200;
        const scaledBlockSize = Math.max(2, Math.round(blockSize * scale));

        const outputCanvas = canvasPool.getCanvas('clash_output', w, h);
        const ctx = outputCanvas.getContext('2d');

        const srcCtx = sourceCanvas.getContext('2d');
        const imgData = srcCtx.getImageData(0, 0, w, h);
        const d = imgData.data;

        // Her 8x8 (Ölçeklenmiş) bloğu tara
        for (let by = 0; by < h; by += scaledBlockSize) {
            for (let bx = 0; bx < w; bx += scaledBlockSize) {

                let minLum = 255, maxLum = 0;
                let totalR = 0, totalG = 0, totalB = 0;
                let count = 0;

                // 1. ADIM: Bloğun parlaklık aralığını (Kontrast) ve ortalamasını hesapla
                for (let py = 0; py < scaledBlockSize && (by + py) < h; py++) {
                    for (let px = 0; px < scaledBlockSize && (bx + px) < w; px++) {
                        const i = ((by + py) * w + (bx + px)) * 4;
                        const r = d[i], g = d[i + 1], b = d[i + 2];
                        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

                        if (lum < minLum) minLum = lum;
                        if (lum > maxLum) maxLum = lum;

                        totalR += r; totalG += g; totalB += b;
                        count++;
                    }
                }

                if (count === 0) continue;

                const lumDiff = maxLum - minLum;
                const avgR = totalR / count;
                const avgG = totalG / count;
                const avgB = totalB / count;

                // 2. ADIM: DÜZ ALAN KONTROLÜ (Kumlanmayı Önleyen Kapı)
                // Kontrast çok düşükse (düz alanlar), bloğu tek bir ZX Spectrum rengine boya
                if (lumDiff < 22) {
                    const solidColor = this.getClosestPaletteColor(avgR, avgG, avgB);
                    this.fillBlockWithColor(d, w, h, bx, by, scaledBlockSize, solidColor);
                    continue;
                }

                // 3. ADIM: KONTRASTLI ALANLAR (INK & PAPER Ayrımı)
                const avgLum = (minLum + maxLum) / 2;
                let darkSumR = 0, darkSumG = 0, darkSumB = 0, darkCount = 0;
                let lightSumR = 0, lightSumG = 0, lightSumB = 0, lightCount = 0;

                for (let py = 0; py < scaledBlockSize && (by + py) < h; py++) {
                    for (let px = 0; px < scaledBlockSize && (bx + px) < w; px++) {
                        const i = ((by + py) * w + (bx + px)) * 4;
                        const r = d[i], g = d[i + 1], b = d[i + 2];
                        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

                        if (lum < avgLum) {
                            darkSumR += r; darkSumG += g; darkSumB += b;
                            darkCount++;
                        } else {
                            lightSumR += r; lightSumG += g; lightSumB += b;
                            lightCount++;
                        }
                    }
                }

                // Koyu (Ink) ve Açık (Paper) ortalamalarını ZX Paletine Kilitle
                const darkAvgR = darkCount > 0 ? darkSumR / darkCount : avgR;
                const darkAvgG = darkCount > 0 ? darkSumG / darkCount : avgG;
                const darkAvgB = darkCount > 0 ? darkSumB / darkCount : avgB;

                const lightAvgR = lightCount > 0 ? lightSumR / lightCount : avgR;
                const lightAvgG = lightCount > 0 ? lightSumG / lightCount : avgG;
                const lightAvgB = lightCount > 0 ? lightSumB / lightCount : avgB;

                const inkColor = this.getClosestPaletteColor(darkAvgR, darkAvgG, darkAvgB);
                const paperColor = this.getClosestPaletteColor(lightAvgR, lightAvgG, lightAvgB);

                // 4. ADIM: Bloğun piksellerini sadece INK veya PAPER rengine zorla
                for (let py = 0; py < scaledBlockSize && (by + py) < h; py++) {
                    for (let px = 0; px < scaledBlockSize && (bx + px) < w; px++) {
                        const i = ((by + py) * w + (bx + px)) * 4;
                        const r = d[i], g = d[i + 1], b = d[i + 2];
                        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

                        const chosenColor = (lum < avgLum) ? inkColor : paperColor;
                        d[i] = chosenColor[0];
                        d[i + 1] = chosenColor[1];
                        d[i + 2] = chosenColor[2];
                    }
                }
            }
        }

        ctx.putImageData(imgData, 0, 0);
        return outputCanvas;
    }

    /**
     * Verilen RGB değerini 15 renkli ZX Spectrum paletinde en yakın renge kilitler
     */
    getClosestPaletteColor(r, g, b) {
        let minDist = Infinity;
        let closest = this.spectrumPalette[0];

        for (let i = 0; i < this.spectrumPalette.length; i++) {
            const p = this.spectrumPalette[i];
            const dist = (r - p[0]) ** 2 + (g - p[1]) ** 2 + (b - p[2]) ** 2;
            if (dist < minDist) {
                minDist = dist;
                closest = p;
            }
        }
        return closest;
    }

    /**
     * Bloğu tek bir renkle doldurur
     */
    fillBlockWithColor(d, w, h, bx, by, bSize, color) {
        for (let py = 0; py < bSize && (by + py) < h; py++) {
            for (let px = 0; px < bSize && (bx + px) < w; px++) {
                const i = ((by + py) * w + (bx + px)) * 4;
                d[i] = color[0];
                d[i + 1] = color[1];
                d[i + 2] = color[2];
            }
        }
    }
}