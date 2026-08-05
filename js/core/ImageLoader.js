/**
 * @file ImageLoader.js
 * @description HEIC/HEIF dönüştürücü ve Çift Çözünürlük (Full + Preview) tuval hazırlayıcı.
 */

import { canvasPool } from './CanvasPool.js';

export class ImageLoader {
    /**
     * @param {File|Blob} file - Yüklenen dosya
     * @param {number} previewMaxDim - Ön izleme için maksimum boyut (Varsayılan 1200px)
     * @returns {Promise<{fullCanvas: HTMLCanvasElement, previewCanvas: HTMLCanvasElement, ratio: number}>}
     */
    static async loadFromFile(file, previewMaxDim = 1200) {
        let targetFile = file;
        const fileName = file.name ? file.name.toLowerCase() : '';

        // HEIC / HEIF Dönüştürme Kontrolü
        if (file.type.includes('heic') || file.type.includes('heif') || fileName.endsWith('.heic') || fileName.endsWith('.heif')) {
            if (window.heic2any) {
                try {
                    const convertedBlob = await window.heic2any({
                        blob: file,
                        toType: 'image/jpeg',
                        quality: 0.95
                    });
                    targetFile = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
                } catch (err) {
                    throw new Error('HEIC görseli dönüştürülürken bir hata oluştu: ' + err.message);
                }
            } else {
                console.warn('heic2any kütüphanesi yüklenemedi.');
            }
        }

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(new Error('Dosya okunamadı.'));
            reader.onload = (e) => {
                const img = new Image();
                img.onerror = () => reject(new Error('Görsel formatı ayrıştırılamadı.'));
                img.onload = () => {
                    const fullW = img.width;
                    const fullH = img.height;

                    // 1. Orijinal Tam Çözünürlüklü Tuval
                    const fullCanvas = canvasPool.getCanvas('loader_full', fullW, fullH);
                    const fullCtx = fullCanvas.getContext('2d');
                    fullCtx.drawImage(img, 0, 0);

                    // 2. Ön İzleme İçin Optimize Edilmiş Tuval (~1200px)
                    let prevW = fullW;
                    let prevH = fullH;

                    if (prevW > previewMaxDim || prevH > previewMaxDim) {
                        if (prevW > prevH) {
                            prevH = Math.round((prevH * previewMaxDim) / prevW);
                            prevW = previewMaxDim;
                        } else {
                            prevW = Math.round((prevW * previewMaxDim) / prevH);
                            prevH = previewMaxDim;
                        }
                    }

                    const previewCanvas = canvasPool.getCanvas('loader_preview', prevW, prevH);
                    const prevCtx = previewCanvas.getContext('2d');
                    prevCtx.drawImage(img, 0, 0, prevW, prevH);

                    const ratio = fullW / prevW;

                    resolve({
                        fullCanvas,
                        previewCanvas,
                        ratio
                    });
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(targetFile);
        });
    }
}