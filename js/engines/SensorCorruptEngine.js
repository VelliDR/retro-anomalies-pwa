/**
 * @file SensorCorruptEngine.js
 * @description %130 Overdrive Gürültü ve Luminance Anchoring (Şekil Koruma) Destekli Motor.
 */

export class SensorCorruptEngine {
    constructor() {
        this.name = "Sensor Corrupt / Circuit Bend";
    }

    _getPRNG(seed) {
        let s = (seed || 1337) >>> 0;
        return function() {
            s = (Math.imul(1664525, s) + 1013904223) >>> 0;
            return s / 4294967296;
        };
    }

    process(ctx, width, height, options = {}, scaleFactor = 1.0) {
        const mode = options.mode || 'chaos';
        const noiseIntensity = options.noiseIntensity ?? 0.5; // Max 1.3 (%130)
        const chaosLevel = options.chaosLevel ?? 0.5;
        const seed = options.seed ?? 12345;

        const random = this._getPRNG(seed);

        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        if (mode === 'chaos') {
            // MOD 2: KAOS MODU
            const srcData = new Uint8ClampedArray(data);
            const numBlocks = Math.floor(8 * chaosLevel) + 1;
            
            for (let b = 0; b < numBlocks; b++) {
                const blockH = Math.floor((random() * 20 + 6) * scaleFactor);
                const srcY = Math.floor(random() * Math.max(1, height - blockH));
                const destY = Math.floor(random() * Math.max(1, height - blockH));
                const shiftX = Math.floor((random() - 0.5) * width * 0.3 * chaosLevel);

                const srcStart = srcY * width * 4;
                const destStart = destY * width * 4;
                const blockLength = blockH * width * 4;

                for (let i = 0; i < blockLength; i += 4) {
                    const targetIdx = (destStart + i + (shiftX * 4) + data.length) % data.length;
                    const sourceIdx = (srcStart + i) % data.length;

                    if (targetIdx + 3 < data.length && sourceIdx + 3 < data.length) {
                        data[targetIdx]     = Math.floor(srcData[sourceIdx + 1] * 0.7 + srcData[targetIdx] * 0.3);
                        data[targetIdx + 1] = Math.floor(srcData[sourceIdx] * 0.7 + srcData[targetIdx + 1] * 0.3);
                        data[targetIdx + 2] = srcData[sourceIdx + 2];
                        data[targetIdx + 3] = 255;
                    }
                }
            }

            let chaosSeed = (random() * 0xFFFFFF) | 0;

            for (let i = 0; i < data.length; i += 4) {
                chaosSeed = (chaosSeed * 16807 + 31) & 0xFFFFFF;
                const seedByte = chaosSeed & 0xFF;

                let r = data[i];
                let g = data[i + 1];
                let b = data[i + 2];

                if (random() < (noiseIntensity * 0.8)) {
                    const selector = (seedByte + i) % 3;

                    if (selector === 0) {
                        data[i]     = g;
                        data[i + 1] = b;
                        data[i + 2] = r;
                    } else if (selector === 1) {
                        data[i]     = (r ^ (seedByte & 0x3F)) & 0xFF;
                        data[i + 1] = Math.min(255, Math.floor(g * (1.0 + chaosLevel)));
                    } else {
                        data[i]     = (r >> 2) << 2;
                        data[i + 1] = (g >> 2) << 2;
                        data[i + 2] = (b >> 2) << 2;
                    }
                }
                data[i + 3] = 255;
            }

        } else {
            // ==========================================
            // MOD 1: STANDART MOD (%130 OVERDRIVE & LUMINANCE ANCHOR)
            // ==========================================
            const lineJitter = options.lineJitter ?? true;
            const bitShift = options.bitShift ?? true;

            // 1. Scanline Jitter
            if (lineJitter) {
                for (let y = 0; y < height; y++) {
                    if (random() < (0.04 + noiseIntensity * 0.25)) {
                        const shiftX = Math.floor((random() - 0.5) * (8 + noiseIntensity * 35) * scaleFactor);
                        const rowStart = y * width * 4;
                        const rowBuffer = new Uint8ClampedArray(data.buffer, data.byteOffset + rowStart, width * 4);
                        
                        if (shiftX > 0) {
                            rowBuffer.copyWithin(shiftX * 4, 0, (width - shiftX) * 4);
                        } else if (shiftX < 0) {
                            rowBuffer.copyWithin(0, -shiftX * 4, width * 4);
                        }
                    }
                }
            }

            // 2. Piksel Bazlı Gürültü ve Şekil Kılavuzlu Çapalama
            for (let i = 0; i < data.length; i += 4) {
                const origR = data[i];
                const origG = data[i + 1];
                const origB = data[i + 2];

                // ŞEKİL ÇAPASI: Orijinal parlaklık (Luminance)
                const origLum = 0.299 * origR + 0.587 * origG + 0.114 * origB;

                let r = origR;
                let g = origG;
                let b = origB;

                // A. Overdrive Additive Chromatic Noise (%130 şiddet)
                if (random() < Math.min(1.0, noiseIntensity * 0.9)) {
                    // %130 seviyesinde sapma miktarını 380 piksel değerine kadar patlatıyoruz
                    const noiseAmplitude = 380 * noiseIntensity;
                    
                    r += (random() - 0.5) * noiseAmplitude;
                    g += (random() - 0.5) * noiseAmplitude;
                    b += (random() - 0.5) * noiseAmplitude;
                }

                // B. Voltaj & Bit-Shift Taşması
                if (bitShift && origLum >= 50) {
                    if (random() < (noiseIntensity * 0.5)) {
                        if (g > 80) {
                            r = (r ^ 0x44) & 0xFF;
                            g = g * 1.4;
                        }
                        if (r > 100) {
                            b = (b | 0xAA) & 0xFF;
                        }
                    }
                }

                // C. MUCİZEİ DOKUNUŞ: LUMINANCE ANCHORING (Şekli Kurtaran Kısım)
                // Renkler ne kadar patlarsa patlasın yeni parlaklığı hesapla
                let newLum = 0.299 * r + 0.587 * g + 0.114 * b;
                
                // Parlaklığı %75 oranında orijinal kontura kilitliyoruz
                const targetLum = origLum * 0.75 + newLum * 0.25;
                const lumRatio = newLum > 0 ? (targetLum / newLum) : 1.0;

                // Parlaklık oranına göre renkleri yeniden ölçekle ve 0-255 arasına sıkıştır
                r = Math.min(255, Math.max(0, r * lumRatio));
                g = Math.min(255, Math.max(0, g * lumRatio));
                b = Math.min(255, Math.max(0, b * lumRatio));

                data[i]     = Math.floor(r);
                data[i + 1] = Math.floor(g);
                data[i + 2] = Math.floor(b);
                data[i + 3] = 255;
            }
        }

        ctx.putImageData(imageData, 0, 0);
    }
}

export const sensorCorruptEngine = new SensorCorruptEngine();