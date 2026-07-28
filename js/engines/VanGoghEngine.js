/**
 * @file VanGoghEngine.js
 * @description Anomalies Retro Medya Laboratuvarı için Makro Vektör Akışlı & Gravür Tipi Van Gogh Motoru.
 * Uzun, kesintisiz Bezier eğrileri ve makro akış haritası ile optik dokuma estetiği.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class VanGoghEngine {
    constructor() {
        // Düşük frekanslı makro akışlar için hafif Perlin tablosu
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

    render(sourceCanvas, mode = 1, stepSize = 10, brushMinLength = 16, brushMaxLength = 36, impasto = true) {
        const width = sourceCanvas.width;
        const height = sourceCanvas.height;

        const targetCanvas = canvasPool.getCanvas('vangogh_output', width, height);
        const targetCtx = targetCanvas.getContext('2d');
        const srcCtx = sourceCanvas.getContext('2d');

        const imgData = srcCtx.getImageData(0, 0, width, height);
        const pixels = imgData.data;

        // ASTAR KATMANI: Siyah boşluk yerine yumuşatılmış orijinal renkler
        targetCtx.save();
        targetCtx.filter = 'blur(10px) saturate(125%)';
        targetCtx.drawImage(sourceCanvas, 0, 0, width, height);
        targetCtx.restore();

        // 1. KATMAN: Zemin Doku - Geniş ve Uzun Süpürme Çizgileri
        this.drawPass(targetCtx, pixels, width, height, mode, {
            step: Math.max(6, Math.round(stepSize * 1.3)),
            minLen: brushMinLength * 1.2,
            maxLen: brushMaxLength * 1.2,
            lineWidth: 4,
            alpha: 0.65,
            impasto: false
        });

        // 2. KATMAN: Ana Vektörel Gravür Katmanı (Uzun ve Kesintisiz Hatlar)
        this.drawPass(targetCtx, pixels, width, height, mode, {
            step: Math.max(3, stepSize),
            minLen: brushMinLength,
            maxLen: brushMaxLength,
            lineWidth: 2.8,
            alpha: 0.95,
            impasto: impasto
        });

        return targetCanvas;
    }

    drawPass(targetCtx, pixels, width, height, mode, config) {
        const centerX = width / 2;
        const centerY = height / 2;

        for (let y = 0; y < height; y += config.step) {
            for (let x = 0; x < width; x += config.step) {
                const i = (y * width + x) * 4;
                const r = pixels[i];
                const g = pixels[i + 1];
                const b = pixels[i + 2];
                const a = pixels[i + 3] / 255;

                if (a < 0.1) continue;

                // AÇI HESABI: Yüksek frekanslı mikro kırılmalar tamamen kaldırıldı
                const angle = this.calculateMacroAngle(x, y, width, height, centerX, centerY, mode);
                
                // KISALMAYAN UZUN ÇİZGİLER (Tüy/Kıymık oluşumunu engeller)
                const strokeLen = config.minLen + Math.random() * (config.maxLen - config.minLen);

                const hsl = this.rgbToHsl(r, g, b);
                hsl.s = Math.min(1, hsl.s * 1.2);

                const mainColor = `hsla(${hsl.h}, ${Math.round(hsl.s * 100)}%, ${Math.round(hsl.l * 100)}%, ${config.alpha})`;

                // Gölge Rengi: Orijinal rengin kendi koyu tonu
                const shadowLightness = Math.max(0.05, hsl.l * 0.45);
                const shadowColor = `hsla(${hsl.h}, ${Math.round(hsl.s * 100)}%, ${Math.round(shadowLightness * 100)}%, ${config.alpha * 0.8})`;

                this.drawContinuousStroke(targetCtx, x, y, strokeLen, angle, shadowColor, mainColor, config.lineWidth, config.impasto);
            }
        }
    }

    calculateMacroAngle(x, y, width, height, centerX, centerY, mode) {
        if (mode === 1) {
            // MOD 1: Akıcı Makro Nehir (Geniş alanlı pürüzsüz dalga)
            const n1 = this.noise2D(x * 0.0015, y * 0.0015);
            const n2 = this.noise2D(y * 0.002, x * 0.002);
            return (n1 * Math.PI) + (n2 * 0.5);
        } else if (mode === 2) {
            // MOD 2: Manyetik Merkez & Ritmik Topoğrafi
            const dx = x - centerX;
            const dy = y - centerY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const baseAngle = Math.atan2(dy, dx) + (Math.PI / 2);
            const wave = Math.sin(dist * 0.02 + x * 0.005) * 0.25;
            return baseAngle + wave;
        } else {
            // MOD 3: Çapraz Dokuma / Banknot Çizgileri
            const normY = y / height;
            const wave = Math.sin((x + y) * 0.01) * 0.2;
            return (Math.PI / 4) + wave + (normY * 0.1);
        }
    }

    drawContinuousStroke(ctx, x, y, length, angle, shadowColor, mainColor, lineWidth, impasto) {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.translate(x, y);
        ctx.rotate(angle);

        // 1. Gölge / Derinlik Çizgisi
        ctx.strokeStyle = shadowColor;
        ctx.lineWidth = lineWidth + 1.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(length * 0.35, -length * 0.12, length * 0.65, length * 0.12, length, 0);
        ctx.stroke();

        // 2. Ana Akıcı Çizgi
        ctx.strokeStyle = mainColor;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(length * 0.35, -length * 0.12, length * 0.65, length * 0.12, length, 0);
        ctx.stroke();

        // 3. Kabartma (Impasto Işığı)
        if (impasto) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.lineWidth = Math.max(0.8, lineWidth * 0.35);
            ctx.beginPath();
            ctx.moveTo(0, -1);
            ctx.bezierCurveTo(length * 0.35, -length * 0.12 - 1, length * 0.65, length * 0.12 - 1, length * 0.8, -1);
            ctx.stroke();
        }

        ctx.restore();
    }

    // --- PERLIN NOISE & MATEMATİK ---
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
