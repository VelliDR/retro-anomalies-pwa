import { canvasPool } from '../core/CanvasPool.ts';
import { clampByte, luminance } from '../core/ColorSpace.ts';
import { downsampleAreaAverage } from '../core/ImageResampler.ts';
import { createSeededRng } from '../core/Noise.ts';
import type { IImageEngine, RenderContext, ThermalPaperParams } from '../core/types.ts';
import { workerBridge } from '../core/WorkerBridge.ts';

const BAYER_4X4: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export interface ThermalDotsResult {
  dSize: number;
  matrixCols: number;
  matrixRows: number;
  dots: Uint8Array;
}

export function processThermalDots(
  srcPixels: Uint8ClampedArray,
  w: number,
  h: number,
  params: ThermalPaperParams,
  scale: number
): ThermalDotsResult {
  const dSize = Math.max(2, Math.round(3 * scale));
  const matrixCols = Math.max(1, Math.floor(w / dSize));
  const matrixRows = Math.max(1, Math.floor(h / dSize));

  const grid = downsampleAreaAverage(srcPixels, w, h, matrixCols, matrixRows);
  const dots = new Uint8Array(matrixCols * matrixRows);

  if (params.ditherMode === 'atkinson') {
    const lums = new Float32Array(matrixCols * matrixRows);
    for (let i = 0; i < lums.length; i++) {
      const p = i * 4;
      lums[i] = luminance(grid[p] ?? 0, grid[p + 1] ?? 0, grid[p + 2] ?? 0);
    }

    const spreadErr = (nx: number, ny: number, err: number) => {
      if (nx < 0 || nx >= matrixCols || ny < 0 || ny >= matrixRows) return;
      const ni = ny * matrixCols + nx;
      lums[ni] = (lums[ni] ?? 0) + err;
    };

    for (let gy = 0; gy < matrixRows; gy++) {
      for (let gx = 0; gx < matrixCols; gx++) {
        const idx = gy * matrixCols + gx;
        if ((grid[idx * 4 + 3] ?? 0) < 26) continue;

        const oldLum = lums[idx] ?? 0;
        const newLum = oldLum < 128 ? 0 : 255;
        if (newLum === 0) {
          dots[idx] = 1;
        }

        const err = (oldLum - newLum) / 8;
        spreadErr(gx + 1, gy, err);
        spreadErr(gx + 2, gy, err);
        spreadErr(gx - 1, gy + 1, err);
        spreadErr(gx, gy + 1, err);
        spreadErr(gx + 1, gy + 1, err);
        spreadErr(gx, gy + 2, err);
      }
    }
  } else {
    for (let gy = 0; gy < matrixRows; gy++) {
      const bayerRow = BAYER_4X4[gy & 3]!;
      for (let gx = 0; gx < matrixCols; gx++) {
        const idx = gy * matrixCols + gx;
        const p = idx * 4;
        if ((grid[p + 3] ?? 0) < 26) continue;

        const lum = luminance(grid[p] ?? 0, grid[p + 1] ?? 0, grid[p + 2] ?? 0);
        const bayerVal = (bayerRow[gx & 3] ?? 0) / 16.0 - 0.5;
        const ditheredLum = clampByte(lum + bayerVal * 64);

        if (ditheredLum < 128) {
          dots[idx] = 1;
        }
      }
    }
  }

  return { dSize, matrixCols, matrixRows, dots };
}

export class ThermalPaperEngine implements IImageEngine<ThermalPaperParams> {
  readonly id = 'thermalpaper' as const;

  private compositeDots(
    w: number,
    h: number,
    params: ThermalPaperParams,
    scale: number,
    result: ThermalDotsResult
  ): HTMLCanvasElement {
    const outputCanvas = canvasPool.getCanvas('thermal_output', w, h);
    const ctx = canvasPool.getContext2D(outputCanvas);

    const bgColor = params.paperType === 'aged' ? '#f3ebd7' : '#f7f7f4';
    const dotColor = params.paperType === 'aged' ? '#221e1a' : '#111111';

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = dotColor;
    const { dSize, matrixCols, matrixRows, dots } = result;
    for (let gy = 0; gy < matrixRows; gy++) {
      for (let gx = 0; gx < matrixCols; gx++) {
        if (dots[gy * matrixCols + gx] === 1) {
          ctx.fillRect(gx * dSize, gy * dSize, dSize, dSize);
        }
      }
    }

    const rng = createSeededRng(7331 + params.wear * 17);
    const normWear = params.wear / 100;
    if (normWear > 0) {
      const streakCount = Math.floor((3 + normWear * 14) * scale);
      ctx.fillStyle = bgColor;

      for (let s = 0; s < streakCount; s++) {
        const streakX = Math.floor(rng() * w);
        const streakW = Math.max(1, Math.round((1 + rng() * 2.5) * scale));
        ctx.fillRect(streakX, 0, streakW, h);
      }
    }

    if (params.tornEdge) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';

      const teethSize = Math.max(10, Math.round(18 * scale));
      const toothH = Math.max(4, Math.round(8 * scale));

      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let x = 0; x < w; x += teethSize) {
        ctx.lineTo(x + teethSize / 2, rng() * toothH + toothH * 0.5);
        ctx.lineTo(x + teethSize, 0);
      }
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x < w; x += teethSize) {
        ctx.lineTo(x + teethSize / 2, h - (rng() * toothH + toothH * 0.5));
        ctx.lineTo(x + teethSize, h);
      }
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }

    return outputCanvas;
  }

  render(
    sourceCanvas: HTMLCanvasElement,
    params: ThermalPaperParams,
    context: RenderContext
  ): HTMLCanvasElement {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const scale = context.referenceScale;
    const srcCtx = canvasPool.getContext2D(sourceCanvas);
    const srcPixels = srcCtx.getImageData(0, 0, w, h).data;
    const result = processThermalDots(srcPixels, w, h, params, scale);
    return this.compositeDots(w, h, params, scale, result);
  }

  async renderAsync(
    sourceCanvas: HTMLCanvasElement,
    params: ThermalPaperParams,
    context: RenderContext,
    signal?: AbortSignal
  ): Promise<HTMLCanvasElement> {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const scale = context.referenceScale;
    const srcCtx = canvasPool.getContext2D(sourceCanvas);
    const srcPixels = srcCtx.getImageData(0, 0, w, h).data;

    const result = await workerBridge.processThermalDots(srcPixels, w, h, params, scale, signal);
    if (signal?.aborted) {
      const err = new Error('Render cancelled');
      err.name = 'AbortError';
      throw err;
    }

    return this.compositeDots(w, h, params, scale, result);
  }
}
