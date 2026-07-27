/**
 * @file TextGlitchEngine.js
 * @description Hatalı tipografi, VHS zaman damgası ve RGB kaymalı damga motoru.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class TextGlitchEngine {
    /**
     * @param {HTMLCanvasElement} sourceCanvas 
     * @param {string} text - Basılacak metin
     * @param {string} style - 'vhs', 'rgb_shift', 'stamp'
     * @param {number} fontSize - Font büyüklüğü (px)
     */
    render(sourceCanvas, text = 'SYSTEM ERROR', style = 'rgb_shift', fontSize = 42) {
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;

        const outputCanvas = canvasPool.getCanvas('text_output', w, h);
        const ctx = outputCanvas.getContext('2d');

        // Ana görseli alta çiz
        ctx.drawImage(sourceCanvas, 0, 0);

        if (!text || text.trim() === '') return outputCanvas;

        ctx.save();
        ctx.font = `900 ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const centerX = w / 2;
        const centerY = h / 2;

        if (style === 'vhs') {
            // 90'lar VHS Kaset Zaman Damgası
            ctx.font = `bold ${Math.floor(fontSize * 0.7)}px monospace`;
            ctx.textAlign = 'left';
            ctx.fillStyle = '#10b981';
            ctx.fillText(`PLAY ► ${text}`, 30, h - 40);

            // Yatay tarama çizgisi
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.fillRect(0, h - 45, w, 2);

        } else if (style === 'rgb_shift') {
            // RGB Chromatic Shift Tipografi
            const shift = Math.floor(fontSize * 0.12);

            // Kırmızı Katman (Sağa Kaymış)
            ctx.fillStyle = '#ff0055';
            ctx.fillText(text, centerX + shift, centerY);

            // Mavi/Camgöbeği Katman (Sola Kaymış)
            ctx.fillStyle = '#00f0ff';
            ctx.fillText(text, centerX - shift, centerY);

            // Ana Beyaz Katman
            ctx.fillStyle = '#ffffff';
            ctx.fillText(text, centerX, centerY);

        } else if (style === 'stamp') {
            // Fanzin / Gizli Belge Damgası
            ctx.translate(centerX, centerY);
            ctx.rotate(-12 * Math.PI / 180); // 12 Derece Eğik Damga

            ctx.strokeStyle = '#dc2626';
            ctx.lineWidth = 6;
            const textMetrics = ctx.measureText(text);
            const pad = 16;

            // Damga Çerçevesi
            ctx.strokeRect(
                -textMetrics.width / 2 - pad, 
                -fontSize / 2 - pad / 2, 
                textMetrics.width + pad * 2, 
                fontSize + pad
            );

            ctx.fillStyle = '#dc2626';
            ctx.fillText(text, 0, 0);
        }

        ctx.restore();
        return outputCanvas;
    }
}