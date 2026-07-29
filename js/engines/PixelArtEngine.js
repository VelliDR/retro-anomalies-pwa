/**
 * @file PixelArtEngine.js
 * @description Piksel Art dönüşümü, Redmean Algısal Renk Eşleme ve Bayer Dithering motoru.
 * Çözünürlükten bağımsız ölçekleme ve otantik retro konsol paletleri içerir.
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
                [10, 10, 18],     // Koyu Gece Mavisi
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

        // 4x4 Bayer Dithering Matrisi (Retro Gölgelendirme Noktaları)
        this.bayerMatrix4x4 = [
            [ 0,  8,  2, 10],
            [12,  4, 14,  6],
            [ 3, 11,  1,  9],
            [15,  7, 13,  5]
        ];
    }

    /**
     * İnsan gözünün renk hassasiyetine göre ayarlanmış Redmean Algısal Renk Mesafesi.
     */
    _findNearestColorPerceptual(r, g, b, palette) {
        let minDistance = Infinity;
        let nearest = palette[0];

        for (let i = 0; i < palette.length; i++) {
            const [pr, pg, pb] = palette[i];
            
            // Redmean renk mesafesi formülü
            const meanR = (r + pr) / 2;
            const dR = r - pr;
            const dG = g - pg;
            const dB = b - pb;

            const dist = (2 + meanR / 256) * dR * dR +
                         4 * dG * dG +
                         (2 + (255 - meanR) / 256) * dB * dB;

            if (dist < minDistance) {
                minDistance = dist;
                nearest = palette[i];
            }
        }
        return nearest;
    }

    /**
     * @param {HTMLCanvasElement} sourceCanvas 
     * @param {number} pixelSize - Piksel kaba boyutu (app.js scaleFactor ile çarpılarak gelir)
     * @param {string} paletteKey - Palet adı ('gameboy', 'cga', 'cyberpunk' vb.)
     */
    render(sourceCanvas, pixelSize = 128, paletteKey = 'gameboy') {
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;

        // 1. ADIM: Yumuşak Ortalama ile Geçici Küçük Tuvale Küçült
        const targetDim = Math.max(16, Math.min(w, Math.round(pixelSize)));
        const scale = targetDim / Math.max(w, h);
        const smallW = Math.max(8, Math.floor(w * scale));
        const smallH = Math.max(8, Math.floor(h * scale));

        const smallCanvas = canvasPool.getCanvas('pixel_small', smallW, smallH);
        const smallCtx = smallCanvas.getContext('2d');
        
        // Küçültürken detay kaybolmaması için yumuşatma AÇIK tutulur
        smallCtx.imageSmoothingEnabled = true;
        smallCtx.imageSmoothingQuality = 'high';
        smallCtx.drawImage(sourceCanvas, 0, 0, smallW, smallH);

        // 2. ADIM: Algısal Renk Paleti ve Dithering Uygulama
        const palette = this.palettes[paletteKey] || this.palettes['gameboy'];
        const imgData = smallCtx.getImageData(0, 0, smallW, smallH);
        const data = imgData.data;

        const isLowColorPalette = palette.length <= 6; // GameBoy, CGA gibi az renkli paletlerde dithering açılır

        for (let y = 0; y < smallH; y++) {
            for (let x = 0; x < smallW; x++) {
                const i = (y * smallW + x) * 4;

                let r = data[i];
                let g = data[i + 1];
                let b = data[i + 2];

                // Az renkli paletlerde Bayer Dithering Gürültüsü Ekle
                if (isLowColorPalette) {
                    const bayerValue = (this.bayerMatrix4x4[y % 4][x % 4] / 16.0) - 0.5;
                    const ditherSpread = 28; // Noktalanma şiddeti
                    r = Math.min(255, Math.max(0, r + bayerValue * ditherSpread));
                    g = Math.min(255, Math.max(0, g + bayerValue * ditherSpread));
                    b = Math.min(255, Math.max(0, b + bayerValue * ditherSpread));
                }

                const [nr, ng, nb] = this._findNearestColorPerceptual(r, g, b, palette);
                data[i]     = nr;
                data[i + 1] = ng;
                data[i + 2] = nb;
            }
        }
        smallCtx.putImageData(imgData, 0, 0);

        // 3. ADIM: Orijinal Boyuta Keskinleştirilmiş Piksellerle Geri Büyüt
        const outputCanvas = canvasPool.getCanvas('pixel_output', w, h);
        const outCtx = outputCanvas.getContext('2d');
        
        // Büyütürken piksel bloklarını korumak için yumuşatma KAPATILIR
        outCtx.imageSmoothingEnabled = false;
        outCtx.webkitImageSmoothingEnabled = false;
        outCtx.mozImageSmoothingEnabled = false;
        outCtx.msImageSmoothingEnabled = false;

        outCtx.drawImage(smallCanvas, 0, 0, smallW, smallH, 0, 0, w, h);

        return outputCanvas;
    }
}