/**
 * @file SensorCorruptEngine.js (Tam, Optimize & Bellek Dostu)
 * @description %130 Overdrive Gürültü ve Luminance Anchoring.
 *              Bellek dostu, çözünürlükten bağımsız glitch motoru.
 */
export class SensorCorruptEngine {
    constructor() {
        this.name = "Sensor Corrupt / Circuit Bend";
        // GC baskısını önlemek için yeniden kullanılabilir blok tamponu
        this._blockBuffer = new Uint8ClampedArray(0);
    }

    _getPRNG(seed) {
        let s = (seed || 1337) >>> 0;
        return () => {
            s = (Math.imul(1664525, s) + 1013904223) >>> 0;
            return s / 4294967296;
        };
    }

    process(ctx, width, height, options = {}, scaleFactor = 1.0) {
        const mode = options.mode || 'chaos';
        const noiseIntensity = options.noiseIntensity ?? 0.5;
        const chaosLevel = options.chaosLevel ?? 0.5;
        const seed = options.seed ?? 12345;
        const lineJitter = options.lineJitter ?? true;
        const bitShift = options.bitShift ?? true;

        const random = this._getPRNG(seed);
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        if (mode === 'chaos') {
            const numBlocks = Math.floor(8 * chaosLevel) + 1;
            const maxPossibleBlockLen = width * Math.floor(26 * scaleFactor) * 4;

            // Tamponu ihtiyaç duyuldukça genişlet (Döngü içinde 'new' çağrısını engeller)
            if (this._blockBuffer.length < maxPossibleBlockLen) {
                this._blockBuffer = new Uint8ClampedArray(maxPossibleBlockLen);
            }

            for (let b = 0; b < numBlocks; b++) {
                const blockH = Math.max(1, Math.floor((random() * 20 + 6) * scaleFactor));
                const srcY = Math.floor(random() * Math.max(1, height - blockH));
                const destY = Math.floor(random() * Math.max(1, height - blockH));
                const shiftX = Math.floor((random() - 0.5) * width * 0.3 * chaosLevel);

                const blockLen = width * blockH * 4;
                const srcStart = srcY * width * 4;
                
                // Sabit tampona yaz
                this._blockBuffer.set(data.subarray(srcStart, srcStart + blockLen));

                for (let y = 0; y < blockH; y++) {
                    const destYPos = destY + y;
                    if (destYPos < 0 || destYPos >= height) continue;

                    for (let x = 0; x < width; x++) {
                        const srcIdx = (y * width + x) * 4;
                        const destX = x + shiftX;
                        if (destX < 0 || destX >= width) continue;

                        const destIdx = destYPos * width * 4 + destX * 4;
                        data[destIdx]     = (this._blockBuffer[srcIdx + 1] * 0.7 + data[destIdx] * 0.3) | 0;
                        data[destIdx + 1] = (this._blockBuffer[srcIdx] * 0.7 + data[destIdx + 1] * 0.3) | 0;
                        data[destIdx + 2] = this._blockBuffer[srcIdx + 2];
                        data[destIdx + 3] = 255;
                    }
                }
            }

            let chaosSeed = (random() * 0xFFFFFF) | 0;
            const noiseThreshold = noiseIntensity * 0.8;

            for (let i = 0; i < data.length; i += 4) {
                chaosSeed = (chaosSeed * 16807 + 31) & 0xFFFFFF;
                const seedByte = chaosSeed & 0xFF;

                if (random() < noiseThreshold) {
                    const selector = (seedByte + i) % 3;
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];

                    if (selector === 0) {
                        data[i]     = g;
                        data[i + 1] = b;
                        data[i + 2] = r;
                    } else if (selector === 1) {
                        data[i]     = (r ^ (seedByte & 0x3F)) & 0xFF;
                        data[i + 1] = Math.min(255, (g * (1.0 + chaosLevel)) | 0);
                    } else {
                        data[i]     = (r >> 2) << 2;
                        data[i + 1] = (g >> 2) << 2;
                        data[i + 2] = (b >> 2) << 2;
                    }
                }
                data[i + 3] = 255;
            }

        } else {
            // --- STANDART MOD ---
            if (lineJitter) {
                for (let y = 0; y < height; y++) {
                    if (random() < (0.04 + noiseIntensity * 0.25)) {
                        const shiftX = Math.floor((random() - 0.5) * (8 + noiseIntensity * 35) * scaleFactor);
                        const rowStart = y * width * 4;
                        if (shiftX > 0) {
                            data.copyWithin(rowStart + shiftX * 4, rowStart, rowStart + (width - shiftX) * 4);
                        } else if (shiftX < 0) {
                            data.copyWithin(rowStart, rowStart - shiftX * 4, rowStart + (width + shiftX) * 4);
                        }
                    }
                }
            }

            const noiseAmplitude = 380 * noiseIntensity * scaleFactor;
            const thresholdOverdrive = Math.min(1.0, noiseIntensity * 0.9);
            const thresholdBitShift = noiseIntensity * 0.5;

            for (let i = 0; i < data.length; i += 4) {
                const origR = data[i];
                const origG = data[i + 1];
                const origB = data[i + 2];
                const origLum = 0.299 * origR + 0.587 * origG + 0.114 * origB;

                let r = origR;
                let g = origG;
                let b = origB;

                if (random() < thresholdOverdrive) {
                    r += (random() - 0.5) * noiseAmplitude;
                    g += (random() - 0.5) * noiseAmplitude;
                    b += (random() - 0.5) * noiseAmplitude;
                }

                if (bitShift && origLum >= 50 && random() < thresholdBitShift) {
                    if (g > 80) {
                        r = (r ^ 0x44) & 0xFF;
                        g = Math.min(255, g * 1.4);
                    }
                    if (r > 100) {
                        b = (b | 0xAA) & 0xFF;
                    }
                }

                // Negatif taşmaları temizle
                r = Math.max(0, r);
                g = Math.max(0, g);
                b = Math.max(0, b);

                // Luminance Anchoring
                const newLum = 0.299 * r + 0.587 * g + 0.114 * b;
                if (newLum > 1) {
                    const targetLum = origLum * 0.75 + newLum * 0.25;
                    const lumRatio = targetLum / newLum;
                    r = Math.min(255, r * lumRatio);
                    g = Math.min(255, g * lumRatio);
                    b = Math.min(255, b * lumRatio);
                }

                data[i]     = r | 0;
                data[i + 1] = g | 0;
                data[i + 2] = b | 0;
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }
}