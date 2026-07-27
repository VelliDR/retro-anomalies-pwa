/**
 * @file AsciiMatrixEngine.js
 * @description ASCII karakter sanat, Matrix terminal ve metin matris motoru.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class AsciiMatrixEngine {
    constructor() {
        this.charSets = {
            'density': ' .:-=+*#%@',
            'binary': '01',
            'hex': '0123456789ABCDEF'
        };
    }

    /**
     * @param {HTMLCanvasElement} sourceCanvas 
     * @param {string} charSetKey - 'density', 'binary', 'hex' veya Özel Metin
     * @param {string} colorMode - 'matrix' (Yeşil), 'amber' (Turuncu), 'fullcolor'
     * @param {number} fontSize - Karakter boyutu (px)
     */
    render(sourceCanvas, charSetKey = 'density', colorMode = 'matrix', fontSize = 10) {
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;

        const outputCanvas = canvasPool.getCanvas('ascii_output', w, h);
        const ctx = outputCanvas.getContext('2d');

        // Arka Plan
        ctx.fillStyle = '#050805';
        ctx.fillRect(0, 0, w, h);

        const srcCtx = sourceCanvas.getContext('2d');
        const imgData = srcCtx.getImageData(0, 0, w, h);
        const d = imgData.data;

        ctx.font = `bold ${fontSize}px monospace`;
        ctx.textBaseline = 'top';

        const chars = this.charSets[charSetKey] || charSetKey || ' .:-=+*#%@';
        let customCharIdx = 0;

        for (let y = 0; y < h; y += fontSize) {
            for (let x = 0; x < w; x += fontSize) {
                const i = (y * w + x) * 4;
                const r = d[i];
                const g = d[i + 1];
                const b = d[i + 2];
                const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

                // Karakter Seçimi
                let charToDraw = '';
                if (this.charSets[charSetKey]) {
                    const charIdx = Math.floor(lum * (chars.length - 1));
                    charToDraw = chars[charIdx];
                } else {
                    // Kullanıcının girdiği özel metin döngüsü
                    charToDraw = chars[customCharIdx % chars.length];
                    customCharIdx++;
                }

                // Renk Modu Seçimi
                if (colorMode === 'matrix') {
                    ctx.fillStyle = `rgb(0, ${Math.floor(lum * 255)}, 65)`;
                } else if (colorMode === 'amber') {
                    ctx.fillStyle = `rgb(${Math.floor(lum * 255)}, ${Math.floor(lum * 140)}, 0)`;
                } else {
                    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                }

                ctx.fillText(charToDraw, x, y);
            }
        }

        return outputCanvas;
    }
}