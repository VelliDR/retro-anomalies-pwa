/**
 * @file TextOverlayEngine.js
 * @description Pop-art tipografi, 3D metin gölgeleri ve çizgi roman kapağı katmanı.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class TextOverlayEngine {
    /**
     * @param {HTMLCanvasElement} targetCanvas 
     * @param {string} text - "THWIP!", "BOOM!", "ANOMALY!" vb.
     * @param {Object} options - Metin konumu, boyutu ve renk konfigürasyonu
     */
    renderOnomatopoeia(targetCanvas, text = 'THWIP!', options = {}) {
        const w = targetCanvas.width;
        const h = targetCanvas.height;
        const scale = Math.max(w, h) / 1200;

        const ctx = targetCanvas.getContext('2d');
        const fontSize = Math.round((options.fontSize || 90) * scale);
        const x = options.x || w * 0.5;
        const y = options.y || h * 0.3;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((options.rotation || -0.12));

        ctx.font = `900 ${fontSize}px "Impact", "Bangers", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 1. 3D Pop-Art Katmanlı Gölge
        const shadowDepth = Math.round(8 * scale);
        for (let i = shadowDepth; i > 0; i--) {
            ctx.fillStyle = '#000000';
            ctx.fillText(text, i, i);
        }

        // 2. Neon / Renk İç Dolgusu
        ctx.fillStyle = options.color || '#ffe600';
        ctx.fillText(text, 0, 0);

        // 3. Sert Çizgi Roman Konturu
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.max(2, Math.round(4 * scale));
        ctx.strokeText(text, 0, 0);

        ctx.restore();
    }

    /**
     * Çizgi Roman Kapak Çerçevesi Katmanı (Issue #42 & Barcode)
     */
    renderComicFrame(targetCanvas) {
        const w = targetCanvas.width;
        const h = targetCanvas.height;
        const scale = Math.max(w, h) / 1200;
        const ctx = targetCanvas.getContext('2d');

        ctx.save();
        // Köşe Rozeti
        ctx.fillStyle = '#ff0055';
        ctx.fillRect(20 * scale, 20 * scale, 110 * scale, 50 * scale);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(18 * scale)}px sans-serif`;
        ctx.fillText('MARVEL', 30 * scale, 40 * scale);
        ctx.font = `bold ${Math.round(14 * scale)}px sans-serif`;
        ctx.fillText('#42 APPROVED', 30 * scale, 60 * scale);

        ctx.restore();
    }
}