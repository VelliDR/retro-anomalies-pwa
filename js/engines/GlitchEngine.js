/**
 * @file GlitchEngine.js (Spider-Verse Dynamic Color Shards)
 * @description Sabit neon palet yerine, üstüne bindiği piksele bağlı rastgele 
 *              yakın/uzak HSL renkleri üreten dinamik cam kırığı anomali motoru.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class GlitchEngine {
    constructor() {
        this.benDayPattern = null;
    }

    _getBenDayPattern(ctx, scale) {
        if (!this.benDayPattern) {
            const size = Math.max(4, Math.round(5 * scale));
            const patCanvas = canvasPool.getCanvas('benday_pattern', size, size);
            const patCtx = patCanvas.getContext('2d');
            
            patCtx.clearRect(0, 0, size, size);
            patCtx.fillStyle = '#1e1e24';
            patCtx.beginPath();
            patCtx.arc(size / 2, size / 2, size / 4.5, 0, Math.PI * 2);
            patCtx.fill();

            this.benDayPattern = ctx.createPattern(patCanvas, 'repeat');
        }
        return this.benDayPattern;
    }

    /**
     * RGB piksel verisini HSL renk uzayına çevirir
     */
    _rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0, l = (max + min) / 2;

        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h: h * 360, s: s * 100, l: l * 100 };
    }

    render(sourceCanvas, intensity = 40) {
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;
        const maxDim = Math.max(w, h);
        const scale = maxDim / 1200;
        const normIntensity = Math.min(1.0, Math.max(0.05, intensity / 100));

        const outputCanvas = canvasPool.getCanvas('glitch_output', w, h);
        const ctx = outputCanvas.getContext('2d');
        const srcCtx = sourceCanvas.getContext('2d');

        // 1. ADIM: Temel Görsel Çizimi
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(sourceCanvas, 0, 0);

        // 2. ADIM: SİYAH MÜREKKEP AYRIŞTIRMASI (%100 GPU - CSS Filter)
        if (normIntensity > 0.1) {
            const inkCanvas = canvasPool.getCanvas('glitch_ink', w, h);
            const inkCtx = inkCanvas.getContext('2d');

            inkCtx.clearRect(0, 0, w, h);
            inkCtx.filter = 'grayscale(100%) contrast(300%) brightness(90%)';
            inkCtx.drawImage(sourceCanvas, 0, 0);
            inkCtx.filter = 'none';

            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            ctx.globalAlpha = 0.45 * normIntensity;
            const inkShiftX = (Math.random() - 0.5) * 24 * normIntensity * scale;
            const inkShiftY = (Math.random() - 0.5) * 14 * normIntensity * scale;
            ctx.drawImage(inkCanvas, inkShiftX, inkShiftY);
            ctx.restore();
        }

        // 3. ADIM: YUMUŞATILMIŞ CMYK MATBAA RENK KAYMASI
        const shiftPx = Math.round((6 + normIntensity * 22) * scale);
        ctx.save();
        ctx.globalCompositeOperation = 'darken';
        ctx.globalAlpha = 0.30 * normIntensity;
        ctx.drawImage(sourceCanvas, -shiftPx, shiftPx * 0.2);
        ctx.drawImage(sourceCanvas, shiftPx, -shiftPx * 0.2);
        ctx.restore();

        // 4. ADIM: DİNAMİK PİKSEL RENKLİ CAM KIRIKLARI
        const shardCount = Math.floor(3 + normIntensity * 6);
        const maxShift = w * 0.20 * normIntensity;

        for (let i = 0; i < shardCount; i++) {
            const cx = (0.15 + Math.random() * 0.7) * w;
            const cy = (0.15 + Math.random() * 0.7) * h;
            
            const shardW = (0.25 + Math.random() * 0.35) * w;
            const shardH = (0.15 + Math.random() * 0.25) * h;

            const shiftX = (Math.random() - 0.5) * maxShift;
            const shiftY = (Math.random() - 0.5) * (maxShift * 0.4);

            // A. Denk gelen merkez piksel rengini oku
            const sampleX = Math.min(w - 1, Math.max(0, Math.floor(cx)));
            const sampleY = Math.min(h - 1, Math.max(0, Math.floor(cy)));
            const pxData = srcCtx.getImageData(sampleX, sampleY, 1, 1).data;
            const baseHsl = this._rgbToHsl(pxData[0], pxData[1], pxData[2]);

            // B. Rastgele Yakın (±20°) veya Uzak / Komplementer (120°-240°) Renk Sapması
            const isFarColor = Math.random() < 0.5;
            const hueShift = isFarColor 
                ? (120 + Math.random() * 120) 
                : ((Math.random() - 0.5) * 40);

            const dynamicHue = Math.round((baseHsl.h + hueShift + 360) % 360);
            const dynamicSat = Math.round(Math.max(40, Math.min(100, baseHsl.s + (Math.random() - 0.5) * 30)));
            const dynamicLum = Math.round(Math.max(30, Math.min(80, baseHsl.l + (Math.random() - 0.5) * 30)));

            const dynamicColorStr = `hsl(${dynamicHue}, ${dynamicSat}%, ${dynamicLum}%)`;

            ctx.save();
            ctx.beginPath();

            // Düzensiz 4-5 köşeli keskin cam kırığı
            const hw = shardW * 0.5;
            const hh = shardH * 0.5;
            ctx.moveTo(cx - hw + (Math.random() - 0.5) * hw * 0.4, cy - hh + (Math.random() - 0.5) * hh * 0.4);
            ctx.lineTo(cx + hw + (Math.random() - 0.5) * hw * 0.4, cy - hh * 0.5 + (Math.random() - 0.5) * hh * 0.4);
            ctx.lineTo(cx + hw * 0.8 + (Math.random() - 0.5) * hw * 0.4, cy + hh + (Math.random() - 0.5) * hh * 0.4);
            ctx.lineTo(cx - hw * 0.7 + (Math.random() - 0.5) * hw * 0.4, cy + hh * 0.8 + (Math.random() - 0.5) * hh * 0.4);
            ctx.closePath();
            ctx.clip();

            // C. Kaydırılmış kırık parçayı çiz
            ctx.drawImage(sourceCanvas, shiftX, shiftY);

            // D. Dinamik Renk Tonlama (Difference harmanlaması ile)
            ctx.globalCompositeOperation = 'difference';
            ctx.globalAlpha = 0.50;
            ctx.fillStyle = dynamicColorStr;
            ctx.fillRect(cx - shardW, cy - shardH, shardW * 2, shardH * 2);

            // E. Kenar Konturu (Türetilen dinamik renk ile)
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 0.90;
            ctx.strokeStyle = dynamicColorStr;
            ctx.lineWidth = Math.max(2, Math.round(2.5 * scale));
            ctx.stroke();

            ctx.restore();
        }

        // 5. ADIM: BEN-DAY MATBAA TRAM NOKTALARI
        if (normIntensity > 0.2) {
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            ctx.globalAlpha = 0.12 * normIntensity;
            ctx.fillStyle = this._getBenDayPattern(ctx, scale);
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        }

        return outputCanvas;
    }
}