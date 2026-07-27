/**
 * @file FlirThermalEngine.js
 * @description Askeri/Endüstriyel FLIR Termal Kamera ve Gece Görüş simülatörü.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class FlirThermalEngine {
    /**
     * Parlaklığa (0 - 255) denk gelen renk tayfını hesaplar.
     */
    _getThermalColor(luminance, mode = 'ironbow') {
        const norm = luminance / 255; // 0.0 - 1.0

        if (mode === 'emerald') {
            // Gece Görüşü: Siyah -> Koyu Yeşil -> Parlak Yeşil -> Beyaz
            if (norm < 0.5) {
                return [0, Math.floor(norm * 2 * 180), 0];
            } else {
                const t = (norm - 0.5) * 2;
                return [Math.floor(t * 220), 180 + Math.floor(t * 75), Math.floor(t * 220)];
            }
        }

        if (mode === 'rainbow') {
            // Gökkuşağı Sıcaklık Tayfı
            const h = (1 - norm) * 240; // 240 (Mavi) -> 0 (Kırmızı)
            return this._hslToRgb(h / 360, 1.0, 0.5);
        }

        // Varsayılan: Ironbow (Lacivert -> Mor -> Kırmızı -> Sarı -> Beyaz)
        if (norm < 0.25) {
            const t = norm / 0.25;
            return [Math.floor(t * 40), 0, 80 + Math.floor(t * 100)];
        } else if (norm < 0.5) {
            const t = (norm - 0.25) / 0.25;
            return [40 + Math.floor(t * 180), 0, 180 - Math.floor(t * 180)];
        } else if (norm < 0.75) {
            const t = (norm - 0.5) / 0.25;
            return [220 + Math.floor(t * 35), Math.floor(t * 220), 0];
        } else {
            const t = (norm - 0.75) / 0.25;
            return [255, 220 + Math.floor(t * 35), Math.floor(t * 255)];
        }
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

    /**
     * @param {HTMLCanvasElement} sourceCanvas 
     * @param {string} mode - 'ironbow', 'rainbow', 'emerald'
     */
    render(sourceCanvas, mode = 'ironbow') {
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;

        const outputCanvas = canvasPool.getCanvas('flir_output', w, h);
        const ctx = outputCanvas.getContext('2d');

        const srcCtx = sourceCanvas.getContext('2d');
        const imgData = srcCtx.getImageData(0, 0, w, h);
        const data = imgData.data;

        for (let i = 0; i < data.length; i += 4) {
            // Algılanan parlaklık (Luminance)
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            const [tr, tg, tb] = this._getThermalColor(lum, mode);

            data[i] = tr;
            data[i + 1] = tg;
            data[i + 2] = tb;
        }

        ctx.putImageData(imgData, 0, 0);
        return outputCanvas;
    }
}