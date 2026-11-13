import { canvasPool } from '../core/CanvasPool.ts';
import { luminance } from '../core/ColorSpace.ts';
import { createSeededRng } from '../core/Noise.ts';
import type { IImageEngine, RenderContext, SensorCorruptParams } from '../core/types.ts';
import { workerBridge } from '../core/WorkerBridge.ts';

export function processSensorCorruptPixels(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  params: SensorCorruptParams,
  scaleFactor: number,
  reusableBlockBuffer?: Uint8ClampedArray
): Uint8ClampedArray {
  const noiseIntensity = params.noiseIntensity / 100;
  const chaosLevel = params.chaosLevel / 100;
  const random = createSeededRng(params.seed);

  let blockBuffer = reusableBlockBuffer ?? new Uint8ClampedArray(0);

  if (params.mode === 'chaos') {
    const numBlocks = Math.floor(8 * chaosLevel) + 1;
    const maxPossibleBlockLen = w * Math.max(1, Math.floor(26 * scaleFactor)) * 4;
    if (blockBuffer.length < maxPossibleBlockLen) {
      blockBuffer = new Uint8ClampedArray(maxPossibleBlockLen);
    }

    for (let b = 0; b < numBlocks; b++) {
      const blockH = Math.max(1, Math.floor((random() * 20 + 6) * scaleFactor));
      const srcY = Math.floor(random() * Math.max(1, h - blockH));
      const destY = Math.floor(random() * Math.max(1, h - blockH));
      const shiftX = Math.floor((random() - 0.5) * w * 0.3 * chaosLevel);

      const blockLen = w * blockH * 4;
      const srcStart = srcY * w * 4;
      blockBuffer.set(data.subarray(srcStart, srcStart + blockLen));

      for (let y = 0; y < blockH; y++) {
        const destYPos = destY + y;
        if (destYPos < 0 || destYPos >= h) continue;

        for (let x = 0; x < w; x++) {
          const srcIdx = (y * w + x) * 4;
          const destX = x + shiftX;
          if (destX < 0 || destX >= w) continue;

          const destIdx = destYPos * w * 4 + destX * 4;
          data[destIdx] = ((blockBuffer[srcIdx + 1] ?? 0) * 0.7 + (data[destIdx] ?? 0) * 0.3) | 0;
          data[destIdx + 1] = ((blockBuffer[srcIdx] ?? 0) * 0.7 + (data[destIdx + 1] ?? 0) * 0.3) | 0;
          data[destIdx + 2] = blockBuffer[srcIdx + 2] ?? 0;
          data[destIdx + 3] = 255;
        }
      }
    }

    let chaosSeed = (random() * 0xffffff) | 0;
    const noiseThreshold = noiseIntensity * 0.8;

    for (let i = 0; i < data.length; i += 4) {
      chaosSeed = (chaosSeed * 16807 + 31) & 0xffffff;
      const seedByte = chaosSeed & 0xff;

      if (random() < noiseThreshold) {
        const selector = (seedByte + i) % 3;
        const r = data[i] ?? 0;
        const g = data[i + 1] ?? 0;
        const b = data[i + 2] ?? 0;

        if (selector === 0) {
          data[i] = g;
          data[i + 1] = b;
          data[i + 2] = r;
        } else if (selector === 1) {
          data[i] = (r ^ (seedByte & 0x3f)) & 0xff;
          data[i + 1] = Math.min(255, (g * (1.0 + chaosLevel)) | 0);
        } else {
          data[i] = (r >> 2) << 2;
          data[i + 1] = (g >> 2) << 2;
          data[i + 2] = (b >> 2) << 2;
        }
      }
      data[i + 3] = 255;
    }
  } else {
    if (params.lineJitter) {
      for (let y = 0; y < h; y++) {
        if (random() < 0.04 + noiseIntensity * 0.25) {
          const shiftX = Math.floor((random() - 0.5) * (8 + noiseIntensity * 35) * scaleFactor);
          const rowStart = y * w * 4;
          if (shiftX > 0 && shiftX < w) {
            data.copyWithin(rowStart + shiftX * 4, rowStart, rowStart + (w - shiftX) * 4);
          } else if (shiftX < 0 && -shiftX < w) {
            data.copyWithin(rowStart, rowStart - shiftX * 4, rowStart + (w + shiftX) * 4);
          }
        }
      }
    }

    const noiseAmplitude = 380 * noiseIntensity * scaleFactor;
    const thresholdOverdrive = Math.min(1.0, noiseIntensity * 0.9);
    const thresholdBitShift = noiseIntensity * 0.5;

    for (let i = 0; i < data.length; i += 4) {
      const origR = data[i] ?? 0;
      const origG = data[i + 1] ?? 0;
      const origB = data[i + 2] ?? 0;
      const origLum = luminance(origR, origG, origB);

      let r = origR;
      let g = origG;
      let b = origB;

      if (random() < thresholdOverdrive) {
        r += (random() - 0.5) * noiseAmplitude;
        g += (random() - 0.5) * noiseAmplitude;
        b += (random() - 0.5) * noiseAmplitude;
      }

      if (params.bitShift && origLum >= 50 && random() < thresholdBitShift) {
        if (g > 80) {
          r = (r ^ 0x44) & 0xff;
          g = Math.min(255, g * 1.4);
        }
        if (r > 100) {
          b = (b | 0xaa) & 0xff;
        }
      }

      r = Math.max(0, r);
      g = Math.max(0, g);
      b = Math.max(0, b);

      const newLum = luminance(r, g, b);
      if (newLum > 1) {
        const targetLum = origLum * 0.75 + newLum * 0.25;
        const lumRatio = targetLum / newLum;
        r = Math.min(255, r * lumRatio);
        g = Math.min(255, g * lumRatio);
        b = Math.min(255, b * lumRatio);
      }

      data[i] = r | 0;
      data[i + 1] = g | 0;
      data[i + 2] = b | 0;
    }
  }

  return blockBuffer;
}

export class SensorCorruptEngine implements IImageEngine<SensorCorruptParams> {
  readonly id = 'sensorcorrupt' as const;
  private blockBuffer: Uint8ClampedArray = new Uint8ClampedArray(0);

  render(
    sourceCanvas: HTMLCanvasElement,
    params: SensorCorruptParams,
    context: RenderContext
  ): HTMLCanvasElement {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const outCanvas = canvasPool.getCanvas('sensor_temp', w, h);
    const ctx = canvasPool.getContext2D(outCanvas);
    ctx.drawImage(sourceCanvas, 0, 0);

    const imageData = ctx.getImageData(0, 0, w, h);
    this.blockBuffer = processSensorCorruptPixels(
      imageData.data,
      w,
      h,
      params,
      context.referenceScale,
      this.blockBuffer
    );

    ctx.putImageData(imageData, 0, 0);
    return outCanvas;
  }

  async renderAsync(
    sourceCanvas: HTMLCanvasElement,
    params: SensorCorruptParams,
    context: RenderContext,
    signal?: AbortSignal
  ): Promise<HTMLCanvasElement> {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const srcCtx = canvasPool.getContext2D(sourceCanvas);
    const imageData = srcCtx.getImageData(0, 0, w, h);

    const processed = await workerBridge.processSensorCorrupt(
      imageData.data,
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

    imageData.data.set(processed);
    const outCanvas = canvasPool.getCanvas('sensor_temp', w, h);
    const ctx = canvasPool.getContext2D(outCanvas);
    ctx.putImageData(imageData, 0, 0);
    return outCanvas;
  }
}
