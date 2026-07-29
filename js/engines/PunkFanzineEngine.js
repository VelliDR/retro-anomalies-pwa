/**
 * @file PunkFanzineEngine.js
 * @description Kötü fotokopi, Xerox toner gürültüsü, açık tarayıcı kapağı ve fanzin estetiği motoru.
 * Çözünürlükten bağımsız ölçekleme, otantik toner topaklanması ve kirli kağıt tonlaması içerir.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class PunkFanzineEngine {
    /**
     * @param {HTMLCanvasElement} sourceCanvas 
     * @param {number} contrastBoost - Kontrast sertliği (1.0 - 4.0)
     * @param {number} tonerNoise - Toner leke ve kirlilik miktarı (0 - 100)
     */
    render(sourceCanvas, contrastBoost = 2.5, tonerNoise = 40) {
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;

        const maxDim = Math.max(w, h);
        const scale = maxDim / 1200;

        const outputCanvas = canvasPool.getCanvas('fanzine_output', w, h);
        const ctx = outputCanvas.getContext('2d');

        const srcCtx = sourceCanvas.getContext('2d');
        const imgData = srcCtx.getImageData(0, 0, w, h);
        const d = imgData.data;

        const normNoise = tonerNoise / 100;

        // 1. ADIM: YÜKSEK KONTRAST VE TONER KÜMELEME DÖNÜŞÜMÜ
        for (let i = 0; i < d.length; i += 4) {
            const a = d[i + 3];
            if (a < 10) continue;

            let lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

            // Sert Sigmoidal Kontrast Eğrisi (Aşırı Siyah / Aşırı Beyaz)
            lum = (lum - 128) * contrastBoost + 128;

            // Xerox Toner Topaklanma Gürültüsü (Mikro & Makro Karışım)
            const microNoise = (Math.random() - 0.5) * normNoise * 75;
            const clumpNoise = (Math.random() > 0.94) ? (Math.random() - 0.5) * normNoise * 140 : 0;
            
            lum += microNoise + clumpNoise;

            // Otantik Fotokopi Renkleri: Karbon Siyahı (#141414) veya Kirli Kağıt (#E4E0D7)
            if (lum < 125) {
                d[i]     = 20;  // Charcoal R
                d[i + 1] = 20;  // Charcoal G
                d[i + 2] = 20;  // Charcoal B
            } else {
                // Kağıt Dokusu Mikrogürültüsü
                const paperGrain = (Math.random() - 0.5) * 12;
                d[i]     = Math.min(255, Math.max(0, 228 + paperGrain)); // Paper R
                d[i + 1] = Math.min(255, Math.max(0, 224 + paperGrain)); // Paper G
                d[i + 2] = Math.min(255, Math.max(0, 215 + paperGrain)); // Paper B
            }
        }

        ctx.putImageData(imgData, 0, 0);

        // 2. ADIM: DİKEY XEROX TAMBUR ÇİZGİLERİ (Toner Streaks)
        if (normNoise > 0.15) {
            const streakCount = Math.floor((2 + normNoise * 6) * scale);
            ctx.fillStyle = 'rgba(20, 20, 20, 0.12)';

            for (let s = 0; s < streakCount; s++) {
                const streakX = Math.floor(Math.random() * w);
                const streakW = Math.max(1, Math.round((1 + Math.random() * 3) * scale));
                ctx.fillRect(streakX, 0, streakW, h);
            }
        }

        // 3. ADIM: AÇIK FOTOKOPİ KAPAĞI KENAR YANMASI (Open Lid Edge Burn)
        ctx.save();
        const radGrad = ctx.createRadialGradient(
            w / 2, h / 2, Math.min(w, h) * 0.35,
            w / 2, h / 2, Math.max(w, h) * 0.68
        );
        radGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        radGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.20)');
        radGrad.addColorStop(1, 'rgba(0, 0, 0, 0.75)');

        ctx.fillStyle = radGrad;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();

        return outputCanvas;
    }
}