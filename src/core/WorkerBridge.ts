import { downsampleAreaAverage } from './ImageResampler.ts';
import type {
  ColorClashParams,
  PixelArtParams,
  SensorCorruptParams,
  ThermalPaperParams,
  VanGoghParams,
} from './types.ts';
import { processColorClashPixels } from '../engines/ColorClashEngine.ts';
import { processPixelArtGrid, type PixelArtGridResult } from '../engines/PixelArtEngine.ts';
import {
  applyPostcardPaperNoisePixels,
  computePostcardEngravingSegments,
} from '../engines/PostcardEngine.ts';
import { processSensorCorruptPixels } from '../engines/SensorCorruptEngine.ts';
import { processThermalDots, type ThermalDotsResult } from '../engines/ThermalPaperEngine.ts';
import {
  generateVanGoghStrokes,
  packStrokesToRibbonChunks,
  type StrokeInstance,
} from '../engines/vangogh/StrokeGenerator.ts';
import type { WorkerJobRequest, WorkerJobResponse } from '../workers/render.worker.ts';

type WorkerSuccessResponse = Extract<WorkerJobResponse, { ok: true }>;

interface PendingJob {
  resolve: (res: WorkerSuccessResponse) => void;
  reject: (err: Error) => void;
  cleanup?: () => void;
}

function createAbortError(message = 'Render cancelled'): Error {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

/**
 * Ağır piksel & fırça hesaplamalarını Transferable ArrayBuffer (zero-copy)
 * ile arka plan Web Worker'ına taşır ve AbortSignal ile stale render'ları iptal eder.
 */
export class WorkerBridge {
  private worker: Worker | null = null;
  private workerDisabled = false;
  private nextId = 1;
  private readonly pending = new Map<number, PendingJob>();

  private getWorker(): Worker | null {
    if (this.workerDisabled || typeof Worker === 'undefined') {
      return null;
    }
    if (!this.worker) {
      try {
        this.worker = new Worker(new URL('../workers/render.worker.ts', import.meta.url), {
          type: 'module',
        });
        this.worker.onmessage = (event: MessageEvent<WorkerJobResponse>) => {
          const msg = event.data;
          const job = this.pending.get(msg.id);
          if (!job) return;
          this.pending.delete(msg.id);
          job.cleanup?.();
          if (msg.ok) {
            job.resolve(msg);
          } else {
            job.reject(new Error(msg.error));
          }
        };
        this.worker.onerror = (event: ErrorEvent) => {
          const message = event.message || 'Render worker crashed';
          this.workerDisabled = true;
          this.worker?.terminate();
          this.worker = null;
          for (const [id, job] of this.pending.entries()) {
            this.pending.delete(id);
            job.cleanup?.();
            job.reject(new Error(message));
          }
        };
      } catch {
        this.workerDisabled = true;
        this.worker = null;
      }
    }
    return this.worker;
  }

  private dispatch(
    request: WorkerJobRequest,
    transferables: Transferable[],
    signal?: AbortSignal
  ): Promise<WorkerSuccessResponse> {
    if (signal?.aborted) {
      return Promise.reject(createAbortError());
    }

    const worker = this.getWorker();
    if (!worker) {
      return Promise.reject(new Error('Web Worker unavailable'));
    }

    return new Promise<WorkerSuccessResponse>((resolve, reject) => {
      const onAbort = () => {
        if (this.pending.delete(request.id)) {
          reject(createAbortError());
        }
      };

      const cleanup = () => {
        signal?.removeEventListener('abort', onAbort);
      };

      this.pending.set(request.id, { resolve, reject, cleanup });
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        worker.postMessage(request, transferables);
      } catch (err) {
        this.pending.delete(request.id);
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private async runWithPixelBuffer<T>(
    pixels: Uint8ClampedArray,
    buildRequest: (id: number, buffer: ArrayBuffer) => WorkerJobRequest,
    extractResult: (res: WorkerSuccessResponse) => T | null,
    fallback: () => T,
    signal?: AbortSignal
  ): Promise<T> {
    if (signal?.aborted) throw createAbortError();

    if (typeof Worker !== 'undefined' && !this.workerDisabled) {
      const copy = new Uint8ClampedArray(pixels);
      const buffer = copy.buffer as ArrayBuffer;
      try {
        const res = await this.dispatch(buildRequest(this.nextId++, buffer), [buffer], signal);
        const extracted = extractResult(res);
        if (extracted !== null) return extracted;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw err;
        console.warn('Worker görevi başarısız oldu, CPU yedek yoluna dönülüyor:', err);
      }
    }

    if (signal?.aborted) throw createAbortError();
    return fallback();
  }

  computeVanGoghRibbons(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    params: VanGoghParams,
    scale: number,
    signal?: AbortSignal
  ): Promise<Float32Array[]> {
    return this.runWithPixelBuffer(
      pixels,
      (id, buffer) => ({ id, kind: 'vangogh-ribbons', width, height, buffer, params, scale }),
      (res) => (res.kind === 'vangogh-ribbons' ? res.chunks.map((c) => new Float32Array(c)) : null),
      () => packStrokesToRibbonChunks(generateVanGoghStrokes(pixels, width, height, params, scale)),
      signal
    );
  }

  computeVanGoghStrokes(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    params: VanGoghParams,
    scale: number,
    signal?: AbortSignal
  ): Promise<StrokeInstance[]> {
    return this.runWithPixelBuffer(
      pixels,
      (id, buffer) => ({ id, kind: 'vangogh-strokes', width, height, buffer, params, scale }),
      (res) => (res.kind === 'vangogh-strokes' ? res.strokes : null),
      () => generateVanGoghStrokes(pixels, width, height, params, scale),
      signal
    );
  }

  processColorClash(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    params: ColorClashParams,
    referenceScale: number,
    signal?: AbortSignal
  ): Promise<Uint8ClampedArray> {
    return this.runWithPixelBuffer(
      pixels,
      (id, buffer) => ({ id, kind: 'colorclash', width, height, buffer, params, referenceScale }),
      (res) => (res.kind === 'colorclash' ? new Uint8ClampedArray(res.buffer) : null),
      () => {
        const out = new Uint8ClampedArray(pixels);
        processColorClashPixels(out, width, height, params.blockSize, referenceScale);
        return out;
      },
      signal
    );
  }

  processSensorCorrupt(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    params: SensorCorruptParams,
    scaleFactor: number,
    signal?: AbortSignal
  ): Promise<Uint8ClampedArray> {
    return this.runWithPixelBuffer(
      pixels,
      (id, buffer) => ({ id, kind: 'sensorcorrupt', width, height, buffer, params, scaleFactor }),
      (res) => (res.kind === 'sensorcorrupt' ? new Uint8ClampedArray(res.buffer) : null),
      () => {
        const out = new Uint8ClampedArray(pixels);
        processSensorCorruptPixels(out, width, height, params, scaleFactor);
        return out;
      },
      signal
    );
  }

  processPixelArt(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    params: PixelArtParams,
    referenceScale: number,
    signal?: AbortSignal
  ): Promise<PixelArtGridResult> {
    return this.runWithPixelBuffer(
      pixels,
      (id, buffer) => ({ id, kind: 'pixelart', width, height, buffer, params, referenceScale }),
      (res) =>
        res.kind === 'pixelart'
          ? { smallW: res.smallW, smallH: res.smallH, pixels: new Uint8ClampedArray(res.buffer) }
          : null,
      () => processPixelArtGrid(pixels, width, height, params, referenceScale),
      signal
    );
  }

  processThermalDots(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    params: ThermalPaperParams,
    scale: number,
    signal?: AbortSignal
  ): Promise<ThermalDotsResult> {
    return this.runWithPixelBuffer(
      pixels,
      (id, buffer) => ({ id, kind: 'thermalpaper', width, height, buffer, params, scale }),
      (res) =>
        res.kind === 'thermalpaper'
          ? {
              dSize: res.dSize,
              matrixCols: res.matrixCols,
              matrixRows: res.matrixRows,
              dots: new Uint8Array(res.buffer),
            }
          : null,
      () => processThermalDots(pixels, width, height, params, scale),
      signal
    );
  }

  computePostcardEngraving(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    density: number,
    scaleFactor: number,
    signal?: AbortSignal
  ): Promise<Float32Array> {
    return this.runWithPixelBuffer(
      pixels,
      (id, buffer) => ({ id, kind: 'postcard-engraving', width, height, buffer, density, scaleFactor }),
      (res) => (res.kind === 'postcard-engraving' ? new Float32Array(res.buffer) : null),
      () => computePostcardEngravingSegments(pixels, width, height, density, scaleFactor),
      signal
    );
  }

  applyPostcardPaperNoise(
    pixels: Uint8ClampedArray,
    signal?: AbortSignal
  ): Promise<Uint8ClampedArray> {
    return this.runWithPixelBuffer(
      pixels,
      (id, buffer) => ({ id, kind: 'postcard-paper', buffer }),
      (res) => (res.kind === 'postcard-paper' ? new Uint8ClampedArray(res.buffer) : null),
      () => {
        const out = new Uint8ClampedArray(pixels);
        applyPostcardPaperNoisePixels(out);
        return out;
      },
      signal
    );
  }

  downsampleGrid(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    targetW: number,
    targetH: number,
    signal?: AbortSignal
  ): Promise<Uint8ClampedArray> {
    return this.runWithPixelBuffer(
      pixels,
      (id, buffer) => ({ id, kind: 'downsample', width, height, targetW, targetH, buffer }),
      (res) => (res.kind === 'downsample' ? new Uint8ClampedArray(res.buffer) : null),
      () => downsampleAreaAverage(pixels, width, height, targetW, targetH),
      signal
    );
  }
}

export const workerBridge = new WorkerBridge();
