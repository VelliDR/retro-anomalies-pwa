/**
 * @file VanGoghEngine.js
 * @description Anomalies Retro Medya Laboratuvarı için Van Gogh Impasto & Akış Motoru.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class VanGoghEngine {
    /**
     * @param {HTMLCanvasElement} sourceCanvas - Kaynak fotoğraf tuvali
     * @param {number} mode - 1: Düz/Paralel, 2: Girdap (Manyetik Dipol), 3: Kartezyen Merkez & Swirly Bokeh
     * @param {number} stepSize - Fırça adımı/ızgara sıklığı (px)
     * @param {number} brushMinLength - Minimum fırça boyu (px)
     * @param {number} brushMaxLength - Maksimum fırça boyu (px)
     * @param {boolean} impasto - 3D Işık ve Kabartma Efekti
     * @returns {HTMLCanvasElement} İşlenmiş sonuç tuvali
     */
    render(sourceCanvas, mode = 2, stepSize = 12, brushMinLength = 10, brushMaxLength = 30, impasto = true) {
        const width = sourceCanvas.width;
        const height = sourceCanvas.height;

        const targetCanvas = canvasPool.getCanvas('vangogh_output', width, height);
        const targetCtx = targetCanvas.getContext('2d');
        const srcCtx = sourceCanvas.getContext('2d');

        const imgData = srcCtx.getImageData(0, 0, width, height);
        const pixels = imgData.data;

        // YÖNTEM 1: Siyah boşluklar yerine orijinal fotoğrafı bulanık ve doygun bir astar olarak ser
        targetCtx.save();
        targetCtx.filter = 'blur(10px) saturate(130%)';
        targetCtx.drawImage(sourceCanvas, 0, 0, width, height);
        targetCtx.restore();

        // Mod 2 için Odak Noktaları Ön Analizi
        const featurePoints = this.extractFeaturePoints(pixels, width, height);

        // 1. KATMAN: Arka Doku (Geniş & Mat Fırça Darbeleri)
        this.drawPass(srcCtx, targetCtx, pixels, width, height, featurePoints, mode, {
            step: Math.max(4, Math.round(stepSize * 1.5)),
            minLen: brushMinLength * 1.4,
            maxLen: brushMaxLength * 1.4,
            lineWidth: 6,
            alpha: 0.6,
            drawOutline: false,
            impasto: false
        });

        // 2. KATMAN: Ana Detaylar (Zıt Konturlu & Kabartmalı "~" Darbeleri)
        this.drawPass(srcCtx, targetCtx, pixels, width, height, featurePoints, mode, {
            step: Math.max(3, stepSize),
            minLen: brushMinLength,
            maxLen: brushMaxLength,
            lineWidth: 3,
            alpha: 0.95,
            drawOutline: true,
            impasto: impasto
        });

        return targetCanvas;
    }

    extractFeaturePoints(pixels, width, height) {
        const points = [];
        const sampleStep = 30;

        for (let y = 0; y < height; y += sampleStep) {
            for (let x = 0; x < width; x += sampleStep) {
                const i = (y * width + x) * 4;
                const brightness = (pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114);

                if (brightness > 220 || brightness < 30) {
                    points.push({ x, y, brightness });
                }
            }
        }
        return points;
    }

    drawPass(srcCtx, targetCtx, pixels, width, height, featurePoints, mode, config) {
        const centerX = width / 2;
        const centerY = height / 2;

        for (let y = 0; y < height; y += config.step) {
            for (let x = 0; x < width; x += config.step) {
                const i = (y * width + x) * 4;
                const r = pixels[i];
                const g = pixels[i + 1];
                const b = pixels[i + 2];
                const a = pixels[i + 3] / 255;

                if (a < 0.1) continue;

                const angle = this.calculateAngle(x, y, width, height, centerX, centerY, featurePoints, mode);
                const baseLen = config.minLen + Math.random() * (config.maxLen - config.minLen);

                const hsl = this.rgbToHsl(r, g, b);
                hsl.s = Math.min(1, hsl.s * 1.25);

                const mainColor = `hsla(${hsl.h}, ${Math.round(hsl.s * 100)}%, ${Math.round(hsl.l * 100)}%, ${config.alpha})`;

                if (config.drawOutline) {
                    const compHue = (hsl.h + 180) % 360;
                    const contrastColor = `hsla(${compHue}, ${Math.round(hsl.s * 100)}%, ${Math.max(10, hsl.l * 80)}%, ${config.alpha * 0.8})`;
                    this.drawSwirlStroke(targetCtx, x, y, baseLen, angle, contrastColor, config.lineWidth + 2, 0);
                    this.drawSwirlStroke(targetCtx, x, y, baseLen, angle, mainColor, config.lineWidth, 0);

                    if (config.impasto) {
                        const highlightColor = `hsla(${hsl.h}, ${Math.round(hsl.s * 50)}%, ${Math.min(100, hsl.l * 130)}%, 0.4)`;
                        this.drawSwirlStroke(targetCtx, x - 1, y - 1, baseLen * 0.8, angle, highlightColor, 1, -1.5);
                    }
                } else {
                    this.drawSwirlStroke(targetCtx, x, y, baseLen, angle, mainColor, config.lineWidth, 0);
                }
            }
        }
    }

    calculateAngle(x, y, width, height, centerX, centerY, featurePoints, mode) {
        if (mode === 1) {
            const normY = y / height;
            const parallelFactor = Math.sin(normY * Math.PI);
            return (Math.PI / 6) + (parallelFactor * 0.2) + (Math.sin(x * 0.02) * 0.1);
        } else if (mode === 2) {
            let closest = { dist: Infinity, point: null };
            let secondClosest = { dist: Infinity, point: null };

            for (let p of featurePoints) {
                const dx = p.x - x;
                const dy = p.y - y;
                const dist = dx * dx + dy * dy;

                if (dist < closest.dist) {
                    secondClosest = { ...closest };
                    closest = { dist, point: p };
                } else if (dist < secondClosest.dist) {
                    secondClosest = { dist, point: p };
                }
            }

            const influenceLimit = (width * 0.25) ** 2;

            if (closest.point && secondClosest.point && secondClosest.dist < influenceLimit) {
                const dxBridge = secondClosest.point.x - closest.point.x;
                const dyBridge = secondClosest.point.y - closest.point.y;
                return Math.atan2(dyBridge, dxBridge) + (Math.sin(x * 0.05) * 0.15);
            } 
            else if (closest.point && closest.dist < influenceLimit) {
                return Math.atan2(y - closest.point.y, x - closest.point.x) + (Math.PI / 2);
            } 
            else {
                return Math.atan2(y - centerY, x - centerX) + 0.5;
            }
        } else {
            const distToXEdges = Math.min(x, width - x);
            const distToYEdges = Math.min(y, height - y);
            const centerAngle = distToXEdges < distToYEdges ? Math.PI / 2 : 0;

            const dx = x - centerX;
            const dy = y - centerY;
            const distFromCenter = Math.sqrt(dx * dx + dy * dy);
            const maxRadius = Math.max(centerX, centerY);
            const normDist = distFromCenter / maxRadius;
            
            const bokehAngle = Math.atan2(dy, dx) + (Math.PI / 2) + (normDist * 0.6);
            const mixRatio = Math.min(1, Math.max(0, (normDist - 0.3) * 2.5));

            return (centerAngle * (1 - mixRatio)) + (bokehAngle * mixRatio);
        }
    }

    drawSwirlStroke(ctx, x, y, length, angle, color, lineWidth, offsetPerp = 0) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';

        ctx.translate(x, y);
        ctx.rotate(angle);

        if (offsetPerp !== 0) {
            ctx.translate(0, offsetPerp);
        }

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(
            length * 0.3, -length * 0.2, 
            length * 0.7, length * 0.2,  
            length, 0
        );
        ctx.stroke();

        ctx.restore();
    }

    rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h: Math.round(h * 360), s, l };
    }
}
