import { clamp, oklabToRgb, rgbToOklab, type OKLab, type RGB } from '../../core/ColorSpace.ts';
import { createSeededRng, PerlinNoise2D } from '../../core/Noise.ts';
import type { VanGoghParams } from '../../core/types.ts';
import {
  computeScharrStructureTensor,
  generateStratifiedSeeds,
  traceStreamlineRK2,
  type Point2D,
  type StructureTensorField,
} from './StructureTensor.ts';

export interface StrokeInstance {
  points: Point2D[];
  width: number;
  bristles: number;
  alpha: number;
  rgb: RGB;
  seed: number;
  impastoStrength: number;
}

export const FLOATS_PER_VERTEX = 11;
export const CHUNK_FLOAT_LIMIT = 240_000 * FLOATS_PER_VERTEX;

function jitterPigmentOklab(lab: OKLab, vibrationChance: number, rng: () => number): RGB {
  let L = clamp(lab.L + (rng() - 0.5) * 0.04, 0, 1);
  let a = lab.a * 1.18;
  let b = lab.b * 1.18;

  if (rng() < vibrationChance) {
    const shift = rng() < 0.5 ? 0.032 : -0.032;
    a += shift * 0.6;
    b -= shift;
    L = clamp(L + (rng() - 0.5) * 0.03, 0, 1);
  } else {
    a += (rng() - 0.5) * 0.015;
    b += (rng() - 0.5) * 0.015;
  }

  return oklabToRgb(L, a, b);
}

export function generateVanGoghStrokes(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  params: VanGoghParams,
  scale: number,
  noise = new PerlinNoise2D()
): StrokeInstance[] {
  const tensorField: StructureTensorField = computeScharrStructureTensor(pixels, width, height, 512);
  const rng = createSeededRng(1889 + params.mode * 97 + params.stepSize * 13);

  const stepSize = Math.max(2, params.stepSize) * scale;
  const brushMin = params.brushMinLength * scale;
  const brushMax = Math.max(brushMin, params.brushMaxLength * scale);
  const densityScale = clamp(12 / Math.max(6, params.stepSize), 0.5, 2.0);
  const strokes: StrokeInstance[] = [];

  const layers = [
    {
      density: 0.011,
      stepLength: stepSize * 0.38,
      maxSteps: 11,
      brushWidth: brushMin * 0.72,
      bristles: 6,
      alpha: 0.68,
      turbulence: 0.12,
      colorBarrierSq: 0.04,
      impastoStrength: 0.35,
      detailOnly: false,
      vibrationChance: 0.14,
    },
    {
      density: 0.03,
      stepLength: stepSize * 0.28,
      maxSteps: Math.max(4, Math.round(brushMax / Math.max(1, stepSize * 0.28))),
      brushWidth: brushMin * 0.44,
      bristles: 8,
      alpha: 0.92,
      turbulence: 0.18,
      colorBarrierSq: 0.022,
      impastoStrength: 1.0,
      detailOnly: false,
      vibrationChance: 0.18,
    },
    {
      density: 0.024,
      stepLength: stepSize * 0.2,
      maxSteps: Math.max(3, Math.round((brushMin * 0.65) / Math.max(1, stepSize * 0.2))),
      brushWidth: brushMin * 0.24,
      bristles: 5,
      alpha: 0.96,
      turbulence: 0.08,
      colorBarrierSq: 0.012,
      impastoStrength: 1.0,
      detailOnly: true,
      vibrationChance: 0.08,
    },
  ] as const;

  for (const layer of layers) {
    const seeds = generateStratifiedSeeds(
      width,
      height,
      layer.density * densityScale,
      scale,
      rng
    );

    for (let i = 0; i < seeds.length; i++) {
      const seed = seeds[i]!;
      const px = Math.min(width - 1, Math.max(0, Math.floor(seed.x)));
      const py = Math.min(height - 1, Math.max(0, Math.floor(seed.y)));
      const pIdx = (py * width + px) * 4;

      const r = pixels[pIdx] ?? 0;
      const g = pixels[pIdx + 1] ?? 0;
      const b = pixels[pIdx + 2] ?? 0;
      const a = (pixels[pIdx + 3] ?? 0) / 255;
      if (a < 0.1) continue;

      const seedLab = rgbToOklab(r, g, b);

      if (layer.detailOnly) {
        const gx = Math.min(
          tensorField.sw - 1,
          Math.max(0, Math.floor((seed.x / width) * tensorField.sw))
        );
        const gy = Math.min(
          tensorField.sh - 1,
          Math.max(0, Math.floor((seed.y / height) * tensorField.sh))
        );
        const localGrad = tensorField.gradMag[gy * tensorField.sw + gx] ?? 0;
        if (seedLab.L < 0.62 && localGrad < 9.5) continue;
      }

      const points = traceStreamlineRK2(
        seed.x,
        seed.y,
        pixels,
        tensorField,
        noise,
        scale,
        seedLab,
        {
          mode: params.mode,
          stepLength: layer.stepLength,
          maxSteps: layer.maxSteps,
          turbulence: layer.turbulence,
          colorBarrierSq: layer.colorBarrierSq,
        }
      );

      if (points.length < 2) continue;

      strokes.push({
        points,
        width: layer.brushWidth * (0.85 + rng() * 0.3),
        bristles: layer.bristles,
        alpha: layer.alpha,
        rgb: jitterPigmentOklab(seedLab, layer.vibrationChance, rng),
        seed: rng(),
        impastoStrength: layer.impastoStrength,
      });
    }
  }

  return strokes;
}

export function appendStrokeRibbonVertices(
  out: Float32Array,
  cursor: number,
  stroke: StrokeInstance
): number {
  const pts = stroke.points;
  const count = pts.length;
  if (count < 2) return cursor;

  const halfW = stroke.width * 0.5;
  const r = stroke.rgb[0] / 255;
  const g = stroke.rgb[1] / 255;
  const b = stroke.rgb[2] / 255;
  const a = stroke.alpha;
  const meta = stroke.bristles + clamp(stroke.seed * 0.999, 0.001, 0.998);

  let offset = cursor;

  const computeTangent = (i: number): Point2D => {
    const prev = pts[Math.max(0, i - 1)]!;
    const next = pts[Math.min(count - 1, i + 1)]!;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  };

  const writeVertex = (x: number, y: number, u: number, v: number, tx: number, ty: number) => {
    out[offset++] = x;
    out[offset++] = y;
    out[offset++] = u;
    out[offset++] = v;
    out[offset++] = tx;
    out[offset++] = ty;
    out[offset++] = r;
    out[offset++] = g;
    out[offset++] = b;
    out[offset++] = a;
    out[offset++] = meta;
  };

  let tPrev = computeTangent(0);
  let uPrev = 0;
  const wPrev = halfW * 0.35;
  const nx0 = -tPrev.y;
  const ny0 = tPrev.x;
  let lxPrev = pts[0]!.x - nx0 * wPrev;
  let lyPrev = pts[0]!.y - ny0 * wPrev;
  let rxPrev = pts[0]!.x + nx0 * wPrev;
  let ryPrev = pts[0]!.y + ny0 * wPrev;

  for (let i = 1; i < count; i++) {
    const p = pts[i]!;
    const uCurr = i / (count - 1);
    const tCurr = computeTangent(i);
    const wCurr = halfW * (0.35 + 0.65 * Math.sin(uCurr * Math.PI));

    const nx = -tCurr.y;
    const ny = tCurr.x;
    const lxCurr = p.x - nx * wCurr;
    const lyCurr = p.y - ny * wCurr;
    const rxCurr = p.x + nx * wCurr;
    const ryCurr = p.y + ny * wCurr;

    writeVertex(lxPrev, lyPrev, uPrev, -1, tPrev.x, tPrev.y);
    writeVertex(rxPrev, ryPrev, uPrev, 1, tPrev.x, tPrev.y);
    writeVertex(lxCurr, lyCurr, uCurr, -1, tCurr.x, tCurr.y);

    writeVertex(rxPrev, ryPrev, uPrev, 1, tPrev.x, tPrev.y);
    writeVertex(rxCurr, ryCurr, uCurr, 1, tCurr.x, tCurr.y);
    writeVertex(lxCurr, lyCurr, uCurr, -1, tCurr.x, tCurr.y);

    tPrev = tCurr;
    uPrev = uCurr;
    lxPrev = lxCurr;
    lyPrev = lyCurr;
    rxPrev = rxCurr;
    ryPrev = ryCurr;
  }

  return offset;
}

export function packStrokesToRibbonChunks(strokes: readonly StrokeInstance[]): Float32Array[] {
  const chunks: Float32Array[] = [];
  let buf = new Float32Array(CHUNK_FLOAT_LIMIT);
  let cursor = 0;

  for (let s = 0; s < strokes.length; s++) {
    const stroke = strokes[s]!;
    const neededFloats = (stroke.points.length - 1) * 6 * FLOATS_PER_VERTEX;
    if (neededFloats <= 0) continue;

    if (cursor + neededFloats > CHUNK_FLOAT_LIMIT) {
      if (cursor > 0) {
        chunks.push(buf.slice(0, cursor));
      }
      buf = new Float32Array(Math.max(CHUNK_FLOAT_LIMIT, neededFloats));
      cursor = 0;
    }

    cursor = appendStrokeRibbonVertices(buf, cursor, stroke);
  }

  if (cursor > 0) {
    chunks.push(buf.slice(0, cursor));
  }

  return chunks;
}
