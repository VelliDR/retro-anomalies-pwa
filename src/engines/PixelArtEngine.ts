import { canvasPool } from '../core/CanvasPool.ts';
import {
  clampByte,
  oklabDistanceSq,
  rgbToOklab,
  type OKLab,
  type RGB,
} from '../core/ColorSpace.ts';
import { downsampleAreaAverage } from '../core/ImageResampler.ts';
import type {
  IImageEngine,
  PixelArtParams,
  PixelPaletteKey,
  RenderContext,
} from '../core/types.ts';
import { workerBridge } from '../core/WorkerBridge.ts';

const PALETTES: Record<PixelPaletteKey, readonly RGB[]> = {
  gameboy: [
    [15, 56, 15],
    [48, 98, 48],
    [139, 172, 15],
    [155, 188, 15],
  ],
  'gb-pocket': [
    [43, 43, 38],
    [112, 115, 96],
    [163, 166, 141],
    [212, 215, 193],
  ],
  cga: [
    [0, 0, 0],
    [85, 255, 255],
    [255, 85, 255],
    [255, 255, 255],
  ],
  c64: [
    [0, 0, 0],
    [255, 255, 255],
    [136, 0, 0],
    [170, 255, 238],
    [204, 68, 204],
    [0, 204, 85],
    [0, 0, 170],
    [238, 238, 77],
    [221, 136, 85],
    [102, 68, 0],
    [255, 119, 119],
    [51, 51, 51],
    [119, 119, 119],
    [170, 255, 102],
    [0, 136, 255],
    [187, 187, 187],
  ],
  cyberpunk: [
    [10, 10, 18],
    [255, 0, 127],
    [0, 240, 255],
    [138, 43, 226],
  ],
  vaporwave: [
    [32, 14, 58],
    [255, 113, 206],
    [1, 205, 254],
    [255, 153, 102],
  ],
};

const BAYER_4X4: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

interface PaletteEntry {
  rgb: RGB;
  lab: OKLab;
}

const PALETTE_LABS: Record<PixelPaletteKey, readonly PaletteEntry[]> = (() => {
  const map = {} as Record<PixelPaletteKey, readonly PaletteEntry[]>;
  for (const key of Object.keys(PALETTES) as PixelPaletteKey[]) {
    map[key] = PALETTES[key].map((rgb) => ({
      rgb,
      lab: rgbToOklab(rgb[0], rgb[1], rgb[2]),
    }));
  }
  return map;
})();

function findNearestOklab(
  r: number,
  g: number,
  b: number,
  entries: readonly PaletteEntry[]
): RGB {
  const targetLab = rgbToOklab(r, g, b);
  let minDistance = Infinity;
  let nearest: RGB = entries[0]?.rgb ?? [0, 0, 0];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const dist = oklabDistanceSq(targetLab, entry.lab);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = entry.rgb;
    }
  }
  return nearest;
}

export interface PixelArtGridResult {
  smallW: number;
  smallH: number;
  pixels: Uint8ClampedArray;
}

export function processPixelArtGrid(
  srcPixels: Uint8ClampedArray,
  w: number,
  h: number,
  params: PixelArtParams,
  referenceScale: number
): PixelArtGridResult {
  const scaledPixelSize = params.pixelSize * referenceScale;
  const targetDim = Math.max(16, Math.min(w, Math.round(scaledPixelSize)));
  const scale = targetDim / Math.max(w, h);
  const smallW = Math.max(8, Math.floor(w * scale));
  const smallH = Math.max(8, Math.floor(h * scale));

  const grid = downsampleAreaAverage(srcPixels, w, h, smallW, smallH);
  const outData = new Uint8ClampedArray(smallW * smallH * 4);

  const entries = PALETTE_LABS[params.paletteKey] ?? PALETTE_LABS.gameboy;
  const ditherMode = params.ditherMode ?? 'bayer';

  if (ditherMode === 'floyd-steinberg' || ditherMode === 'atkinson') {
    const work = new Float32Array(smallW * smallH * 3);
    for (let idx = 0; idx < smallW * smallH; idx++) {
      work[idx * 3] = grid[idx * 4] ?? 0;
      work[idx * 3 + 1] = grid[idx * 4 + 1] ?? 0;
      work[idx * 3 + 2] = grid[idx * 4 + 2] ?? 0;
    }

    const distribute = (
      nx: number,
      ny: number,
      er: number,
      eg: number,
      eb: number,
      weight: number
    ) => {
      if (nx < 0 || nx >= smallW || ny < 0 || ny >= smallH) return;
      const ni = (ny * smallW + nx) * 3;
      work[ni] = (work[ni] ?? 0) + er * weight;
      work[ni + 1] = (work[ni + 1] ?? 0) + eg * weight;
      work[ni + 2] = (work[ni + 2] ?? 0) + eb * weight;
    };

    for (let y = 0; y < smallH; y++) {
      for (let x = 0; x < smallW; x++) {
        const p3 = (y * smallW + x) * 3;
        const p4 = (y * smallW + x) * 4;
        const r = clampByte(work[p3] ?? 0);
        const g = clampByte(work[p3 + 1] ?? 0);
        const b = clampByte(work[p3 + 2] ?? 0);

        const [nr, ng, nb] = findNearestOklab(r, g, b, entries);
        outData[p4] = nr;
        outData[p4 + 1] = ng;
        outData[p4 + 2] = nb;
        outData[p4 + 3] = grid[p4 + 3] ?? 255;

        const er = r - nr;
        const eg = g - ng;
        const eb = b - nb;

        if (ditherMode === 'floyd-steinberg') {
          distribute(x + 1, y, er, eg, eb, 7 / 16);
          distribute(x - 1, y + 1, er, eg, eb, 3 / 16);
          distribute(x, y + 1, er, eg, eb, 5 / 16);
          distribute(x + 1, y + 1, er, eg, eb, 1 / 16);
        } else {
          const w8 = 1 / 8;
          distribute(x + 1, y, er, eg, eb, w8);
          distribute(x + 2, y, er, eg, eb, w8);
          distribute(x - 1, y + 1, er, eg, eb, w8);
          distribute(x, y + 1, er, eg, eb, w8);
          distribute(x + 1, y + 1, er, eg, eb, w8);
          distribute(x, y + 2, er, eg, eb, w8);
        }
      }
    }
  } else {
    const spread = ditherMode === 'bayer' ? (entries.length <= 6 ? 32 : 18) : 0;
    for (let y = 0; y < smallH; y++) {
      const bayerRow = BAYER_4X4[y & 3]!;
      for (let x = 0; x < smallW; x++) {
        const i = (y * smallW + x) * 4;
        let r = grid[i] ?? 0;
        let g = grid[i + 1] ?? 0;
        let b = grid[i + 2] ?? 0;

        if (spread > 0) {
          const bayerValue = (bayerRow[x & 3] ?? 0) / 16.0 - 0.5;
          r = clampByte(r + bayerValue * spread);
          g = clampByte(g + bayerValue * spread);
          b = clampByte(b + bayerValue * spread);
        }

        const [nr, ng, nb] = findNearestOklab(r, g, b, entries);
        outData[i] = nr;
        outData[i + 1] = ng;
        outData[i + 2] = nb;
        outData[i + 3] = grid[i + 3] ?? 255;
      }
    }
  }

  return { smallW, smallH, pixels: outData };
}

export class PixelArtEngine implements IImageEngine<PixelArtParams> {
  readonly id = 'pixelart' as const;

  private compositeGrid(
    w: number,
    h: number,
    result: PixelArtGridResult
  ): HTMLCanvasElement {
    const smallCanvas = canvasPool.getCanvas('pixel_small', result.smallW, result.smallH);
    const smallCtx = canvasPool.getContext2D(smallCanvas);
    const smallImg = smallCtx.createImageData(result.smallW, result.smallH);
    smallImg.data.set(result.pixels);
    smallCtx.putImageData(smallImg, 0, 0);

    const outputCanvas = canvasPool.getCanvas('pixel_output', w, h);
    const outCtx = canvasPool.getContext2D(outputCanvas);
    outCtx.imageSmoothingEnabled = false;
    outCtx.drawImage(smallCanvas, 0, 0, result.smallW, result.smallH, 0, 0, w, h);

    return outputCanvas;
  }

  render(
    sourceCanvas: HTMLCanvasElement,
    params: PixelArtParams,
    context: RenderContext
  ): HTMLCanvasElement {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const srcCtx = canvasPool.getContext2D(sourceCanvas);
    const srcPixels = srcCtx.getImageData(0, 0, w, h).data;
    const result = processPixelArtGrid(srcPixels, w, h, params, context.referenceScale);
    return this.compositeGrid(w, h, result);
  }

  async renderAsync(
    sourceCanvas: HTMLCanvasElement,
    params: PixelArtParams,
    context: RenderContext,
    signal?: AbortSignal
  ): Promise<HTMLCanvasElement> {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const srcCtx = canvasPool.getContext2D(sourceCanvas);
    const srcPixels = srcCtx.getImageData(0, 0, w, h).data;
    const result = await workerBridge.processPixelArt(
      srcPixels,
      w,
      h,
      params,
      context.referenceScale,
      signal
    );
    if (signal?.aborted) {
      const err = new Error('Render cancelled');
      err.name = 'AbortError';
      throw err;
    }
    return this.compositeGrid(w, h, result);
  }
}
