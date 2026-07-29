/**
 * @file TextGlitchEngine.js
 * @description Hatalı Tipografi, VHS Zaman Damgası ve Yıpranmış Mühür Motoru.
 * Çözünürlükten bağımsız oranlama, okunabilirlik astarı ve otantik mühür gürültüsü içerir.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class TextGlitchEngine {
    /**
     * @param {HTMLCanvasElement} sourceCanvas 
     * @param {string} text - Basılacak metin
     * @param {string} style - 'vhs', 'rgb_shift', 'stamp'
     * @param {number} fontSize - Font büyüklüğü (px, app.js scaleFactor ile çarpılarak gelir)
     */
    render(sourceCanvas, text = 'SYSTEM ERROR', style = 'rgb_shift', fontSize = 42) {
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;

        const maxDim = Math.max(w, h);
        const scale = maxDim / 1200;

        const outputCanvas = canvasPool.getCanvas('text_output', w, h);
        const ctx = outputCanvas.getContext('2d');

        // Ana görseli alta çiz
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(sourceCanvas, 0, 0);

        if (!text || text.trim() === '') return outputCanvas;

        const fSize = Math.max(14, Math.round(fontSize));

        ctx.save();

        if (style === 'vhs') {
            // 1. MOD: 90'lar VHS KASET ZAMAN DAMGASI (OTANTİK OSD)
            const vhsFontSize = Math.max(12, Math.round(fSize * 0.75));
            ctx.font = `bold ${vhsFontSize}px "Courier New", Courier, monospace`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';

            const posX = Math.round(w * 0.05);
            const posY = Math.round(h - (h * 0.08));
            const displayText = `PLAY ► ${text.toUpperCase()}`;

            // Her arka planda okunabilirlik için Siyah Gölge Astarı
            ctx.fillStyle = '#000000';
            ctx.fillText(displayText, posX + 2, posY + 2);

            // VHS Fosfor Yeşili / Camgöbeği Metin
            ctx.fillStyle = '#00ffcc';
            ctx.fillText(displayText, posX, posY);

            // VHS Cızırtı Çizgisi (Tracking Line)
            const lineY = posY - Math.round(vhsFontSize * 0.4);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.fillRect(0, lineY, w, Math.max(1, Math.round(2 * scale)));

        } else if (style === 'rgb_shift') {
            // 2. MOD: RGB CHROMATIC SHIFT TİPOGRAFİ
            ctx.font = `900 ${fSize}px "Impact", "Arial Black", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const centerX = w / 2;
            const centerY = h / 2;
            const shift = Math.max(2, Math.round(fSize * 0.12));

            // Parlak zeminlerde okunabilirlik için arka plan siyah gölgesi
            ctx.fillStyle = 'rgba(0, 0, 0, 0.70)';
            ctx.fillText(text, centerX + 3, centerY + 3);

            // Kırmızı Katman (Sağa Kaymış)
            ctx.fillStyle = '#ff0055';
            ctx.fillText(text, centerX + shift, centerY);

            // Mavi / Camgöbeği Katman (Sola Kaymış)
            ctx.fillStyle = '#00f0ff';
            ctx.fillText(text, centerX - shift, centerY);

            // Ana Beyaz Katman
            ctx.fillStyle = '#ffffff';
            ctx.fillText(text, centerX, centerY);

            // Metin Üzerinden Geçen Mikro Glitch Kesikleri
            const sliceY = centerY - fSize * 0.2;
            const sliceH = Math.max(2, Math.round(fSize * 0.15));
            const sliceShift = Math.round(fSize * 0.15);

            ctx.drawImage(
                outputCanvas,
                centerX - (w * 0.4), sliceY, w * 0.8, sliceH,
                centerX - (w * 0.4) + sliceShift, sliceY, w * 0.8, sliceH
            );

        } else if (style === 'stamp') {
            // 3. MOD: YIPRANMIŞ KAUÇUK MÜHÜR / FANZİN DAMGASI
            const centerX = w / 2;
            const centerY = h / 2;

            ctx.translate(centerX, centerY);
            ctx.rotate(-12 * Math.PI / 180); // 12 Derece Eğik Damga

            ctx.font = `900 ${fSize}px "Impact", "Arial Black", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const metrics = ctx.measureText(text);
            const padX = Math.round(fSize * 0.4);
            const padY = Math.round(fSize * 0.2);
            const boxW = metrics.width + padX * 2;
            const boxH = fSize + padY * 2;
            const borderW = Math.max(3, Math.round(fSize * 0.1));

            // Mühür Çerçevesi
            ctx.strokeStyle = '#dc2626';
            ctx.lineWidth = borderW;
            ctx.strokeRect(-boxW / 2, -boxH / 2, boxW, boxH);

            // Mühür Metni
            ctx.fillStyle = '#dc2626';
            ctx.fillText(text, 0, 0);

            // Yıpranmış Kauçuk Mürekkep Lekesi Dokusu (Erosion)
            // Damga üzerinden mikro parçalar silinerek yıpranmış hissi verilir
            ctx.globalCompositeOperation = 'destination-out';
            const dotCount = Math.floor((boxW * boxH) * 0.012);

            for (let d = 0; d < dotCount; d++) {
                const rx = (Math.random() - 0.5) * boxW;
                const ry = (Math.random() - 0.5) * boxH;
                const rRadius = Math.random() * (2.5 * scale) + 0.5;

                ctx.beginPath();
                ctx.arc(rx, ry, rRadius, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
        return outputCanvas;
    }
}