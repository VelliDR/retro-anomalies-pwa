/**
 * @file MinecraftEngine.js
 * @description Anomalies Retro Medya Laboratuvarı için Çözünürlükten Bağımsız Voxel & Doku Motoru.
 * 2D Düz Harita ve Tam Hizalanmış (Centered) 2.5D İzometrik Voxel modlarını içerir.
 */

import { canvasPool } from '../core/CanvasPool.js';

export class MinecraftEngine {
    constructor() {
        this.textures = {};
        this.generateProceduralTextures();
    }

    generateProceduralTextures() {
        const createTex = (name, drawFn) => {
            const cvs = document.createElement('canvas');
            cvs.width = 16;
            cvs.height = 16;
            const ctx = cvs.getContext('2d');
            drawFn(ctx);
            this.textures[name] = cvs;
        };

        const noise = (val, variance) => Math.max(0, Math.min(255, val + (Math.random() - 0.5) * variance));

        // 1. TOPRAK (Dirt)
        createTex('dirt', (ctx) => {
            for (let y = 0; y < 16; y++) {
                for (let x = 0; x < 16; x++) {
                    const r = noise(134, 30), g = noise(96, 25), b = noise(67, 20);
                    ctx.fillStyle = `rgb(${r},${g},${b})`;
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        });

        // 2. ÇİM ÜST (Grass Top)
        createTex('grass_top', (ctx) => {
            for (let y = 0; y < 16; y++) {
                for (let x = 0; x < 16; x++) {
                    const r = noise(91, 25), g = noise(140, 35), b = noise(49, 20);
                    ctx.fillStyle = `rgb(${r},${g},${b})`;
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        });

        // 3. ÇİM YAN (Grass Side)
        createTex('grass_side', (ctx) => {
            ctx.drawImage(this.textures['dirt'], 0, 0);
            for (let x = 0; x < 16; x++) {
                const drip = 3 + (Math.random() > 0.5 ? 1 : 0);
                for (let y = 0; y < drip; y++) {
                    const r = noise(91, 20), g = noise(140, 30), b = noise(49, 15);
                    ctx.fillStyle = `rgb(${r},${g},${b})`;
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        });

        // 4. TAŞ (Stone)
        createTex('stone', (ctx) => {
            for (let y = 0; y < 16; y++) {
                for (let x = 0; x < 16; x++) {
                    const v = noise(125, 30);
                    ctx.fillStyle = `rgb(${v},${v},${v})`;
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        });

        // 5. KUM (Sand)
        createTex('sand', (ctx) => {
            for (let y = 0; y < 16; y++) {
                for (let x = 0; x < 16; x++) {
                    const r = noise(219, 20), g = noise(207, 20), b = noise(153, 20);
                    ctx.fillStyle = `rgb(${r},${g},${b})`;
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        });

        // 6. SU (Water)
        createTex('water', (ctx) => {
            for (let y = 0; y < 16; y++) {
                for (let x = 0; x < 16; x++) {
                    const r = noise(60, 15), g = noise(110, 20), b = noise(220, 25);
                    ctx.fillStyle = `rgb(${r},${g},${b})`;
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        });

        // 7. ELMAS CEVHERİ (Diamond Ore)
        createTex('diamond_ore', (ctx) => {
            ctx.drawImage(this.textures['stone'], 0, 0);
            const spots = [[3,4],[4,4],[11,3],[12,4],[6,9],[7,10],[10,12],[2,12]];
            ctx.fillStyle = '#26c6da';
            spots.forEach(([x, y]) => ctx.fillRect(x, y, 1, 1));
        });

        // 8. KAR (Snow)
        createTex('snow', (ctx) => {
            for (let y = 0; y < 16; y++) {
                for (let x = 0; x < 16; x++) {
                    const v = noise(240, 15);
                    ctx.fillStyle = `rgb(${v},${v},${noise(250, 10)})`;
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        });

        // 9. TNT / KIRMIZI BLOK
        createTex('tnt', (ctx) => {
            for (let y = 0; y < 16; y++) {
                for (let x = 0; x < 16; x++) {
                    const r = noise(210, 25), g = noise(40, 15), b = noise(40, 15);
                    ctx.fillStyle = `rgb(${r},${g},${b})`;
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        });
    }

    render(sourceCanvas, mode = 1, blockSize = 24, paletteKey = 'classic') {
        const width = sourceCanvas.width;
        const height = sourceCanvas.height;

        const maxDim = Math.max(width, height);
        const scale = maxDim / 1200;
        const bSize = Math.max(4, Math.round(blockSize * scale));

        const targetCanvas = canvasPool.getCanvas('minecraft_output', width, height);
        const targetCtx = targetCanvas.getContext('2d');
        const srcCtx = sourceCanvas.getContext('2d');

        targetCtx.imageSmoothingEnabled = false;

        const imgData = srcCtx.getImageData(0, 0, width, height);
        const pixels = imgData.data;

        targetCtx.fillStyle = '#1a1a1a';
        targetCtx.fillRect(0, 0, width, height);

        if (parseInt(mode, 10) === 2) {
            this.renderAdvancedIsometricVoxels(targetCtx, pixels, width, height, bSize, scale);
        } else {
            this.render2DFlatTexturedMap(targetCtx, pixels, width, height, bSize, paletteKey);
        }

        return targetCanvas;
    }

    /**
     * MOD 1: 2D Düz Blok Haritası
     */
    render2DFlatTexturedMap(ctx, pixels, width, height, bSize, paletteKey) {
        for (let y = 0; y < height; y += bSize) {
            for (let x = 0; x < width; x += bSize) {
                const srcX = Math.min(width - 1, Math.floor(x + bSize / 2));
                const srcY = Math.min(height - 1, Math.floor(y + bSize / 2));
                const pIdx = (srcY * width + srcX) * 4;

                const r = pixels[pIdx], g = pixels[pIdx + 1], b = pixels[pIdx + 2], a = pixels[pIdx + 3] / 255;
                if (a < 0.1) continue;

                const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;

                const texName = this.selectBlockByColorAndHeight(r, g, b, lum);
                const tex = this.textures[texName] || this.textures['dirt'];

                ctx.drawImage(tex, x, y, bSize, bSize);

                if (paletteKey === 'colorful') {
                    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.50)`;
                    ctx.fillRect(x, y, bSize, bSize);
                }

                ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(x, y, bSize, bSize);
            }
        }
    }

    /**
     * MOD 2: 2.5D İzometrik Voxel Küpleri (Merkez Hizalamalı Bounding Box Fix)
     */
    renderAdvancedIsometricVoxels(ctx, pixels, width, height, bSize, scale) {
        const sw = Math.floor(width / bSize);
        const sh = Math.floor(height / bSize);
        const maxStackHeight = Math.round(14 * scale);

        const heightMap = new Float32Array(sw * sh);
        const colorMap = new Array(sw * sh);

        for (let gy = 0; gy < sh; gy++) {
            for (let gx = 0; gx < sw; gx++) {
                const srcX = Math.min(width - 1, Math.floor(gx * bSize + bSize / 2));
                const srcY = Math.min(height - 1, Math.floor(gy * bSize + bSize / 2));
                const pIdx = (srcY * width + srcX) * 4;

                const r = pixels[pIdx], g = pixels[pIdx + 1], b = pixels[pIdx + 2];
                const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;

                const idx = gy * sw + gx;
                heightMap[idx] = Math.max(1, Math.round(lum * maxStackHeight));
                colorMap[idx] = { r, g, b, lum };
            }
        }

        const isoW = bSize;
        const isoH = Math.round(bSize * 0.55);
        const sideH = Math.round(bSize * 0.75);

        // 1. DINAMIK BOUNDING BOX MERKEZLEME HESABI
        let minIsoY = Infinity;
        let maxIsoY = -Infinity;

        for (let gy = 0; gy < sh; gy++) {
            for (let gx = 0; gx < sw; gx++) {
                const idx = gy * sw + gx;
                const hStack = heightMap[idx];
                const vOffset = hStack * (sideH * 0.5);
                const isoY = (gy + gx) * (isoH / 2);

                const topY = isoY - vOffset - (isoH / 2);
                const bottomY = isoY + sideH + (isoH / 2);

                if (topY < minIsoY) minIsoY = topY;
                if (bottomY > maxIsoY) maxIsoY = bottomY;
            }
        }

        const minIsoX = -(sh - 1) * (isoW / 2);
        const maxIsoX = (sw - 1) * (isoW / 2);
        const isoCenterX = (minIsoX + maxIsoX) / 2;
        const isoCenterY = (minIsoY + maxIsoY) / 2;

        // Tuvalin tam ortasına hizalayacak dikey ve yatay ofsetler
        const offsetX = (width / 2) - isoCenterX;
        const offsetY = (height / 2) - isoCenterY;

        // 2. BACK-TO-FRONT İZOMETRİK ÇİZİM
        for (let gy = 0; gy < sh; gy++) {
            for (let gx = 0; gx < sw; gx++) {
                const idx = gy * sw + gx;
                const hStack = heightMap[idx];
                const cell = colorMap[idx];

                const drawX = offsetX + (gx - gy) * (isoW / 2);
                const drawY = offsetY + (gy + gx) * (isoH / 2);
                const vOffset = hStack * (sideH * 0.5);

                let shadowFactor = 1.0;
                if (gx > 0 && gy > 0) {
                    const lightNeighborH = heightMap[(gy - 1) * sw + (gx - 1)];
                    if (lightNeighborH > hStack) {
                        shadowFactor = Math.max(0.35, 1.0 - (lightNeighborH - hStack) * 0.18);
                    }
                }

                let aoFactor = 1.0;
                if (gx < sw - 1 && heightMap[gy * sw + (gx + 1)] > hStack) aoFactor -= 0.15;
                if (gy < sh - 1 && heightMap[(gy + 1) * sw + gx] > hStack) aoFactor -= 0.15;

                const totalLight = shadowFactor * aoFactor;

                const topTexKey = this.selectBlockByColorAndHeight(cell.r, cell.g, cell.b, cell.lum);
                const sideTexKey = (topTexKey === 'grass_top') ? 'grass_side' : topTexKey;

                this.drawIsometricTexturedVoxel(
                    ctx, drawX, drawY, isoW, isoH, sideH, vOffset,
                    this.textures[topTexKey], this.textures[sideTexKey], totalLight
                );
            }
        }
    }

    drawIsometricTexturedVoxel(ctx, x, y, size, h, sideH, vOffset, topTex, sideTex, light) {
        ctx.save();
        ctx.translate(x, y);

        const hHalf = h / 2;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, -vOffset); ctx.lineTo(size / 2, hHalf - vOffset); ctx.lineTo(0, h - vOffset); ctx.lineTo(-size / 2, hHalf - vOffset); ctx.closePath();
        ctx.clip();
        ctx.transform(size / 32, hHalf / 16, -size / 32, hHalf / 16, 0, -vOffset);
        ctx.drawImage(topTex, -16, 0, 32, 16);
        ctx.restore();

        if (light < 0.99) {
            ctx.fillStyle = `rgba(0, 0, 0, ${1 - light})`;
            ctx.beginPath();
            ctx.moveTo(0, -vOffset); ctx.lineTo(size / 2, hHalf - vOffset); ctx.lineTo(0, h - vOffset); ctx.lineTo(-size / 2, hHalf - vOffset); ctx.closePath();
            ctx.fill();
        }

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(-size / 2, hHalf - vOffset); ctx.lineTo(0, h - vOffset); ctx.lineTo(0, h - vOffset + sideH); ctx.lineTo(-size / 2, hHalf - vOffset + sideH); ctx.closePath();
        ctx.clip();
        ctx.transform(size / 32, hHalf / 16, 0, sideH / 16, -size / 2, hHalf - vOffset);
        ctx.drawImage(sideTex, 0, 0, 16, 16);
        ctx.restore();

        ctx.fillStyle = `rgba(0, 0, 0, ${0.35 + (1 - light) * 0.4})`;
        ctx.beginPath();
        ctx.moveTo(-size / 2, hHalf - vOffset); ctx.lineTo(0, h - vOffset); ctx.lineTo(0, h - vOffset + sideH); ctx.lineTo(-size / 2, hHalf - vOffset + sideH); ctx.closePath();
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, h - vOffset); ctx.lineTo(size / 2, hHalf - vOffset); ctx.lineTo(size / 2, hHalf - vOffset + sideH); ctx.lineTo(0, h - vOffset + sideH); ctx.closePath();
        ctx.clip();
        ctx.transform(size / 32, -hHalf / 16, 0, sideH / 16, 0, h - vOffset);
        ctx.drawImage(sideTex, 0, 0, 16, 16);
        ctx.restore();

        ctx.fillStyle = `rgba(0, 0, 0, ${0.20 + (1 - light) * 0.4})`;
        ctx.beginPath();
        ctx.moveTo(0, h - vOffset); ctx.lineTo(size / 2, hHalf - vOffset); ctx.lineTo(size / 2, hHalf - vOffset + sideH); ctx.lineTo(0, h - vOffset + sideH); ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(-size / 2, hHalf - vOffset); ctx.lineTo(0, h - vOffset); ctx.lineTo(size / 2, hHalf - vOffset);
        ctx.moveTo(0, h - vOffset); ctx.lineTo(0, h - vOffset + sideH);
        ctx.stroke();

        ctx.restore();
    }

    selectBlockByColorAndHeight(r, g, b, lum) {
        if (b > r * 1.15 && b > g * 1.15) return 'water';
        if (r > g * 1.35 && r > b * 1.35) return 'tnt';
        if (g > r * 1.1 && g > b * 1.1) return 'grass_top';
        if (lum < 0.22) return 'dirt';
        if (r > 170 && g > 150 && b < 130) return 'sand';
        if (lum > 0.82) return 'snow';
        if (lum > 0.68) return (Math.random() > 0.85) ? 'diamond_ore' : 'stone';
        if (lum > 0.45) return 'stone';

        return 'dirt';
    }
}