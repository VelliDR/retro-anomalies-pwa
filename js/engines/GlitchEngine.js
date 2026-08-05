/**
 * @file GlitchEngine.js (Spider-Verse Ultimate Edition)
 * @description Çift renkli kromatik konturlar, kırık içi hız çizgileri,
 *              hayalet iz (frame-skip), lokal Ben-Day maskelemesi ve haptic geribildirim.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class GlitchEngine {
    constructor() {
        this.benDayPattern = null;
    }

    /**
     * Çizgi roman Ben-Day matbaa noktaları deseni (Önbellekli)
     */
    _getBenDayPattern(ctx, scale) {
        if (!this.benDayPattern) {
            const size = Math.max(4, Math.round(5 * scale));
            const patCanvas = canvasPool.getCanvas('benday_pattern', size, size);
            const patCtx = patCanvas.getContext('2d');
            
            patCtx.clearRect(0, 0, size, size);
            patCtx.fillStyle = '#111116';
            patCtx.beginPath();
            patCtx.arc(size / 2, size / 2, size / 4.2, 0, Math.PI * 2);
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

    /**
     * Mobil cihazlarda hafif titreşim geribildirimi tetikler
     */
    _triggerHaptic(normIntensity) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            const duration = Math.min(25, Math.floor(normIntensity * 20));
            navigator.vibrate(duration);
        }
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

        // Haptic geribildirim tetikle
        this._triggerHaptic(normIntensity);

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

        // 4. ADIM: GELİŞMİŞ CAM KIRIKLARI (Ghosting, Speed Lines, Dual Chromatic & Masked Ben-Day)
        const shardCount = Math.floor(3 + normIntensity * 6);
        const maxShift = w * 0.20 * normIntensity;

        for (let i = 0; i < shardCount; i++) {
            const cx = (0.15 + Math.random() * 0.7) * w;
            const cy = (0.15 + Math.random() * 0.7) * h;
            
            const shardW = (0.25 + Math.random() * 0.35) * w;
            const shardH = (0.15 + Math.random() * 0.25) * h;

            const shiftX = (Math.random() - 0.5) * maxShift;
            const shiftY = (Math.random() - 0.5) * (maxShift * 0.4);

            // A. Denk gelen merkez piksel renginden HSL türet
            const sampleX = Math.min(w - 1, Math.max(0, Math.floor(cx)));
            const sampleY = Math.min(h - 1, Math.max(0, Math.floor(cy)));
            const pxData = srcCtx.getImageData(sampleX, sampleY, 1, 1).data;
            const baseHsl = this._rgbToHsl(pxData[0], pxData[1], pxData[2]);

            const isFarColor = Math.random() < 0.5;
            const hueShift = isFarColor ? (120 + Math.random() * 120) : ((Math.random() - 0.5) * 40);

            const dynamicHue = Math.round((baseHsl.h + hueShift + 360) % 360);
            const dynamicSat = Math.round(Math.max(40, Math.min(100, baseHsl.s + (Math.random() - 0.5) * 30)));
            const dynamicLum = Math.round(Math.max(30, Math.min(80, baseHsl.l + (Math.random() - 0.5) * 30)));
            const dynamicColorStr = `hsl(${dynamicHue}, ${dynamicSat}%, ${dynamicLum}%)`;

            ctx.save();
            ctx.beginPath();

            // Düzensiz keskin poligon patikası
            const hw = shardW * 0.5;
            const hh = shardH * 0.5;
            ctx.moveTo(cx - hw + (Math.random() - 0.5) * hw * 0.4, cy - hh + (Math.random() - 0.5) * hh * 0.4);
            ctx.lineTo(cx + hw + (Math.random() - 0.5) * hw * 0.4, cy - hh * 0.5 + (Math.random() - 0.5) * hh * 0.4);
            ctx.lineTo(cx + hw * 0.8 + (Math.random() - 0.5) * hw * 0.4, cy + hh + (Math.random() - 0.5) * hh * 0.4);
            ctx.lineTo(cx - hw * 0.7 + (Math.random() - 0.5) * hw * 0.4, cy + hh * 0.8 + (Math.random() - 0.5) * hh * 0.4);
            ctx.closePath();
            ctx.clip(); // Tüm çizimler bu kırık alanına maskelenir

            // B. HAYALET İZ (Frame-Skip Ghosting)
            ctx.globalAlpha = 0.35;
            ctx.drawImage(sourceCanvas, shiftX * 0.4, shiftY * 0.4);

            // C. Asıl Kaydırılmış Kırık Görseli
            ctx.globalAlpha = 1.0;
            ctx.drawImage(sourceCanvas, shiftX, shiftY);

            // D. Dinamik Renk Tonlama (Difference harmanlaması)
            ctx.globalCompositeOperation = 'difference';
            ctx.globalAlpha = 0.50;
            ctx.fillStyle = dynamicColorStr;
            ctx.fillRect(cx - shardW, cy - shardH, shardW * 2, shardH * 2);

            // E. LOKAL BEN-DAY TRAM MASKESİ (Sadece kırık içine özel matbaa dokusu)
            if (normIntensity > 0.15) {
                ctx.globalCompositeOperation = 'multiply';
                ctx.globalAlpha = 0.22;
                ctx.fillStyle = this._getBenDayPattern(ctx, scale);
                ctx.fillRect(cx - shardW, cy - shardH, shardW * 2, shardH * 2);
            }

            // F. AKSİYON / HIZ ÇİZGİLERİ (Speed Lines)
            ctx.globalCompositeOperation = 'overlay';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
            ctx.lineWidth = Math.max(1, Math.round(1.2 * scale));
            
            const lineCount = Math.floor(2 + Math.random() * 4);
            for (let l = 0; l < lineCount; l++) {
                const ly = cy - hh + Math.random() * shardH;
                ctx.beginPath();
                ctx.moveTo(cx - hw, ly);
                ctx.lineTo(cx + hw, ly + (Math.random() - 0.5) * 12 * scale);
                ctx.stroke();
            }

            // G. ÇİFT RENKLİ KROMATİK KONTUR (3D Cam Prizma Kenarları)
            ctx.globalCompositeOperation = 'source-over';
            ctx.lineWidth = Math.max(1.5, Math.round(2 * scale));

            // Cyan Kontur (Hafif Sol-Üst Kayma)
            ctx.save();
            ctx.translate(-1.8 * scale, -1.8 * scale);
            ctx.strokeStyle = '#00f0ff';
            ctx.globalAlpha = 0.85;
            ctx.stroke();
            ctx.restore();

            // Magenta Kontur (Hafif Sağ-Alt Kayma)
            ctx.save();
            ctx.translate(1.8 * scale, 1.8 * scale);
            ctx.strokeStyle = '#ff0055';
            ctx.globalAlpha = 0.85;
            ctx.stroke();
            ctx.restore();

            ctx.restore();
        }

        return outputCanvas;
    }
}