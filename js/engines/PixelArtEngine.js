/**
 * @file PixelArtEngine.js
 * @description Piksel art dönüşümü ve retro konsol palet eşleme motoru.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class PixelArtEngine {
    constructor() {
        // Hazır Retro Renk Paletleri (RGB dizileri)
        this.palettes = {
            'gameboy': [
                [15, 56, 15],     // Koyu Yeşil
                [48, 98, 48],     // Orta Koyu Yeşil
                [139, 172, 15],   // Açık Yeşil
                [155, 188, 15]    // Parlak Sarı-Yeşil
            ],
            'gb-pocket': [
                [43, 43, 38],     // Koyu Gri / Siyah
                [112, 115, 96],   // Orta Koyu Gri
                [163, 166, 141],  // Açık Gri
                [212, 215, 193]   // Beyazımsı Zemin
            ],
            'cga': [
                [0, 0, 0],        // Siyah
                [85, 255, 255],   // Camgöbeği (Cyan)
                [255, 85, 255],   // Pembe (Magenta)
                [255, 255, 255]   // Beyaz
            ],
            'c64': [
                [0,0,0], [255,255,255], [136,0,0], [170,255,238],
                [204,68,204], [0,204,85], [0,0,170], [238,238,77],
                [221,136,85], [102,68,0], [255,119,119], [51,51,51],
                [119,119,119], [170,255,102], [0,136,255], [187,187,187]
            ],
            'cyberpunk': [
                [10, 10, 18],     // Koyu Gece Mavisı
                [255, 0, 127],    // Neon Pembe
                [0, 240, 255],    // Neon Camgöbeği
                [138, 43, 226]    // Parlak Mor
            ],
            'vaporwave': [
                [32, 14, 58],     // Derin Mor
                [255, 113, 206],  // Cırt Pembe
                [1, 205, 254],    // Turkuaz
                [255, 153, 102]   // Turuncu
            ]
        };
    }

    /**
     * En yakın palet rengini Öklid uzaklığı ile bulur.
     */
    _findNearestColor(r, g, b, palette) {
        let minDistance = Infinity;
        let nearest = palette[0];

        for (let i = 0; i < palette.length; i++) {
            const [pr, pg, pb] = palette[i];
            const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
            if (dist < minDistance) {
                minDistance = dist;
                nearest = palette[i];
            }
        }
        return nearest;
    }

    /**
     * @param {HTMLCanvasElement} sourceCanvas 
     * @param {number} pixelSize - Piksel kaba boyutu (Örn: 64, 128, 160)
     * @param {string} paletteKey - Palet adı ('gameboy', 'cga', 'cyberpunk' vb.)
     */
    render(sourceCanvas, pixelSize = 128, paletteKey = 'gameboy') {
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;

        // 1. Adım: Küçük çözünürlüklü geçici tuvale küçült
        const scale = pixelSize / Math.max(w, h);
        const smallW = Math.max(16, Math.floor(w * scale));
        const smallH = Math.max(16, Math.floor(h * scale));

        const smallCanvas = canvasPool.getCanvas('pixel_small', smallW, smallH);
        const smallCtx = smallCanvas.getContext('2d');
        
        smallCtx.imageSmoothingEnabled = false;
        smallCtx.drawImage(sourceCanvas, 0, 0, smallW, smallH);

        // 2. Adım: Renkleri seçilen palete zorla
        const palette = this.palettes[paletteKey] || this.palettes['gameboy'];
        const imgData = smallCtx.getImageData(0, 0, smallW, smallH);
        const data = imgData.data;

        for (let i = 0; i < data.length; i += 4) {
            const [nr, ng, nb] = this._findNearestColor(data[i], data[i + 1], data[i + 2], palette);
            data[i] = nr;
            data[i + 1] = ng;
            data[i + 2] = nb;
        }
        smallCtx.putImageData(imgData, 0, 0);

        // 3. Adım: Orijinal boyuta keskinleşmiş piksellerle geri büyüt
        const outputCanvas = canvasPool.getCanvas('pixel_output', w, h);
        const outCtx = outputCanvas.getContext('2d');
        
        outCtx.imageSmoothingEnabled = false; // Blurlanmayı engeller
        outCtx.drawImage(smallCanvas, 0, 0, smallW, smallH, 0, 0, w, h);

        return outputCanvas;
    }
}