import { canvasPool } from '../core/CanvasPool.ts';
import { clampByte, luminance } from '../core/ColorSpace.ts';
import { createSeededRng } from '../core/Noise.ts';
import type { IImageEngine, PostcardParams, RenderContext } from '../core/types.ts';
import { workerBridge } from '../core/WorkerBridge.ts';
import {
  computeScharrStructureTensor,
  sampleTensorBilinear,
} from './vangogh/StructureTensor.ts';

/** Her segment 5 float içerir: [x0, y0, x1, y1, lineWidth] */
export function computePostcardEngravingSegments(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  density: number,
  scaleFactor: number
): Float32Array {
  const tensor = computeScharrStructureTensor(data, w, h, 384);
  const step = Math.max(3, Math.round(density * scaleFactor));
  const halfStep = step * 0.65;
  const baseAngle = Math.PI * 0.25;

  const cols = Math.ceil(w / step);
  const rows = Math.ceil(h / step);
  const maxSegments = cols * rows * 2;
  const out = new Float32Array(maxSegments * 5);
  let cursor = 0;

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      let lumSum = 0;
      let count = 0;
      const yEnd = Math.min(h, y + step);
      const xEnd = Math.min(w, x + step);
      for (let py = y; py < yEnd; py++) {
        for (let px = x; px < xEnd; px++) {
          const i = (py * w + px) * 4;
          lumSum += luminance(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
          count++;
        }
      }
      const brightness = count > 0 ? lumSum / count : 255;
      if (brightness >= 225) continue;

      const cx = x + step * 0.5;
      const cy = y + step * 0.5;
      const sample = sampleTensorBilinear(tensor, cx, cy);
      const edgeAngle = Math.atan2(sample.vy, sample.vx);

      const vx = sample.vx * sample.coherence + Math.cos(baseAngle) * (1 - sample.coherence);
      const vy = sample.vy * sample.coherence + Math.sin(baseAngle) * (1 - sample.coherence);
      const vLen = Math.hypot(vx, vy) || 1;
      const tx = (vx / vLen) * halfStep;
      const ty = (vy / vLen) * halfStep;

      const darkness = (255 - brightness) / 255;
      out[cursor++] = cx - tx;
      out[cursor++] = cy - ty;
      out[cursor++] = cx + tx;
      out[cursor++] = cy + ty;
      out[cursor++] = Math.max(0.7 * scaleFactor, darkness * step * 0.52);

      if (brightness < 110) {
        const crossAngle =
          edgeAngle * sample.coherence + baseAngle * (1 - sample.coherence) + Math.PI * 0.5;
        const ctxX = Math.cos(crossAngle) * halfStep * 0.85;
        const ctxY = Math.sin(crossAngle) * halfStep * 0.85;
        out[cursor++] = cx - ctxX;
        out[cursor++] = cy - ctxY;
        out[cursor++] = cx + ctxX;
        out[cursor++] = cy + ctxY;
        out[cursor++] = Math.max(0.55 * scaleFactor, ((110 - brightness) / 110) * step * 0.36);
      }
    }
  }

  return out.subarray(0, cursor);
}

export function applyPostcardPaperNoisePixels(data: Uint8ClampedArray): void {
  const rng = createSeededRng(4041);
  for (let i = 0; i < data.length; i += 4) {
    const noise = (rng() - 0.5) * 22;
    data[i] = clampByte((data[i] ?? 0) + noise);
    data[i + 1] = clampByte((data[i + 1] ?? 0) + noise);
    data[i + 2] = clampByte((data[i + 2] ?? 0) + noise);
  }
}

export class PostcardEngine implements IImageEngine<PostcardParams> {
  readonly id = 'postcard' as const;

  private drawStampFrameAndComposite(
    sourceW: number,
    sourceH: number,
    imgCanvas: HTMLCanvasElement,
    margin: number,
    scaleFactor: number
  ): HTMLCanvasElement {
    const w = sourceW + margin * 2;
    const h = sourceH + margin * 2;
    const outCanvas = canvasPool.getCanvas('postcard_out', w, h);
    const ctx = canvasPool.getContext2D(outCanvas);

    ctx.fillStyle = '#f3efe6';
    ctx.fillRect(0, 0, w, h);

    const holeRadius = Math.max(3, Math.round(5 * scaleFactor));
    const holeSpacing = Math.max(10, Math.round(14 * scaleFactor));

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000000';

    for (let x = holeSpacing; x < w; x += holeSpacing) {
      ctx.beginPath();
      ctx.arc(x, 0, holeRadius, 0, Math.PI * 2);
      ctx.arc(x, h, holeRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let y = holeSpacing; y < h; y += holeSpacing) {
      ctx.beginPath();
      ctx.arc(0, y, holeRadius, 0, Math.PI * 2);
      ctx.arc(w, y, holeRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(30, 30, 30, 0.85)';
    ctx.lineWidth = Math.max(1, Math.round(1.5 * scaleFactor));
    ctx.strokeRect(holeRadius / 2, holeRadius / 2, w - holeRadius, h - holeRadius);
    ctx.restore();

    ctx.drawImage(imgCanvas, margin, margin);

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.lineWidth = Math.max(1, Math.round(1 * scaleFactor));
    ctx.strokeRect(margin, margin, sourceW, sourceH);

    return outCanvas;
  }

  private drawEngravingSegments(
    imgCtx: CanvasRenderingContext2D,
    w: number,
    h: number,
    segments: Float32Array
  ): void {
    imgCtx.fillStyle = '#e8e4d8';
    imgCtx.fillRect(0, 0, w, h);
    imgCtx.lineCap = 'round';
    imgCtx.strokeStyle = '#1b263b';

    for (let i = 0; i < segments.length; i += 5) {
      imgCtx.lineWidth = segments[i + 4] ?? 1;
      imgCtx.beginPath();
      imgCtx.moveTo(segments[i] ?? 0, segments[i + 1] ?? 0);
      imgCtx.lineTo(segments[i + 2] ?? 0, segments[i + 3] ?? 0);
      imgCtx.stroke();
    }
  }

  render(
    sourceCanvas: HTMLCanvasElement,
    params: PostcardParams,
    context: RenderContext
  ): HTMLCanvasElement {
    const scaleFactor = context.referenceScale;
    const margin = Math.round(params.stampMargin * scaleFactor);
    const sw = sourceCanvas.width;
    const sh = sourceCanvas.height;

    const imgCanvas = canvasPool.getCanvas('postcard_img', sw, sh);
    const imgCtx = canvasPool.getContext2D(imgCanvas);
    const srcCtx = canvasPool.getContext2D(sourceCanvas);

    if (params.mode === 'engraving') {
      const data = srcCtx.getImageData(0, 0, sw, sh).data;
      const segments = computePostcardEngravingSegments(
        data,
        sw,
        sh,
        params.engraveDensity,
        scaleFactor
      );
      this.drawEngravingSegments(imgCtx, sw, sh, segments);
    } else {
      const imgData = srcCtx.getImageData(0, 0, sw, sh);
      applyPostcardPaperNoisePixels(imgData.data);
      imgCtx.putImageData(imgData, 0, 0);
    }

    return this.drawStampFrameAndComposite(sw, sh, imgCanvas, margin, scaleFactor);
  }

  async renderAsync(
    sourceCanvas: HTMLCanvasElement,
    params: PostcardParams,
    context: RenderContext,
    signal?: AbortSignal
  ): Promise<HTMLCanvasElement> {
    const scaleFactor = context.referenceScale;
    const margin = Math.round(params.stampMargin * scaleFactor);
    const sw = sourceCanvas.width;
    const sh = sourceCanvas.height;
    const srcCtx = canvasPool.getContext2D(sourceCanvas);

    if (params.mode === 'engraving') {
      const data = srcCtx.getImageData(0, 0, sw, sh).data;
      const segments = await workerBridge.computePostcardEngraving(
        data,
        sw,
        sh,
        params.engraveDensity,
        scaleFactor,
        signal
      );
      if (signal?.aborted) {
        const err = new Error('Render cancelled');
        err.name = 'AbortError';
        throw err;
      }
      const imgCanvas = canvasPool.getCanvas('postcard_img', sw, sh);
      const imgCtx = canvasPool.getContext2D(imgCanvas);
      this.drawEngravingSegments(imgCtx, sw, sh, segments);
      return this.drawStampFrameAndComposite(sw, sh, imgCanvas, margin, scaleFactor);
    }

    const imgData = srcCtx.getImageData(0, 0, sw, sh);
    const noisyPixels = await workerBridge.applyPostcardPaperNoise(imgData.data, signal);
    if (signal?.aborted) {
      const err = new Error('Render cancelled');
      err.name = 'AbortError';
      throw err;
    }
    const imgCanvas = canvasPool.getCanvas('postcard_img', sw, sh);
    const imgCtx = canvasPool.getContext2D(imgCanvas);
    imgData.data.set(noisyPixels);
    imgCtx.putImageData(imgData, 0, 0);
    return this.drawStampFrameAndComposite(sw, sh, imgCanvas, margin, scaleFactor);
  }
}
