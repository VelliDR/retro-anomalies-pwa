/**
 * @file VanGoghEngine.js
 * @description Anomalies Retro Medya Laboratuvarı için Organik Van Gogh & Akış Motoru.
 * Structure Tensor, Perlin Noise Türbülansı ve Adaptif Fırça Yoğunluklu Üretken Mimari.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class VanGoghEngine {
    constructor() {
        // Dahili Perlin Noise Permütasyon Tablosu (Sıfır Dış Bağımlılık)
        this.p = new Int32Array(512);
        const perm = [
            151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,
            8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,
            35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,
            134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,
            55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,
            18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,
            250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,
            189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,
            172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,
            228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,
            107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,
            138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180
        ];
        for (let i = 0; i < 256; i++) {
            this.p[i] = perm[i];
            this.p[256 + i] = perm[i];
        }
    }

    /**
     * @param {HTMLCanvasElement} sourceCanvas
     * @param {number} mode - 1: Kontur İtaatli (Structure Tensor), 2: Kolmogorov Türbülansı (Kaotik), 3: Adaptif Detay Odaklı
     * @param {number} stepSize - Temel fırça adımı (px)
     * @param {number} brushMinLength - Min fırça boyu
     * @param {number} brushMaxLength - Maks fırça boyu
     * @param {boolean} impasto - 3D Kabartma
     */
    render(sourceCanvas, mode = 1, stepSize = 10, brushMinLength = 8, brushMaxLength = 28, impasto = true) {
        const width = sourceCanvas.width;
        const height = sourceCanvas.height;

        const targetCanvas = canvasPool.getCanvas('vangogh_output', width, height);
        const targetCtx = targetCanvas.getContext('2d');
        const srcCtx = sourceCanvas.getContext('2d');

        const imgData = srcCtx.getImageData(0, 0, width, height);
        const pixels = imgData.data;

        // ASTAR KATMANI: Fotoğrafın bulanıklaştırılmış kendi renk hamuru (Boşluk krizini çözer)
        targetCtx.save();
        targetCtx.filter = 'blur(8px) saturate(120%)';
        targetCtx.drawImage(sourceCanvas, 0, 0, width, height);
        targetCtx.restore();

        // 1. Structure Tensor & Sobel Vektör Haritası (Işık ve Kontur Analizi)
        const vectorMap = this.buildVectorMap(pixels, width, height, 2);

        // 2. KATMAN: Arka Plan Geniş Kütle Darbeleri
        this.drawPass(targetCtx, pixels, width, height, vectorMap, mode, {
            step: Math.max(5, Math.round(stepSize * 1.4)),
            minLen: brushMinLength * 1.3,
            maxLen: brushMaxLength * 1.3,
            lineWidth: 5,
            alpha: 0.7,
            impasto: false
        });

        // 3. KATMAN: Ön Plan Detaylı Islak Fırça Darbeleri
        this.drawPass(targetCtx, pixels, width, height, vectorMap, mode, {
            step: Math.max(2, stepSize),
            minLen: brushMinLength,
            maxLen: brushMaxLength,
            lineWidth: 2.8,
            alpha: 0.95,
            impasto: impasto
        });

        return targetCanvas;
    }

    /**
     * Sobel Filtresi ile Görselin Kontur Vektörlerini ve Detay Yoğunluğunu Çıkarır
     */
    buildVectorMap(pixels, width, height, downscale = 2) {
        const sw = Math.floor(width / downscale);
        const sh = Math.floor(height / downscale);
        const map = new Float32Array(sw * sh * 2); // [Angle, Magnitude]

        for (let y = 1; y < sh - 1; y++) {
            for (let x = 1; x < sw - 1; x++) {
                const srcX = x * downscale;
                const srcY = y * downscale;

                let gx = 0, gy = 0;

                // Sobel 3x3 Matrisi
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const idx = ((srcY + dy) * width + (srcX + dx)) * 4;
                        const lum = pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114;
                        
                        const wx = dx * (dy === 0 ? 2 : 1);
                        const wy = dy * (dx === 0 ? 2 : 1);
                        gx += lum * wx;
                        gy += lum * wy;
                    }
                }

                const mag = Math.sqrt(gx * gx + gy * gy);
                // Kenara teğet açı (Kenarları takip eden fırça)
                const angle = Math.atan2(gy, gx) + (Math.PI / 2);

                const mapIdx = (y * sw + x) * 2;
                map[mapIdx] = angle;
                map[mapIdx + 1] = Math.min(1, mag / 200); // 0 (Düz) - 1 (Keskin Detay)
            }
        }
        return { map, sw, sh, downscale };
    }

    drawPass(targetCtx, pixels, width, height, vectorMap, mode, config) {
        for (let y = 0; y < height; y += config.step) {
            for (let x = 0; x < width; x += config.step) {
                const i = (y * width + x) * 4;
                const r = pixels[i];
                const g = pixels[i + 1];
                const b = pixels[i + 2];
                const a = pixels[i + 3] / 255;

                if (a < 0.1) continue;

                // Vektör haritasından yerel detay ve açı okuma
                const vx = Math.floor(x / vectorMap.downscale);
                const vy = Math.floor(y / vectorMap.downscale);
                const mapIdx = (vy * vectorMap.sw + vx) * 2;

                const edgeAngle = vectorMap.map[mapIdx] || 0;
                const edgeMag = vectorMap.map[mapIdx + 1] || 0;

                // Perlin Noise ile Organik Türbülans Hesabı
                const noiseVal = this.noise2D(x * 0.004, y * 0.004);
                let finalAngle;

                if (mode === 1) {
                    // MOD 1: Kontur İtaatli (Fotoğrafın anatomisini korur)
                    finalAngle = edgeAngle + (noiseVal * 0.35);
                } else if (mode === 2) {
                    // MOD 2: Kolmogorov Türbülansı (Kaotik Sıvı Akışı)
                    const fluidAngle = this.noise2D(x * 0.006, y * 0.006) * Math.PI * 2;
                    finalAngle = (fluidAngle * 0.75) + (edgeAngle * 0.25);
                } else {
                    // MOD 3: Adaptif Detay (Yüksek detayda fotoğrafa uyar, düz alanda çıldırır)
                    finalAngle = (edgeAngle * edgeMag) + ((this.noise2D(x * 0.005, y * 0.005) * Math.PI) * (1 - edgeMag));
                }

                // Adaptif Fırça Boyutlandırma (Detaylı yerlerde ince, düz yerlerde kalın)
                const adaptiveLen = (config.minLen + Math.random() * (config.maxLen - config.minLen)) * (1.2 - edgeMag * 0.3);
                const adaptiveWidth = Math.max(1.2, config.lineWidth * (1.3 - edgeMag * 0.4));

                const hsl = this.rgbToHsl(r, g, b);
                hsl.s = Math.min(1, hsl.s * 1.2); // Doğal Doygunluk Artışı

                // ISLAK PALET (Wet-on-Wet): İki farklı pigmentin tek fırçada birleşimi
                const primaryColor = `hsla(${hsl.h}, ${Math.round(hsl.s * 100)}%, ${Math.round(hsl.l * 100)}%, ${config.alpha})`;
                
                // İkincil Pigment: Aynı renk ailesinde hafif açı kayması
                const pigmentShiftHue = (hsl.h + (noiseVal * 15) + 360) % 360;
                const secondaryColor = `hsla(${pigmentShiftHue}, ${Math.round(hsl.s * 90)}%, ${Math.round(hsl.l * 85)}%, ${config.alpha * 0.7})`;

                // Gölge Tonu (Komplementer zıt renk YERİNE kendi tonunun derinliği)
                const shadowLightness = Math.max(0.05, hsl.l * 0.4);
                const shadowColor = `hsla(${hsl.h}, ${Math.round(hsl.s * 100)}%, ${Math.round(shadowLightness * 100)}%, ${config.alpha * 0.85})`;

                // Çizim
                this.drawWetStroke(targetCtx, x, y, adaptiveLen, finalAngle, shadowColor, primaryColor, secondaryColor, adaptiveWidth, config.impasto);
            }
        }
    }

    /**
     * Çift Pigmentli ve Doğal Gölge Konturlu Yağlı Boya Fırça Darbesi
     */
    drawWetStroke(ctx, x, y, length, angle, shadowColor, primaryColor, secondaryColor, lineWidth, impasto) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.translate(x, y);
        ctx.rotate(angle);

        // 1. Derinlik / Gölge Katmanı
        ctx.strokeStyle = shadowColor;
        ctx.lineWidth = lineWidth + 1.8;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(length * 0.3, -length * 0.15, length * 0.7, length * 0.15, length, 0);
        ctx.stroke();

        // 2. İkincil Pigment (Fırçadaki ıslak karışım)
        ctx.strokeStyle = secondaryColor;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(0, 0.8);
        ctx.bezierCurveTo(length * 0.3, -length * 0.15 + 0.8, length * 0.7, length * 0.15 + 0.8, length, 0.8);
        ctx.stroke();

        // 3. Ana Pigment
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = lineWidth * 0.85;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(length * 0.3, -length * 0.15, length * 0.7, length * 0.15, length, 0);
        ctx.stroke();

        // 4. Impasto (3D Işık Yansıması)
        if (impasto) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.lineWidth = Math.max(0.8, lineWidth * 0.3);
            ctx.beginPath();
            ctx.moveTo(0, -1);
            ctx.bezierCurveTo(length * 0.3, -length * 0.15 - 1, length * 0.7, length * 0.15 - 1, length * 0.8, -1);
            ctx.stroke();
        }

        ctx.restore();
    }

    // --- PERLIN NOISE & YARDIMCI MATEMATİK METOTLARI ---

    fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    lerp(t, a, b) { return a + t * (b - a); }
    grad(hash, x, y) {
        const h = hash & 7;
        const u = h < 4 ? x : y;
        const v = h < 4 ? y : x;
        return ((h & 1) ? -u : u) + ((h & 2) ? -2.0 * v : 2.0 * v);
    }

    noise2D(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const xf = x - Math.floor(x);
        const yf = y - Math.floor(y);
        const u = this.fade(xf);
        const v = this.fade(yf);

        const A = this.p[X] + Y, B = this.p[X + 1] + Y;

        return this.lerp(v,
            this.lerp(u, this.grad(this.p[A], xf, yf), this.grad(this.p[B], xf - 1, yf)),
            this.lerp(u, this.grad(this.p[A + 1], xf, yf - 1), this.grad(this.p[B + 1], xf - 1, yf - 1))
        );
    }

    rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h: Math.round(h * 360), s, l };
    }
}
