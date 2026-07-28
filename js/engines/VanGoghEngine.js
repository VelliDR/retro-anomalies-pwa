/**
 * @file VanGoghEngine.js
 * @description Anomalies Retro Medya Laboratuvarı için Çözünürlükten Bağımsız (Resolution-Independent) Van Gogh Motoru.
 * ImageLoader referans oranına (1200px) tam uyumlu, dinamik ölçekli fırça ve vektör-akış mimarisi.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class VanGoghEngine {
    constructor() {
        // Permütasyon Tablosu (Perlin Noise)
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
     * @param {HTMLCanvasElement} sourceCanvas - Kaynak tuval (Full veya Preview)
     * @param {number} mode - 1: Anatomik Akış (Structure Tensor), 2: Yıldızlı Gece Girdap, 3: Ekspresyonist Kaos
     * @returns {HTMLCanvasElement}
     */
    render(sourceCanvas, mode = 1) {
        const width = sourceCanvas.width;
        const height = sourceCanvas.height;

        // ImageLoader previewMaxDim (1200px) referansına göre dinamik ölçek hesabı
        const maxDim = Math.max(width, height);
        const referenceDim = 1200;
        const scale = maxDim / referenceDim;

        const targetCanvas = canvasPool.getCanvas('vangogh_output', width, height);
        const targetCtx = targetCanvas.getContext('2d');
        const srcCtx = sourceCanvas.getContext('2d');

        const imgData = srcCtx.getImageData(0, 0, width, height);
        const pixels = imgData.data;

        // 1. ASTAR KATMANI (Blur miktarı çözünürlükle doğru orantılı büyür)
        targetCtx.save();
        targetCtx.filter = `blur(${Math.round(12 * scale)}px) saturate(140%) contrast(110%)`;
        targetCtx.drawImage(sourceCanvas, 0, 0, width, height);
        targetCtx.restore();

        // 2. ÖLÇEKLENMİŞ TENSÖR ALANI (Yumuşatmayı çözünürlüğe oranlar)
        const tensorField = this.computePaddedStructureTensor(pixels, width, height, scale);

        // 3. KATMAN: KÜTLEŞEL GENİŞ FIRÇALAR (Coarse Mass)
        this.renderStreamlinePass(targetCtx, pixels, width, height, tensorField, mode, scale, {
            density: 0.015,
            stepLength: 4.0 * scale,
            maxSteps: 12,
            bristleCount: 6,
            brushWidth: 6.0 * scale,
            alpha: 0.55,
            turbulence: 0.12,
            impasto: false
        });

        // 4. KATMAN: ANA ANATOMİK FIRÇALAR (Primary Impasto)
        this.renderStreamlinePass(targetCtx, pixels, width, height, tensorField, mode, scale, {
            density: 0.045,
            stepLength: 3.0 * scale,
            maxSteps: 10,
            bristleCount: 8,
            brushWidth: 3.2 * scale,
            alpha: 0.90,
            turbulence: 0.22,
            impasto: true
        });

        // 5. KATMAN: DETAY VE VURGU HIGHLIGHTLARI
        this.renderStreamlinePass(targetCtx, pixels, width, height, tensorField, mode, scale, {
            density: 0.02,
            stepLength: 2.0 * scale,
            maxSteps: 6,
            bristleCount: 4,
            brushWidth: 1.8 * scale,
            alpha: 0.95,
            turbulence: 0.08,
            impasto: true,
            highlightOnly: true
        });

        return targetCanvas;
    }

    /**
     * Yumuşatılmış Structure Tensor Alanı (Yumuşatma yarıçapı scale ile genişletilir)
     */
    computePaddedStructureTensor(pixels, width, height, scale) {
        const size = width * height;
        const Jxx = new Float32Array(size);
        const Jyy = new Float32Array(size);
        const Jxy = new Float32Array(size);

        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const l00 = pixels[((y - 1) * width + (x - 1)) * 4] * 0.299;
                const l10 = pixels[((y - 1) * width + x) * 4] * 0.299;
                const l20 = pixels[((y - 1) * width + (x + 1)) * 4] * 0.299;
                const l01 = pixels[(y * width + (x - 1)) * 4] * 0.299;
                const l21 = pixels[(y * width + (x + 1)) * 4] * 0.299;
                const l02 = pixels[((y + 1) * width + (x - 1)) * 4] * 0.299;
                const l12 = pixels[((y + 1) * width + x) * 4] * 0.299;
                const l22 = pixels[((y + 1) * width + (x + 1)) * 4] * 0.299;

                const gx = (l20 + 2 * l21 + l22) - (l00 + 2 * l01 + l02);
                const gy = (l02 + 2 * l12 + l22) - (l00 + 2 * l10 + l20);

                const iIdx = y * width + x;
                Jxx[iIdx] = gx * gx;
                Jyy[iIdx] = gy * gy;
                Jxy[iIdx] = gx * gy;
            }
        }

        const angles = new Float32Array(size);
        const coherence = new Float32Array(size);

        // Radius scale katsayısı ile oranlanır
        const radius = Math.max(1, Math.round(3 * scale));

        for (let y = radius; y < height - radius; y += Math.max(1, Math.floor(scale / 2))) {
            for (let x = radius; x < width - radius; x += Math.max(1, Math.floor(scale / 2))) {
                let sxx = 0, syy = 0, sxy = 0;

                for (let dy = -radius; dy <= radius; dy += Math.max(1, Math.floor(scale))) {
                    for (let dx = -radius; dx <= radius; dx += Math.max(1, Math.floor(scale))) {
                        const nIdx = (y + dy) * width + (x + dx);
                        sxx += Jxx[nIdx];
                        syy += Jyy[nIdx];
                        sxy += Jxy[nIdx];
                    }
                }

                const iIdx = y * width + x;
                angles[iIdx] = 0.5 * Math.atan2(2 * sxy, sxx - syy) + (Math.PI / 2);

                const num = (sxx - syy) * (sxx - syy) + 4 * sxy * sxy;
                const den = (sxx + syy) * (sxx + syy) + 1e-5;
                coherence[iIdx] = Math.sqrt(num) / den;
            }
        }

        return { angles, coherence };
    }

    /**
     * Akış Çizgisi Katmanı
     */
    renderStreamlinePass(targetCtx, pixels, width, height, tensorField, mode, scale, config) {
        // Tohum sayısı referans alana (1200px bazı) göre hesaplanır, böylece fırça sıklığı korunur
        const referenceArea = (width / scale) * (height / scale);
        const totalSeeds = Math.floor(referenceArea * config.density);

        for (let i = 0; i < totalSeeds; i++) {
            let rx = Math.random() * width;
            let ry = Math.random() * height;

            const pIdx = (Math.floor(ry) * width + Math.floor(rx)) * 4;
            const r = pixels[pIdx];
            const g = pixels[pIdx + 1];
            const b = pixels[pIdx + 2];
            const a = pixels[pIdx + 3] / 255;

            if (a < 0.1) continue;

            const hsl = this.rgbToHsl(r, g, b);

            if (config.highlightOnly && hsl.l < 0.6) continue;

            const pathPoints = this.traceStreamline(rx, ry, width, height, tensorField, mode, scale, config);

            if (pathPoints.length < 2) continue;

            this.drawMultiBristleStroke(targetCtx, pathPoints, hsl, scale, config);
        }
    }

    /**
     * Parçacık İlerleme Analizi (Noise frekansı scale ile bölünür)
     */
    traceStreamline(startX, startY, width, height, tensorField, mode, scale, config) {
        const points = [{ x: startX, y: startY }];
        let currX = startX;
        let currY = startY;

        for (let step = 0; step < config.maxSteps; step++) {
            if (currX < 2 || currX >= width - 2 || currY < 2 || currY >= height - 2) break;

            const idx = Math.floor(currY) * width + Math.floor(currX);
            let baseAngle = tensorField.angles[idx] || 0;
            const coh = tensorField.coherence[idx] || 0;

            // Noise frekansını ölçekleme: Koordinatları scale'e bölerek bağımsızlaştırıyoruz
            const noiseX = (currX / scale) * 0.003;
            const noiseY = (currY / scale) * 0.003;
            const noise = this.noise2D(noiseX, noiseY);

            if (mode === 2) {
                baseAngle += noise * Math.PI * 1.5;
            } else if (mode === 3) {
                baseAngle = (baseAngle * coh) + ((Math.PI / 2 + noise * 0.5) * (1 - coh));
            } else {
                baseAngle += (noise - 0.5) * config.turbulence * (1.2 - coh);
            }

            const vx = Math.cos(baseAngle) * config.stepLength;
            const vy = Math.sin(baseAngle) * config.stepLength;

            currX += vx;
            currY += vy;

            points.push({ x: currX, y: currY });
        }

        return points;
    }

    /**
     * Çoklu Kıl Fırça Darbesi (Impasto ve fırça offsetleri scale ile oranlanır)
     */
    drawMultiBristleStroke(ctx, points, baseHsl, scale, config) {
        ctx.save();

        const bristleCount = config.bristleCount;
        const primarySat = Math.min(100, Math.round(baseHsl.s * 125));
        const primaryLum = Math.round(baseHsl.l * 100);

        for (let b = 0; b < bristleCount; b++) {
            const offsetFactor = (b / (bristleCount - 1) - 0.5) * config.brushWidth;

            const bristleLumShift = (Math.random() - 0.5) * 12;
            const bristleHueShift = (Math.random() - 0.5) * 8;

            const bristleHue = (baseHsl.h + bristleHueShift + 360) % 360;
            const bristleLum = Math.max(0, Math.min(100, primaryLum + bristleLumShift));

            const bristleColor = `hsla(${Math.round(bristleHue)}, ${primarySat}%, ${Math.round(bristleLum)}%, ${config.alpha})`;

            ctx.strokeStyle = bristleColor;
            ctx.lineWidth = Math.max(0.6 * scale, config.brushWidth / bristleCount * 1.2);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            ctx.beginPath();

            for (let i = 0; i < points.length; i++) {
                const pt = points[i];

                let nx = 0, ny = 0;
                if (i < points.length - 1) {
                    const nextPt = points[i + 1];
                    const dx = nextPt.x - pt.x;
                    const dy = nextPt.y - pt.y;
                    const len = Math.sqrt(dx * dx + dy * dy) || 1;
                    nx = -dy / len;
                    ny = dx / len;
                }

                const bx = pt.x + nx * offsetFactor;
                const by = pt.y + ny * offsetFactor;

                if (i === 0) {
                    ctx.moveTo(bx, by);
                } else {
                    ctx.lineTo(bx, by);
                }
            }
            ctx.stroke();
        }

        // Impasto ışık offset'i çözünürlüğe göre genişletilir
        if (config.impasto) {
            ctx.strokeStyle = `rgba(255, 255, 255, ${config.alpha * 0.35})`;
            ctx.lineWidth = Math.max(0.5 * scale, config.brushWidth * 0.2);
            ctx.beginPath();

            const offsetPx = 0.8 * scale;
            for (let i = 0; i < points.length; i++) {
                const pt = points[i];
                if (i === 0) ctx.moveTo(pt.x - offsetPx, pt.y - offsetPx);
                else ctx.lineTo(pt.x - offsetPx, pt.y - offsetPx);
            }
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
