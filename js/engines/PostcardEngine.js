/**
 * @file PostcardEngine.js
 * @description Tırtıklı pul kenarları, vintage çerçeve ve kartpostal/gravür dokusu simülasyonu.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class PostcardEngine {
    /**
     * @param {HTMLCanvasElement} sourceCanvas 
     * @param {string} mode - 'halftone_paper' (Orijinal Koruma + Kağıt Dokusu) veya 'engraving' (Gravür / Banknot)
     * @param {number} stampMargin - Beyaz pul kenar boşluğu (px)
     * @param {number} engraveDensity - Gravür çizgi sıklığı (px)
     * @param {number} scaleFactor - Çift çözünürlük ölçek oranı
     * @returns {HTMLCanvasElement}
     */
    render(sourceCanvas, mode = 'halftone_paper', stampMargin = 28, engraveDensity = 6, scaleFactor = 1.0) {
        const margin = Math.round(stampMargin * scaleFactor);
        const w = sourceCanvas.width + margin * 2;
        const h = sourceCanvas.height + margin * 2;

        // 1. Ana Çıktı Tuvalini Havuzdan Al
        const outCanvas = canvasPool.getCanvas('postcard_out', w, h);
        const ctx = outCanvas.getContext('2d');

        // Zemin: Hafif Sararmış Vintage Kağıt
        ctx.fillStyle = '#f3efe6';
        ctx.fillRect(0, 0, w, h);

        // 2. Pul Tırtıklarını Oy (Perforation)
        const holeRadius = Math.max(3, Math.round(5 * scaleFactor));
        const holeSpacing = Math.max(10, Math.round(14 * scaleFactor));

        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000000';

        // Üst ve Alt Kenar Delikleri
        for (let x = holeSpacing; x < w; x += holeSpacing) {
            ctx.beginPath();
            ctx.arc(x, 0, holeRadius, 0, Math.PI * 2);
            ctx.arc(x, h, holeRadius, 0, Math.PI * 2);
            ctx.fill();
        }
        // Sol ve Sağ Kenar Delikleri
        for (let y = holeSpacing; y < h; y += holeSpacing) {
            ctx.beginPath();
            ctx.arc(0, y, holeRadius, 0, Math.PI * 2);
            ctx.arc(w, y, holeRadius, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // 3. En Dış İnce Siyah Çerçeve Konturu
        ctx.save();
        ctx.strokeStyle = 'rgba(30, 30, 30, 0.85)';
        ctx.lineWidth = Math.max(1, Math.round(1.5 * scaleFactor));
        ctx.strokeRect(holeRadius / 2, holeRadius / 2, w - holeRadius, h - holeRadius);
        ctx.restore();

        // 4. İç Resmi Hazırla ve Doku Uygula
        const imgCanvas = canvasPool.getCanvas('postcard_img', sourceCanvas.width, sourceCanvas.height);
        const imgCtx = imgCanvas.getContext('2d');

        if (mode === 'engraving') {
            this._renderEngraving(sourceCanvas, imgCtx, engraveDensity, scaleFactor);
        } else {
            imgCtx.drawImage(sourceCanvas, 0, 0);
            this._applyPaperTexture(imgCtx, sourceCanvas.width, sourceCanvas.height);
        }

        // 5. İşlenmiş Görseli Pulun Ortasına Yerleştir
        ctx.drawImage(imgCanvas, margin, margin);

        // 6. Görsel Çevresine İnce Siyah Kontur Çerçeve
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.lineWidth = Math.max(1, Math.round(1 * scaleFactor));
        ctx.strokeRect(margin, margin, sourceCanvas.width, sourceCanvas.height);

        return outCanvas;
    }

    _applyPaperTexture(ctx, w, h) {
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;
        // Hızlı Matbaa & Kağıt Lif Pürüzü
        for (let i = 0; i < data.length; i += 4) {
            const noise = (Math.random() - 0.5) * 22;
            data[i] = Math.min(255, Math.max(0, data[i] + noise));
            data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
            data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
        }
        ctx.putImageData(imgData, 0, 0);
    }

    _renderEngraving(sourceCanvas, targetCtx, density, scaleFactor) {
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;

        const tempCanvas = canvasPool.getCanvas('engrave_temp', w, h);
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(sourceCanvas, 0, 0);
        const imgData = tempCtx.getImageData(0, 0, w, h);
        const data = imgData.data;

        // Gravür Zemin Rengi
        targetCtx.fillStyle = '#e8e4d8';
        targetCtx.fillRect(0, 0, w, h);

        targetCtx.strokeStyle = '#1b263b'; // Gravür Mavi/Siyah Mürekkep
        const step = Math.max(3, Math.round(density * scaleFactor));

        for (let y = 0; y < h; y += step) {
            for (let x = 0; x < w; x += step) {
                const i = (y * w + x) * 4;
                const brightness = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

                if (brightness < 215) {
                    targetCtx.lineWidth = Math.max(1, Math.round(((255 - brightness) / 255) * (step * 0.85)));
                    targetCtx.beginPath();
                    targetCtx.moveTo(x, y);
                    targetCtx.lineTo(x + step, y + step);
                    targetCtx.stroke();
                }
            }
        }
    }
}