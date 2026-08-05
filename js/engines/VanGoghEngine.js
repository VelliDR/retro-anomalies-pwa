/**
 * @file VanGoghEngine.js
 * @description Anomalies Retro Medya Laboratuvarı için Çözünürlükten Bağımsız Van Gogh Motoru.
 *              Geliştirilmiş 3D Impasto rölyefi, fırça baskı incelmesi (tapering) ve optik renk titreşimi.
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

    render(sourceCanvas, mode = 2, stepSize = 12, brushMinLength = 10, brushMaxLength = 30, impasto = true) {
        const width = sourceCanvas.width;
        const height = sourceCanvas.height;

        const maxDim = Math.max(width, height);
        const scale = maxDim / 1200;

        const targetCanvas = canvasPool.getCanvas('vangogh_output', width, height);
        const targetCtx = targetCanvas.getContext('2d');
        const srcCtx = sourceCanvas.getContext('2d');

        const imgData = srcCtx.getImageData(0, 0, width, height);
        const pixels = imgData.data;

        // 1. ASTAR KATMANI
        targetCtx.save();
        targetCtx.filter = `blur(${Math.round(12 * scale)}px) saturate(145%) contrast(110%)`;
        targetCtx.drawImage(sourceCanvas, 0, 0, width, height);
        targetCtx.restore();

        // 2. TENSÖR ALANI HESABI
        const tensorField = this.computePaddedStructureTensor(pixels, width, height, scale);

        // 3. KATMAN: KÜTLEŞEL ZEMİN FIRÇALARI
        this.renderStreamlinePass(targetCtx, pixels, width, height, tensorField, mode, scale, {
            density: 0.014,
            stepLength: stepSize * 0.35,
            maxSteps: 12,
            brushWidth: brushMinLength * 0.58,
            bristleCount: 6,
            alpha: 0.58,
            turbulence: 0.12,
            impasto: false,
            vibration: true
        });

        // 4. KATMAN: ANA ANATOMİK FIRÇALAR
        const mainMaxSteps = Math.max(4, Math.round(brushMaxLength / (stepSize * 0.25)));
        this.renderStreamlinePass(targetCtx, pixels, width, height, tensorField, mode, scale, {
            density: 0.042,
            stepLength: stepSize * 0.25,
            maxSteps: mainMaxSteps,
            brushWidth: brushMinLength * 0.35,
            bristleCount: 8,
            alpha: 0.92,
            turbulence: 0.20,
            impasto: impasto,
            vibration: true
        });

        // 5. KATMAN: HIGHLIGHT & DETAY VURGULARI
        const detailMaxSteps = Math.max(3, Math.round((brushMinLength * 0.6) / (stepSize * 0.18)));
        this.renderStreamlinePass(targetCtx, pixels, width, height, tensorField, mode, scale, {
            density: 0.020,
            stepLength: stepSize * 0.18,
            maxSteps: detailMaxSteps,
            brushWidth: brushMinLength * 0.18,
            bristleCount: 4,
            alpha: 0.95,
            turbulence: 0.08,
            impasto: impasto,
            highlightOnly: true,
            vibration: false
        });

        return targetCanvas;
    }

    computePaddedStructureTensor(pixels, width, height, scale) {
        const sw = Math.max(100, Math.round(width / scale));
        const sh = Math.max(100, Math.round(height / scale));
        const size = sw * sh;

        const Jxx = new Float32Array(size);
        const Jyy = new Float32Array(size);
        const Jxy = new Float32Array(size);

        for (let y = 1; y < sh - 1; y++) {
            for (let x = 1; x < sw - 1; x++) {
                const srcX = Math.floor(x * scale);
                const srcY = Math.floor(y * scale);

                const getLum = (dx, dy) => {
                    const px = Math.min(width - 1, Math.max(0, srcX + dx));
                    const py = Math.min(height - 1, Math.max(0, srcY + dy));
                    const idx = (py * width + px) * 4;
                    return pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114;
                };

                const l00 = getLum(-1, -1), l10 = getLum(0, -1), l20 = getLum(1, -1);
                const l01 = getLum(-1, 0),                       l21 = getLum(1, 0);
                const l02 = getLum(-1, 1),  l12 = getLum(0, 1),  l22 = getLum(1, 1);

                const gx = (l20 + 2 * l21 + l22) - (l00 + 2 * l01 + l02);
                const gy = (l02 + 2 * l12 + l22) - (l00 + 2 * l10 + l20);

                const iIdx = y * sw + x;
                Jxx[iIdx] = gx * gx;
                Jyy[iIdx] = gy * gy;
                Jxy[iIdx] = gx * gy;
            }
        }

        const angles = new Float32Array(size);
        const coherence = new Float32Array(size);
        const radius = 3;

        for (let y = radius; y < sh - radius; y++) {
            for (let x = radius; x < sw - radius; x++) {
                let sxx = 0, syy = 0, sxy = 0;

                for (let dy = -radius; dy <= radius; dy++) {
                    for (let dx = -radius; dx <= radius; dx++) {
                        const nIdx = (y + dy) * sw + (x + dx);
                        sxx += Jxx[nIdx];
                        syy += Jyy[nIdx];
                        sxy += Jxy[nIdx];
                    }
                }

                const iIdx = y * sw + x;
                angles[iIdx] = 0.5 * Math.atan2(2 * sxy, sxx - syy) + (Math.PI / 2);

                const num = (sxx - syy) * (sxx - syy) + 4 * sxy * sxy;
                const den = (sxx + syy) * (sxx + syy) + 1e-5;
                coherence[iIdx] = Math.sqrt(num) / den;
            }
        }

        return { angles, coherence, sw, sh };
    }

    renderStreamlinePass(targetCtx, pixels, width, height, tensorField, mode, scale, config) {
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

            if (config.highlightOnly && hsl.l < 0.55) continue;

            const pathPoints = this.traceStreamline(rx, ry, width, height, tensorField, mode, scale, config);

            if (pathPoints.length < 2) continue;

            this.drawMultiBristleStroke(targetCtx, pathPoints, hsl, scale, config);
        }
    }

    traceStreamline(startX, startY, width, height, tensorField, mode, scale, config) {
        const points = [{ x: startX, y: startY }];
        let currX = startX;
        let currY = startY;

        for (let step = 0; step < config.maxSteps; step++) {
            if (currX < 2 || currX >= width - 2 || currY < 2 || currY >= height - 2) break;

            const tx = Math.min(tensorField.sw - 1, Math.max(0, Math.floor(currX / scale)));
            const ty = Math.min(tensorField.sh - 1, Math.max(0, Math.floor(currY / scale)));
            const idx = ty * tensorField.sw + tx;

            let baseAngle = tensorField.angles[idx] || 0;
            const coh = tensorField.coherence[idx] || 0;

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

    drawMultiBristleStroke(ctx, points, baseHsl, scale, config) {
        ctx.save();

        const bristleCount = config.bristleCount;
        const primarySat = Math.min(100, Math.round(baseHsl.s * 130));
        const primaryLum = Math.round(baseHsl.l * 100);

        // Optik Renk Titreşimi (%15 ihtimalle mikro zıt renk kayması)
        let hueShiftBase = 0;
        if (config.vibration && Math.random() < 0.15) {
            hueShiftBase = Math.random() < 0.5 ? 20 : -20;
        }

        const baseLineWidth = Math.max(0.7 * scale, (config.brushWidth / bristleCount) * 1.2);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (let b = 0; b < bristleCount; b++) {
            const offsetFactor = (b / (bristleCount - 1) - 0.5) * config.brushWidth;

            const bristleLumShift = (Math.random() - 0.5) * 14;
            const bristleHueShift = (Math.random() - 0.5) * 8 + hueShiftBase;

            const bristleHue = (baseHsl.h + bristleHueShift + 360) % 360;
            const bristleLum = Math.max(0, Math.min(100, primaryLum + bristleLumShift));

            ctx.strokeStyle = `hsla(${bristleHue | 0}, ${primarySat | 0}%, ${bristleLum | 0}%, ${config.alpha})`;

            // Segment segment çizerek fırça baskı incelmesi (Tapering) uygulama
            for (let i = 0; i < points.length - 1; i++) {
                const p1 = points[i];
                const p2 = points[i + 1];

                const progress = i / (points.length - 1);
                const pressure = Math.sin(progress * Math.PI); // Başta/sonda ince, ortada kalın
                ctx.lineWidth = baseLineWidth * (0.4 + pressure * 0.6);

                let nx = 0, ny = 0;
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                nx = -dy / len;
                ny = dx / len;

                ctx.beginPath();
                ctx.moveTo(p1.x + nx * offsetFactor, p1.y + ny * offsetFactor);
                ctx.lineTo(p2.x + nx * offsetFactor, p2.y + ny * offsetFactor);
                ctx.stroke();
            }
        }

        // Çift Yönlü 3D Impasto Rölyefi
        if (config.impasto && scale > 0.8) {
            const offsetPx = 0.85 * scale;

            // 1. Gölge Kenarı (Gölgede kalan yağlı boya katmanı)
            ctx.strokeStyle = `rgba(0, 0, 0, ${config.alpha * 0.22})`;
            ctx.lineWidth = Math.max(0.5 * scale, config.brushWidth * 0.15);
            ctx.beginPath();
            for (let i = 0; i < points.length; i++) {
                const pt = points[i];
                if (i === 0) ctx.moveTo(pt.x + offsetPx, pt.y + offsetPx);
                else ctx.lineTo(pt.x + offsetPx, pt.y + offsetPx);
            }
            ctx.stroke();

            // 2. Işık Kenarı (Işık vuran parlak kuruma sırtı)
            ctx.strokeStyle = `rgba(255, 255, 255, ${config.alpha * 0.38})`;
            ctx.lineWidth = Math.max(0.5 * scale, config.brushWidth * 0.15);
            ctx.beginPath();
            for (let i = 0; i < points.length; i++) {
                const pt = points[i];
                if (i === 0) ctx.moveTo(pt.x - offsetPx, pt.y - offsetPx);
                else ctx.lineTo(pt.x - offsetPx, pt.y - offsetPx);
            }
            ctx.stroke();
        }

        ctx.restore();
    }

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