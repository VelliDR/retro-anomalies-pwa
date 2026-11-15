import { canvasPool } from '../core/CanvasPool.ts';
import { luminance, oklabDistanceSq, rgbToOklab, type OKLab } from '../core/ColorSpace.ts';
import { downsampleAreaAverage } from '../core/ImageResampler.ts';
import { createSeededRng } from '../core/Noise.ts';
import type { IImageEngine, MinecraftParams, RenderContext } from '../core/types.ts';
import { workerBridge } from '../core/WorkerBridge.ts';

type BlockType =
  | 'dirt'
  | 'grass_top'
  | 'grass_side'
  | 'stone'
  | 'sand'
  | 'water'
  | 'diamond_ore'
  | 'snow'
  | 'tnt'
  | 'oak_planks'
  | 'terracotta';

interface CellColor {
  r: number;
  g: number;
  b: number;
  a: number;
  lum: number;
}

const MATCHABLE_BLOCKS: readonly BlockType[] = [
  'dirt',
  'grass_top',
  'stone',
  'sand',
  'water',
  'snow',
  'tnt',
  'oak_planks',
  'terracotta',
];

export class MinecraftEngine implements IImageEngine<MinecraftParams> {
  readonly id = 'minecraft' as const;
  private readonly textures: Record<BlockType, HTMLCanvasElement>;
  private readonly blockOklab: Record<BlockType, OKLab>;
  private isoSpriteCacheKey = '';
  private isoSpriteCache = new Map<string, HTMLCanvasElement>();

  constructor() {
    this.textures = this.generateProceduralTextures();
    this.blockOklab = this.computeTextureOklabCentroids();
  }

  private generateProceduralTextures(): Record<BlockType, HTMLCanvasElement> {
    const textures = {} as Record<BlockType, HTMLCanvasElement>;
    const rng = createSeededRng(1024);

    const createTex = (name: BlockType, drawFn: (ctx: CanvasRenderingContext2D) => void) => {
      const cvs = document.createElement('canvas');
      cvs.width = 16;
      cvs.height = 16;
      const ctx = cvs.getContext('2d');
      if (ctx) drawFn(ctx);
      textures[name] = cvs;
    };

    const noise = (val: number, variance: number) =>
      Math.max(0, Math.min(255, Math.round(val + (rng() - 0.5) * variance)));

    createTex('dirt', (ctx) => {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          ctx.fillStyle = `rgb(${noise(134, 30)},${noise(96, 25)},${noise(67, 20)})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    });

    createTex('grass_top', (ctx) => {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          ctx.fillStyle = `rgb(${noise(91, 25)},${noise(140, 35)},${noise(49, 20)})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    });

    createTex('grass_side', (ctx) => {
      ctx.drawImage(textures.dirt, 0, 0);
      for (let x = 0; x < 16; x++) {
        const drip = 3 + (rng() > 0.5 ? 1 : 0);
        for (let y = 0; y < drip; y++) {
          ctx.fillStyle = `rgb(${noise(91, 20)},${noise(140, 30)},${noise(49, 15)})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    });

    createTex('stone', (ctx) => {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const v = noise(125, 30);
          ctx.fillStyle = `rgb(${v},${v},${v})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    });

    createTex('sand', (ctx) => {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          ctx.fillStyle = `rgb(${noise(219, 20)},${noise(207, 20)},${noise(153, 20)})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    });

    createTex('water', (ctx) => {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          ctx.fillStyle = `rgb(${noise(56, 15)},${noise(116, 20)},${noise(218, 25)})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    });

    createTex('diamond_ore', (ctx) => {
      ctx.drawImage(textures.stone, 0, 0);
      const spots: readonly [number, number][] = [
        [3, 4],
        [4, 4],
        [11, 3],
        [12, 4],
        [6, 9],
        [7, 10],
        [10, 12],
        [2, 12],
      ];
      ctx.fillStyle = '#26c6da';
      spots.forEach(([x, y]) => ctx.fillRect(x, y, 1, 1));
    });

    createTex('snow', (ctx) => {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const v = noise(240, 15);
          ctx.fillStyle = `rgb(${v},${v},${noise(250, 10)})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    });

    createTex('tnt', (ctx) => {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          ctx.fillStyle = `rgb(${noise(205, 25)},${noise(44, 15)},${noise(44, 15)})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    });

    createTex('oak_planks', (ctx) => {
      for (let y = 0; y < 16; y++) {
        const seam = y % 4 === 0 ? -24 : 0;
        for (let x = 0; x < 16; x++) {
          ctx.fillStyle = `rgb(${noise(168 + seam, 18)},${noise(132 + seam, 16)},${noise(84 + seam, 12)})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    });

    createTex('terracotta', (ctx) => {
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          ctx.fillStyle = `rgb(${noise(178, 16)},${noise(124, 14)},${noise(104, 14)})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    });

    return textures;
  }

  private computeTextureOklabCentroids(): Record<BlockType, OKLab> {
    const out = {} as Record<BlockType, OKLab>;
    (Object.keys(this.textures) as BlockType[]).forEach((key) => {
      const cvs = this.textures[key];
      const ctx = cvs.getContext('2d');
      if (!ctx) {
        out[key] = rgbToOklab(128, 128, 128);
        return;
      }
      const data = ctx.getImageData(0, 0, 16, 16).data;
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      for (let i = 0; i < data.length; i += 4) {
        rSum += data[i] ?? 0;
        gSum += data[i + 1] ?? 0;
        bSum += data[i + 2] ?? 0;
      }
      const count = 256;
      out[key] = rgbToOklab(rSum / count, gSum / count, bSum / count);
    });
    return out;
  }

  render(
    sourceCanvas: HTMLCanvasElement,
    params: MinecraftParams,
    context: RenderContext
  ): HTMLCanvasElement {
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;
    const scale = context.referenceScale;
    const bSize = Math.max(4, Math.round(params.blockSize * scale));

    const srcCtx = canvasPool.getContext2D(sourceCanvas);
    const pixels = srcCtx.getImageData(0, 0, width, height).data;

    if (params.mode === 2) {
      const sw = Math.max(1, Math.floor(width / bSize));
      const sh = Math.max(1, Math.floor(height / bSize));
      const grid = downsampleAreaAverage(pixels, width, height, sw, sh);
      return this.compositeResult(width, height, params.mode, params.paletteKey, bSize, scale, sw, sh, grid);
    }

    const cols = Math.max(1, Math.ceil(width / bSize));
    const rows = Math.max(1, Math.ceil(height / bSize));
    const grid = downsampleAreaAverage(pixels, width, height, cols, rows);
    return this.compositeResult(width, height, params.mode, params.paletteKey, bSize, scale, cols, rows, grid);
  }

  async renderAsync(
    sourceCanvas: HTMLCanvasElement,
    params: MinecraftParams,
    context: RenderContext,
    signal?: AbortSignal
  ): Promise<HTMLCanvasElement> {
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;
    const scale = context.referenceScale;
    const bSize = Math.max(4, Math.round(params.blockSize * scale));

    const srcCtx = canvasPool.getContext2D(sourceCanvas);
    const pixels = srcCtx.getImageData(0, 0, width, height).data;

    const cols =
      params.mode === 2
        ? Math.max(1, Math.floor(width / bSize))
        : Math.max(1, Math.ceil(width / bSize));
    const rows =
      params.mode === 2
        ? Math.max(1, Math.floor(height / bSize))
        : Math.max(1, Math.ceil(height / bSize));

    const grid = await workerBridge.downsampleGrid(pixels, width, height, cols, rows, signal);
    if (signal?.aborted) {
      const err = new Error('Render cancelled');
      err.name = 'AbortError';
      throw err;
    }

    return this.compositeResult(width, height, params.mode, params.paletteKey, bSize, scale, cols, rows, grid);
  }

  private compositeResult(
    width: number,
    height: number,
    mode: MinecraftParams['mode'],
    paletteKey: MinecraftParams['paletteKey'],
    bSize: number,
    scale: number,
    cols: number,
    rows: number,
    grid: Uint8ClampedArray
  ): HTMLCanvasElement {
    const targetCanvas = canvasPool.getCanvas('minecraft_output', width, height);
    const targetCtx = canvasPool.getContext2D(targetCanvas);
    targetCtx.imageSmoothingEnabled = false;
    targetCtx.fillStyle = '#1a1a1a';
    targetCtx.fillRect(0, 0, width, height);

    if (mode === 2) {
      this.renderAdvancedIsometricVoxels(
        targetCtx,
        grid,
        width,
        height,
        cols,
        rows,
        bSize,
        scale,
        paletteKey
      );
    } else {
      this.render2DFlatTexturedMap(targetCtx, grid, cols, rows, bSize, paletteKey);
    }

    return targetCanvas;
  }

  private render2DFlatTexturedMap(
    ctx: CanvasRenderingContext2D,
    grid: Uint8ClampedArray,
    cols: number,
    rows: number,
    bSize: number,
    paletteKey: MinecraftParams['paletteKey']
  ): void {
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const i = (gy * cols + gx) * 4;
        const r = grid[i] ?? 0;
        const g = grid[i + 1] ?? 0;
        const b = grid[i + 2] ?? 0;
        const a = (grid[i + 3] ?? 0) / 255;
        if (a < 0.1) continue;

        const lum = luminance(r, g, b) / 255;
        const texName = this.selectBlockOklab(r, g, b, lum, gx, gy);
        const tex = this.textures[texName];

        const x = gx * bSize;
        const y = gy * bSize;
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

  private getOrCreateIsoSprite(
    topKey: BlockType,
    sideKey: BlockType,
    isoW: number,
    isoH: number,
    sideH: number
  ): HTMLCanvasElement {
    const dimKey = `${isoW}x${isoH}x${sideH}`;
    if (this.isoSpriteCacheKey !== dimKey) {
      this.isoSpriteCache.clear();
      this.isoSpriteCacheKey = dimKey;
    }

    const cacheKey = `${topKey}:${sideKey}`;
    const existing = this.isoSpriteCache.get(cacheKey);
    if (existing) return existing;

    const sprite = document.createElement('canvas');
    sprite.width = isoW;
    sprite.height = isoH + sideH;
    const sCtx = sprite.getContext('2d');
    if (!sCtx) return sprite;

    sCtx.imageSmoothingEnabled = false;
    sCtx.translate(isoW / 2, 0);

    const hHalf = isoH / 2;
    const topTex = this.textures[topKey];
    const sideTex = this.textures[sideKey];

    // Üst Yüz
    sCtx.save();
    sCtx.beginPath();
    sCtx.moveTo(0, 0);
    sCtx.lineTo(isoW / 2, hHalf);
    sCtx.lineTo(0, isoH);
    sCtx.lineTo(-isoW / 2, hHalf);
    sCtx.closePath();
    sCtx.clip();
    sCtx.transform(isoW / 32, hHalf / 16, -isoW / 32, hHalf / 16, 0, 0);
    sCtx.drawImage(topTex, -16, 0, 32, 16);
    sCtx.restore();

    // Sol Yüz (Gölge)
    sCtx.save();
    sCtx.beginPath();
    sCtx.moveTo(-isoW / 2, hHalf);
    sCtx.lineTo(0, isoH);
    sCtx.lineTo(0, isoH + sideH);
    sCtx.lineTo(-isoW / 2, hHalf + sideH);
    sCtx.closePath();
    sCtx.clip();
    sCtx.transform(isoW / 32, hHalf / 16, 0, sideH / 16, -isoW / 2, hHalf);
    sCtx.drawImage(sideTex, 0, 0, 16, 16);
    sCtx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    sCtx.fillRect(0, 0, 16, 16);
    sCtx.restore();

    // Sağ Yüz (Yarı gölge)
    sCtx.save();
    sCtx.beginPath();
    sCtx.moveTo(0, isoH);
    sCtx.lineTo(isoW / 2, hHalf);
    sCtx.lineTo(isoW / 2, hHalf + sideH);
    sCtx.lineTo(0, isoH + sideH);
    sCtx.closePath();
    sCtx.clip();
    sCtx.transform(isoW / 32, -hHalf / 16, 0, sideH / 16, 0, isoH);
    sCtx.drawImage(sideTex, 0, 0, 16, 16);
    sCtx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    sCtx.fillRect(0, 0, 16, 16);
    sCtx.restore();

    // İnce voxel kenar konturu
    sCtx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    sCtx.lineWidth = 0.6;
    sCtx.beginPath();
    sCtx.moveTo(-isoW / 2, hHalf);
    sCtx.lineTo(0, isoH);
    sCtx.lineTo(isoW / 2, hHalf);
    sCtx.moveTo(0, isoH);
    sCtx.lineTo(0, isoH + sideH);
    sCtx.stroke();

    this.isoSpriteCache.set(cacheKey, sprite);
    return sprite;
  }

  private renderAdvancedIsometricVoxels(
    ctx: CanvasRenderingContext2D,
    grid: Uint8ClampedArray,
    width: number,
    height: number,
    sw: number,
    sh: number,
    bSize: number,
    scale: number,
    paletteKey: MinecraftParams['paletteKey']
  ): void {
    const maxStackHeight = Math.max(2, Math.round(14 * scale));
    const heightMap = new Float32Array(sw * sh);
    const colorMap: CellColor[] = new Array(sw * sh);

    for (let gy = 0; gy < sh; gy++) {
      for (let gx = 0; gx < sw; gx++) {
        const idx = gy * sw + gx;
        const pIdx = idx * 4;
        const r = grid[pIdx] ?? 0;
        const g = grid[pIdx + 1] ?? 0;
        const b = grid[pIdx + 2] ?? 0;
        const a = (grid[pIdx + 3] ?? 0) / 255;
        const lum = luminance(r, g, b) / 255;

        heightMap[idx] = a < 0.1 ? 0 : Math.max(1, Math.round(lum * maxStackHeight));
        colorMap[idx] = { r, g, b, a, lum };
      }
    }

    const isoW = Math.max(4, bSize);
    const isoH = Math.max(2, Math.round(bSize * 0.55));
    const sideH = Math.max(3, Math.round(bSize * 0.75));

    let minIsoY = Infinity;
    let maxIsoY = -Infinity;

    for (let gy = 0; gy < sh; gy++) {
      for (let gx = 0; gx < sw; gx++) {
        const hStack = heightMap[gy * sw + gx] ?? 0;
        if (hStack <= 0) continue;
        const vOffset = hStack * (sideH * 0.5);
        const isoY = (gy + gx) * (isoH / 2);

        const topY = isoY - vOffset;
        const bottomY = isoY - sideH * 0.5 + isoH + sideH;
        if (topY < minIsoY) minIsoY = topY;
        if (bottomY > maxIsoY) maxIsoY = bottomY;
      }
    }

    if (!Number.isFinite(minIsoY) || !Number.isFinite(maxIsoY)) {
      minIsoY = 0;
      maxIsoY = isoH + sideH;
    }

    const minIsoX = -(sh - 1) * (isoW / 2);
    const maxIsoX = (sw - 1) * (isoW / 2);
    const offsetX = width / 2 - (minIsoX + maxIsoX) / 2;
    const offsetY = height / 2 - (minIsoY + maxIsoY) / 2;

    for (let gy = 0; gy < sh; gy++) {
      for (let gx = 0; gx < sw; gx++) {
        const idx = gy * sw + gx;
        const hStack = heightMap[idx] ?? 0;
        const cell = colorMap[idx]!;
        if (cell.a < 0.1 || hStack <= 0) continue;

        const drawX = offsetX + (gx - gy) * (isoW / 2);
        const drawY = offsetY + (gy + gx) * (isoH / 2);
        const vOffset = hStack * (sideH * 0.5);

        let shadowFactor = 1.0;
        if (gx > 0 && gy > 0) {
          const lightNeighborH = heightMap[(gy - 1) * sw + (gx - 1)] ?? 0;
          if (lightNeighborH > hStack) {
            shadowFactor = Math.max(0.38, 1.0 - (lightNeighborH - hStack) * 0.16);
          }
        }

        let aoFactor = 1.0;
        const rightH = gx < sw - 1 ? (heightMap[gy * sw + (gx + 1)] ?? 0) : 0;
        const downH = gy < sh - 1 ? (heightMap[(gy + 1) * sw + gx] ?? 0) : 0;
        if (rightH > hStack) aoFactor -= 0.14;
        if (downH > hStack) aoFactor -= 0.14;

        const totalLight = shadowFactor * aoFactor;
        const topTexKey = this.selectBlockOklab(cell.r, cell.g, cell.b, cell.lum, gx, gy);
        const sideTexKey: BlockType = topTexKey === 'grass_top' ? 'grass_side' : topTexKey;

        const minFrontH = Math.min(rightH, downH);
        const baseLvl = Math.max(1, minFrontH);
        const spriteX = Math.round(drawX - isoW / 2);

        if (baseLvl < hStack) {
          const subTopKey: BlockType = topTexKey === 'grass_top' ? 'dirt' : topTexKey;
          const subSideKey: BlockType = topTexKey === 'grass_top' ? 'dirt' : sideTexKey;
          const subSprite = this.getOrCreateIsoSprite(subTopKey, subSideKey, isoW, isoH, sideH);
          for (let lvl = baseLvl; lvl < hStack; lvl += 2) {
            const subY = Math.round(drawY - lvl * (sideH * 0.5));
            ctx.drawImage(subSprite, spriteX, subY);
          }
        }

        const sprite = this.getOrCreateIsoSprite(topTexKey, sideTexKey, isoW, isoH, sideH);
        const spriteY = Math.round(drawY - vOffset);
        ctx.drawImage(sprite, spriteX, spriteY);

        if (paletteKey === 'colorful' || totalLight < 0.98) {
          const baseSpriteY = Math.round(drawY - baseLvl * (sideH * 0.5));
          ctx.beginPath();
          ctx.moveTo(drawX, spriteY);
          ctx.lineTo(drawX + isoW / 2, spriteY + isoH / 2);
          ctx.lineTo(drawX + isoW / 2, baseSpriteY + isoH / 2 + sideH);
          ctx.lineTo(drawX, baseSpriteY + isoH + sideH);
          ctx.lineTo(drawX - isoW / 2, baseSpriteY + isoH / 2 + sideH);
          ctx.lineTo(drawX - isoW / 2, spriteY + isoH / 2);
          ctx.closePath();

          if (paletteKey === 'colorful') {
            ctx.fillStyle = `rgba(${cell.r}, ${cell.g}, ${cell.b}, 0.42)`;
            ctx.fill();
          }
          if (totalLight < 0.98) {
            ctx.fillStyle = `rgba(0, 0, 0, ${(1 - totalLight) * 0.72})`;
            ctx.fill();
          }
        }
      }
    }
  }

  private selectBlockOklab(
    r: number,
    g: number,
    b: number,
    lum: number,
    gx: number,
    gy: number
  ): BlockType {
    const lab = rgbToOklab(r, g, b);
    let bestBlock: BlockType = 'dirt';
    let bestDist = Infinity;

    for (let i = 0; i < MATCHABLE_BLOCKS.length; i++) {
      const candidate = MATCHABLE_BLOCKS[i]!;
      const dist = oklabDistanceSq(lab, this.blockOklab[candidate]);
      if (dist < bestDist) {
        bestDist = dist;
        bestBlock = candidate;
      }
    }

    if (bestBlock === 'stone' && lum > 0.58) {
      const hash = ((gx * 73856093) ^ (gy * 19349663)) >>> 0;
      if (hash % 100 > 86) return 'diamond_ore';
    }

    return bestBlock;
  }
}
