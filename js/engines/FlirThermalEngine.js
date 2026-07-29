/**
 * @file FlirThermalEngine.js
 * @description Askeri/Endüstriyel FLIR Termal Kamera ve Gece Görüş Motoru.
 * LUT (Look-Up Table) ön-hesaplaması, Termal Isı Yayılımı (Heat Bloom) ve Askeri Optik Vinjet içerir.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class FlirThermalEngine {
    constructor() {
        this.lutCache = {};
    }

    /**
     * 0-255 arasındaki 256 parlaklık seviyesi için renk tablosunu (LUT) önceden oluşturur.
     */
    _getLUT(mode) {
        // Hatalı/NaN mod gelirse varsayılana çek
        const activeMode = (typeof mode === 'string' && mode) ? mode : 'ironbow';

        if (this.lutCache[activeMode]) {
            return this.lutCache[activeMode];
        }

        const lut = new Uint8Array(256 * 3);

        for (let i = 0; i < 256; i++) {
            const norm = i / 255;
            let r = 0, g = 0, b = 0;

            if (activeMode === 'emerald') {
                // Gece Görüşü / Emerald Phosphor (Askeri Gen 3)
                if (norm < 0.5) {
                    const t = norm / 0.5;
                    r = Math.floor(t * 15);
                    g = Math.floor(t * 180);
                    b = Math.floor(t * 30);
                } else {
                    const t = (norm - 0.5) / 0.5;
                    r = Math.floor(15 + t * 240);
                    g = Math.floor(180 + t * 75);
                    b = Math.floor(30 + t * 225);
                }
            } else if (activeMode === 'rainbow') {
                // High-Contrast Thermal Rainbow Spectrum
                const h = (1 - norm) * 240; // 240 (Mavi) -> 0 (Kırmızı)
                const rgb = this._hslToRgb(h / 360, 1.0, 0.5);
                r = rgb[0]; g = rgb[1]; b = rgb[2];
            } else {
                // Ironbow (Klasik FLIR: Siyah/Lacivert -> Mor -> Kırmızı -> Sarı -> Beyaz)
                if (norm < 0.25) {
                    const t = norm / 0.25;
                    r = Math.floor(t * 45);
                    g = 0;
                    b = Math.floor(80 + t * 100);
                } else if (norm < 0.25) {
                    const t = (norm - 0.25) / 0.25;
                    r = Math.floor(45 + t * 180);
                    g = Math.floor(t * 30);
                    b = Math.floor(180 - t * 180);
                } else if (norm < 0.75) {
                    const t = (norm - 0.5) / 0.25;
                    r = Math.floor(225 + t * 30);
                    g = Math.floor(30 + t * 195);
                    b = 0;
                } else {
                    const t = (norm - 0.75) / 0.25;
                    r = 255;
                    g = Math.floor(225 + t * 30);
                    b = Math.floor(t * 255);
                }
            }

            lut[i * 3]     = r;
            lut[i * 3 + 1] = g;
            lut[i * 3 + 2] = b;
        }

        this.lutCache[activeMode] = lut;
        return lut;
    }

    _hslToRgb(h, s, l) {
        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = this._hueToRgb(p, q, h + 1/3);
            g = this._hueToRgb(p, q, h);
            b = this._hueToRgb(p, q, h - 1/3);
        }
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    _hueToRgb(p, q, t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
    }

    render(sourceCanvas, mode = 'ironbow') {
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;

        const maxDim = Math.max(w, h);
        const scale = maxDim / 1200;

        const outputCanvas = canvasPool.getCanvas('flir_output', w, h);
        const ctx = outputCanvas.getContext('2d');

        const srcCtx = sourceCanvas.getContext('2d');
        const imgData = srcCtx.getImageData(0, 0, w, h);
        const data = imgData.data;

        const lut = this._getLUT(mode);

        for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            if (a < 10) continue;

            const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            const lutIdx = lum * 3;

            data[i]     = lut[lutIdx];
            data[i + 1] = lut[lutIdx + 1];
            data[i + 2] = lut[lutIdx + 2];
        }

        ctx.putImageData(imgData, 0, 0);

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.20;
        const blurPx = Math.max(2, Math.round(5 * scale));
        ctx.filter = `blur(${blurPx}px)`;
        ctx.drawImage(outputCanvas, 0, 0);
        ctx.restore();

        ctx.save();
        const radGrad = ctx.createRadialGradient(
            w / 2, h / 2, Math.min(w, h) * 0.42,
            w / 2, h / 2, Math.max(w, h) * 0.70
        );
        radGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        radGrad.addColorStop(1, 'rgba(0, 0, 0, 0.65)');

        ctx.fillStyle = radGrad;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();

        return outputCanvas;
    }
}