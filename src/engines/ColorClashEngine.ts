import { canvasPool } from '../core/CanvasPool.ts';
import { luminance, type RGB } from '../core/ColorSpace.ts';
import type { ColorClashParams, IImageEngine, RenderContext } from '../core/types.ts';
import { workerBridge } from '../core/WorkerBridge.ts';

// Gerçek ZX Spectrum donanımı: Her 8x8 blok 1-bit BRIGHT bayrağı paylaşır.
// Normal (192) ve Bright (255) renkler aynı hücrede karıştırılamaz (Siyah ortak).
export const SPECTRUM_NORMAL_BANK: readonly RGB[] = [
  [0, 0, 0],
  [0, 0, 192],
  [192, 0, 0],
  [192, 0, 192],
  [0, 192, 0],
  [0, 192, 192],
  [192, 192, 0],
  [192, 192, 192],
];

export const SPECTRUM_BRIGHT_BANK: readonly RGB[] = [
  [0, 0, 0],
  [0, 0, 255],
  [255, 0, 0],
  [255, 0, 255],
  [0, 255, 0],
  [0, 255, 255],
  [255, 255, 0],
  [255, 255, 255],
];

function closestInBank(r: number, g: number, b: number, bank: readonly RGB[]): RGB {
  let minDist = Infinity;
  let closest: RGB = bank[0]!;
  for (let i = 0; i < bank.length; i++) {
    const p = bank[i]!;
    const dr = r - p[0];
    const dg = g - p[1];
    const db = b - p[2];
    const dist = dr * dr + dg * dg + db * db;
    if (dist < minDist) {
      minDist = dist;
      closest = p;
    }
  }
  return closest;
}

export function solveSpectrumBlock(
  d: Uint8ClampedArray,
  w: number,
  h: number,
  bx: number,
  by: number,
  bSize: number
): { ink: RGB; paper: RGB; avgLum: number; isSolid: boolean } {
  let minLum = 255;
  let maxLum = 0;
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;

  for (let py = 0; py < bSize && by + py < h; py++) {
    for (let px = 0; px < bSize && bx + px < w; px++) {
      const i = ((by + py) * w + (bx + px)) * 4;
      const r = d[i] ?? 0;
      const g = d[i + 1] ?? 0;
      const b = d[i + 2] ?? 0;
      const lum = luminance(r, g, b);
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
      totalR += r;
      totalG += g;
      totalB += b;
      count++;
    }
  }

  if (count === 0) {
    return { ink: [0, 0, 0], paper: [0, 0, 0], avgLum: 128, isSolid: true };
  }

  const avgR = totalR / count;
  const avgG = totalG / count;
  const avgB = totalB / count;
  const avgLum = (minLum + maxLum) * 0.5;

  if (maxLum - minLum < 22) {
    const nCol = closestInBank(avgR, avgG, avgB, SPECTRUM_NORMAL_BANK);
    const bCol = closestInBank(avgR, avgG, avgB, SPECTRUM_BRIGHT_BANK);
    const errN = (avgR - nCol[0]) ** 2 + (avgG - nCol[1]) ** 2 + (avgB - nCol[2]) ** 2;
    const errB = (avgR - bCol[0]) ** 2 + (avgG - bCol[1]) ** 2 + (avgB - bCol[2]) ** 2;
    const solid = errB < errN ? bCol : nCol;
    return { ink: solid, paper: solid, avgLum, isSolid: true };
  }

  let darkR = 0;
  let darkG = 0;
  let darkB = 0;
  let darkN = 0;
  let lightR = 0;
  let lightG = 0;
  let lightB = 0;
  let lightN = 0;

  for (let py = 0; py < bSize && by + py < h; py++) {
    for (let px = 0; px < bSize && bx + px < w; px++) {
      const i = ((by + py) * w + (bx + px)) * 4;
      const r = d[i] ?? 0;
      const g = d[i + 1] ?? 0;
      const b = d[i + 2] ?? 0;
      if (luminance(r, g, b) < avgLum) {
        darkR += r;
        darkG += g;
        darkB += b;
        darkN++;
      } else {
        lightR += r;
        lightG += g;
        lightB += b;
        lightN++;
      }
    }
  }

  const dR = darkN > 0 ? darkR / darkN : avgR;
  const dG = darkN > 0 ? darkG / darkN : avgG;
  const dB = darkN > 0 ? darkB / darkN : avgB;
  const lR = lightN > 0 ? lightR / lightN : avgR;
  const lG = lightN > 0 ? lightG / lightN : avgG;
  const lB = lightN > 0 ? lightB / lightN : avgB;

  const evalBank = (bank: readonly RGB[]) => {
    const ink = closestInBank(dR, dG, dB, bank);
    const paper = closestInBank(lR, lG, lB, bank);
    let err = 0;
    for (let py = 0; py < bSize && by + py < h; py++) {
      for (let px = 0; px < bSize && bx + px < w; px++) {
        const i = ((by + py) * w + (bx + px)) * 4;
        const r = d[i] ?? 0;
        const g = d[i + 1] ?? 0;
        const b = d[i + 2] ?? 0;
        const c = luminance(r, g, b) < avgLum ? ink : paper;
        err += (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2;
      }
    }
    return { ink, paper, err };
  };

  const normalFit = evalBank(SPECTRUM_NORMAL_BANK);
  const brightFit = evalBank(SPECTRUM_BRIGHT_BANK);
  const chosen = brightFit.err < normalFit.err ? brightFit : normalFit;

  return { ink: chosen.ink, paper: chosen.paper, avgLum, isSolid: false };
}

export function processColorClashPixels(
  d: Uint8ClampedArray,
  w: number,
  h: number,
  blockSize: number,
  referenceScale: number
): void {
  const scaledBlockSize = Math.max(2, Math.round(blockSize * referenceScale));

  for (let by = 0; by < h; by += scaledBlockSize) {
    for (let bx = 0; bx < w; bx += scaledBlockSize) {
      const block = solveSpectrumBlock(d, w, h, bx, by, scaledBlockSize);

      for (let py = 0; py < scaledBlockSize && by + py < h; py++) {
        for (let px = 0; px < scaledBlockSize && bx + px < w; px++) {
          const i = ((by + py) * w + (bx + px)) * 4;
          const chosen = block.isSolid
            ? block.ink
            : luminance(d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0) < block.avgLum
            ? block.ink
            : block.paper;
          d[i] = chosen[0];
          d[i + 1] = chosen[1];
          d[i + 2] = chosen[2];
        }
      }
    }
  }
}

export class ColorClashEngine implements IImageEngine<ColorClashParams> {
  readonly id = 'colorclash' as const;

  render(
    sourceCanvas: HTMLCanvasElement,
    params: ColorClashParams,
    context: RenderContext
  ): HTMLCanvasElement {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;

    const outputCanvas = canvasPool.getCanvas('clash_output', w, h);
    const ctx = canvasPool.getContext2D(outputCanvas);
    const srcCtx = canvasPool.getContext2D(sourceCanvas);

    const imgData = srcCtx.getImageData(0, 0, w, h);
    processColorClashPixels(imgData.data, w, h, params.blockSize, context.referenceScale);

    ctx.putImageData(imgData, 0, 0);
    return outputCanvas;
  }

  async renderAsync(
    sourceCanvas: HTMLCanvasElement,
    params: ColorClashParams,
    context: RenderContext,
    signal?: AbortSignal
  ): Promise<HTMLCanvasElement> {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const srcCtx = canvasPool.getContext2D(sourceCanvas);
    const imgData = srcCtx.getImageData(0, 0, w, h);

    const processed = await workerBridge.processColorClash(
      imgData.data,
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

    imgData.data.set(processed);
    const outputCanvas = canvasPool.getCanvas('clash_output', w, h);
    const ctx = canvasPool.getContext2D(outputCanvas);
    ctx.putImageData(imgData, 0, 0);
    return outputCanvas;
  }
}
