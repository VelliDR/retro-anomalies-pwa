/// <reference lib="webworker" />

import { downsampleAreaAverage } from '../core/ImageResampler.ts';
import type {
  ColorClashParams,
  PixelArtParams,
  SensorCorruptParams,
  ThermalPaperParams,
  VanGoghParams,
} from '../core/types.ts';
import { processColorClashPixels } from '../engines/ColorClashEngine.ts';
import { processPixelArtGrid } from '../engines/PixelArtEngine.ts';
import {
  applyPostcardPaperNoisePixels,
  computePostcardEngravingSegments,
} from '../engines/PostcardEngine.ts';
import { processSensorCorruptPixels } from '../engines/SensorCorruptEngine.ts';
import { processThermalDots } from '../engines/ThermalPaperEngine.ts';
import {
  generateVanGoghStrokes,
  packStrokesToRibbonChunks,
  type StrokeInstance,
} from '../engines/vangogh/StrokeGenerator.ts';

export type WorkerJobRequest =
  | {
      id: number;
      kind: 'vangogh-ribbons';
      width: number;
      height: number;
      buffer: ArrayBuffer;
      params: VanGoghParams;
      scale: number;
    }
  | {
      id: number;
      kind: 'vangogh-strokes';
      width: number;
      height: number;
      buffer: ArrayBuffer;
      params: VanGoghParams;
      scale: number;
    }
  | {
      id: number;
      kind: 'colorclash';
      width: number;
      height: number;
      buffer: ArrayBuffer;
      params: ColorClashParams;
      referenceScale: number;
    }
  | {
      id: number;
      kind: 'sensorcorrupt';
      width: number;
      height: number;
      buffer: ArrayBuffer;
      params: SensorCorruptParams;
      scaleFactor: number;
    }
  | {
      id: number;
      kind: 'pixelart';
      width: number;
      height: number;
      buffer: ArrayBuffer;
      params: PixelArtParams;
      referenceScale: number;
    }
  | {
      id: number;
      kind: 'thermalpaper';
      width: number;
      height: number;
      buffer: ArrayBuffer;
      params: ThermalPaperParams;
      scale: number;
    }
  | {
      id: number;
      kind: 'postcard-engraving';
      width: number;
      height: number;
      buffer: ArrayBuffer;
      density: number;
      scaleFactor: number;
    }
  | {
      id: number;
      kind: 'postcard-paper';
      buffer: ArrayBuffer;
    }
  | {
      id: number;
      kind: 'downsample';
      width: number;
      height: number;
      targetW: number;
      targetH: number;
      buffer: ArrayBuffer;
    };

export type WorkerJobResponse =
  | {
      id: number;
      ok: true;
      kind: 'vangogh-ribbons';
      chunks: ArrayBuffer[];
    }
  | {
      id: number;
      ok: true;
      kind: 'vangogh-strokes';
      strokes: StrokeInstance[];
    }
  | {
      id: number;
      ok: true;
      kind: 'colorclash';
      buffer: ArrayBuffer;
    }
  | {
      id: number;
      ok: true;
      kind: 'sensorcorrupt';
      buffer: ArrayBuffer;
    }
  | {
      id: number;
      ok: true;
      kind: 'pixelart';
      smallW: number;
      smallH: number;
      buffer: ArrayBuffer;
    }
  | {
      id: number;
      ok: true;
      kind: 'thermalpaper';
      dSize: number;
      matrixCols: number;
      matrixRows: number;
      buffer: ArrayBuffer;
    }
  | {
      id: number;
      ok: true;
      kind: 'postcard-engraving';
      buffer: ArrayBuffer;
    }
  | {
      id: number;
      ok: true;
      kind: 'postcard-paper';
      buffer: ArrayBuffer;
    }
  | {
      id: number;
      ok: true;
      kind: 'downsample';
      buffer: ArrayBuffer;
    }
  | {
      id: number;
      ok: false;
      error: string;
    };

let reusableSensorBlockBuffer: Uint8ClampedArray | undefined;

const ctx = self as DedicatedWorkerGlobalScope;

function toExactArrayBuffer(view: ArrayBufferView): ArrayBuffer {
  if (view.byteOffset === 0 && view.byteLength === view.buffer.byteLength && view.buffer instanceof ArrayBuffer) {
    return view.buffer;
  }
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice().buffer;
}

ctx.onmessage = (event: MessageEvent<WorkerJobRequest>) => {
  const req = event.data;

  try {
    switch (req.kind) {
      case 'vangogh-ribbons': {
        const pixels = new Uint8ClampedArray(req.buffer);
        const strokes = generateVanGoghStrokes(pixels, req.width, req.height, req.params, req.scale);
        const chunkBuffers = packStrokesToRibbonChunks(strokes).map(toExactArrayBuffer);
        ctx.postMessage(
          { id: req.id, ok: true, kind: 'vangogh-ribbons', chunks: chunkBuffers },
          chunkBuffers
        );
        return;
      }

      case 'vangogh-strokes': {
        const pixels = new Uint8ClampedArray(req.buffer);
        const strokes = generateVanGoghStrokes(pixels, req.width, req.height, req.params, req.scale);
        ctx.postMessage({ id: req.id, ok: true, kind: 'vangogh-strokes', strokes });
        return;
      }

      case 'colorclash': {
        const pixels = new Uint8ClampedArray(req.buffer);
        processColorClashPixels(pixels, req.width, req.height, req.params.blockSize, req.referenceScale);
        const outBuffer = pixels.buffer as ArrayBuffer;
        ctx.postMessage({ id: req.id, ok: true, kind: 'colorclash', buffer: outBuffer }, [outBuffer]);
        return;
      }

      case 'sensorcorrupt': {
        const pixels = new Uint8ClampedArray(req.buffer);
        reusableSensorBlockBuffer = processSensorCorruptPixels(
          pixels,
          req.width,
          req.height,
          req.params,
          req.scaleFactor,
          reusableSensorBlockBuffer
        );
        const outBuffer = pixels.buffer as ArrayBuffer;
        ctx.postMessage({ id: req.id, ok: true, kind: 'sensorcorrupt', buffer: outBuffer }, [outBuffer]);
        return;
      }

      case 'pixelart': {
        const pixels = new Uint8ClampedArray(req.buffer);
        const result = processPixelArtGrid(pixels, req.width, req.height, req.params, req.referenceScale);
        const outBuffer = result.pixels.buffer as ArrayBuffer;
        ctx.postMessage(
          {
            id: req.id,
            ok: true,
            kind: 'pixelart',
            smallW: result.smallW,
            smallH: result.smallH,
            buffer: outBuffer,
          },
          [outBuffer]
        );
        return;
      }

      case 'thermalpaper': {
        const pixels = new Uint8ClampedArray(req.buffer);
        const result = processThermalDots(pixels, req.width, req.height, req.params, req.scale);
        const outBuffer = result.dots.buffer as ArrayBuffer;
        ctx.postMessage(
          {
            id: req.id,
            ok: true,
            kind: 'thermalpaper',
            dSize: result.dSize,
            matrixCols: result.matrixCols,
            matrixRows: result.matrixRows,
            buffer: outBuffer,
          },
          [outBuffer]
        );
        return;
      }

      case 'postcard-engraving': {
        const pixels = new Uint8ClampedArray(req.buffer);
        const segments = computePostcardEngravingSegments(
          pixels,
          req.width,
          req.height,
          req.density,
          req.scaleFactor
        );
        const outBuffer = toExactArrayBuffer(segments);
        ctx.postMessage({ id: req.id, ok: true, kind: 'postcard-engraving', buffer: outBuffer }, [outBuffer]);
        return;
      }

      case 'postcard-paper': {
        const pixels = new Uint8ClampedArray(req.buffer);
        applyPostcardPaperNoisePixels(pixels);
        const outBuffer = pixels.buffer as ArrayBuffer;
        ctx.postMessage({ id: req.id, ok: true, kind: 'postcard-paper', buffer: outBuffer }, [outBuffer]);
        return;
      }

      case 'downsample': {
        const pixels = new Uint8ClampedArray(req.buffer);
        const grid = downsampleAreaAverage(pixels, req.width, req.height, req.targetW, req.targetH);
        const outBuffer = grid.buffer as ArrayBuffer;
        ctx.postMessage({ id: req.id, ok: true, kind: 'downsample', buffer: outBuffer }, [outBuffer]);
        return;
      }
    }
  } catch (err) {
    ctx.postMessage({
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
