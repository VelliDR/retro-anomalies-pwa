import { describe, expect, it } from 'vitest';
import { rgbToOklab } from '../src/core/ColorSpace.ts';
import { createSeededRng, PerlinNoise2D } from '../src/core/Noise.ts';
import {
  FLOATS_PER_VERTEX,
  generateVanGoghStrokes,
  packStrokesToRibbonChunks,
} from '../src/engines/vangogh/StrokeGenerator.ts';
import {
  computeScharrStructureTensor,
  generateStratifiedSeeds,
  sampleTensorBilinear,
  traceStreamlineRK2,
} from '../src/engines/vangogh/StructureTensor.ts';

function makeSyntheticImage(
  w: number,
  h: number,
  paintFn: (x: number, y: number) => [number, number, number]
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paintFn(x, y);
      const i = (y * w + x) * 4;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

describe('VanGogh StructureTensor & RK2 Pipeline', () => {
  it('computes high coherence (> 0.9) and vertical tangent along a vertical edge', () => {
    const w = 128;
    const h = 128;
    const pixels = makeSyntheticImage(w, h, (x) => (x < 64 ? [20, 20, 20] : [235, 235, 235]));
    const tensor = computeScharrStructureTensor(pixels, w, h, 128);
    const sample = sampleTensorBilinear(tensor, 64, 64);

    expect(sample.coherence).toBeGreaterThan(0.9);
    // Dikey kenar boyunca teğet vektör |vy| ≈ 1 olmalı
    expect(Math.abs(sample.vy)).toBeGreaterThan(0.98);
  });

  it('tracks a 45-degree diagonal edge accurately with Scharr', () => {
    const w = 128;
    const h = 128;
    const pixels = makeSyntheticImage(w, h, (x, y) => (x > y ? [240, 240, 240] : [15, 15, 15]));
    const tensor = computeScharrStructureTensor(pixels, w, h, 128);
    const sample = sampleTensorBilinear(tensor, 64, 64);

    expect(sample.coherence).toBeGreaterThan(0.9);
    expect(Math.abs(Math.abs(sample.vx) - Math.abs(sample.vy))).toBeLessThan(0.08);
  });

  it('traces smooth sign-consistent RK2 streamlines without 180-degree foldbacks', () => {
    const w = 128;
    const h = 128;
    const pixels = makeSyntheticImage(w, h, (x, y) => {
      const d = Math.hypot(x - 64, y - 64);
      return d < 36 ? [220, 190, 40] : [20, 40, 120];
    });
    const tensor = computeScharrStructureTensor(pixels, w, h, 128);
    const noise = new PerlinNoise2D();
    // Halkanın hemen iç tarafında tohumla (yüksek bariyerden kaçınmak için yüksek threshold)
    const seedLab = rgbToOklab(220, 190, 40);
    const pts = traceStreamlineRK2(64, 29, pixels, tensor, noise, 1.0, seedLab, {
      mode: 1,
      stepLength: 3,
      maxSteps: 18,
      turbulence: 0.05,
      colorBarrierSq: 10.0,
    });

    expect(pts.length).toBeGreaterThan(5);
    for (let i = 2; i < pts.length; i++) {
      const dx1 = pts[i - 1]!.x - pts[i - 2]!.x;
      const dy1 = pts[i - 1]!.y - pts[i - 2]!.y;
      const dx2 = pts[i]!.x - pts[i - 1]!.x;
      const dy2 = pts[i]!.y - pts[i - 1]!.y;
      const dot = dx1 * dx2 + dy1 * dy2;
      expect(dot).toBeGreaterThan(0);
    }
  });

  it('stops streamline at sharp color barriers in OKLab space', () => {
    const w = 128;
    const h = 128;
    const pixels = makeSyntheticImage(w, h, (x) => (x < 64 ? [30, 50, 180] : [240, 220, 60]));
    const tensor = computeScharrStructureTensor(pixels, w, h, 128);
    const noise = new PerlinNoise2D();
    // Mavi taraftan sarı sınıra doğru yatay mod1/mod3 zorlaması olmadan,
    // keskin sınıra doğru ilerleyen kısa bir tohum
    const seedLab = rgbToOklab(30, 50, 180);
    const pts = traceStreamlineRK2(61, 64, pixels, tensor, noise, 1.0, seedLab, {
      mode: 2,
      stepLength: 4,
      maxSteps: 20,
      turbulence: 0.2,
      colorBarrierSq: 0.02,
    });

    for (const p of pts) {
      expect(p.x).toBeLessThan(65);
    }
  });

  it('generates deterministic stratified seeds across identical runs', () => {
    const a = generateStratifiedSeeds(200, 150, 0.02, 1.0, createSeededRng(1889));
    const b = generateStratifiedSeeds(200, 150, 0.02, 1.0, createSeededRng(1889));
    expect(a.length).toBeGreaterThan(10);
    expect(a).toEqual(b);
  });

  it('packs generated Van Gogh strokes into vertex-aligned Float32Array ribbon chunks', () => {
    const w = 128;
    const h = 128;
    const pixels = makeSyntheticImage(w, h, (x, y) => [
      Math.round((x / w) * 255),
      Math.round((y / h) * 255),
      120,
    ]);
    const strokes = generateVanGoghStrokes(
      pixels,
      w,
      h,
      { mode: 1, stepSize: 12, brushMinLength: 10, brushMaxLength: 28, impasto: true },
      1.0
    );
    expect(strokes.length).toBeGreaterThan(20);

    const chunks = packStrokesToRibbonChunks(strokes);
    expect(chunks.length).toBeGreaterThan(0);

    const expectedFloats = strokes.reduce(
      (sum, stroke) => sum + (stroke.points.length - 1) * 6 * FLOATS_PER_VERTEX,
      0
    );
    let actualFloats = 0;
    for (const chunk of chunks) {
      expect(chunk.length % (6 * FLOATS_PER_VERTEX)).toBe(0);
      actualFloats += chunk.length;
    }
    expect(actualFloats).toBe(expectedFloats);
  });

  it('prevents stroke explosion on small images and responds to stepSize density', () => {
    const w = 160;
    const h = 120;
    const pixels = makeSyntheticImage(w, h, (x, y) => [
      Math.round((x / w) * 255),
      Math.round((y / h) * 255),
      100,
    ]);

    const smallStrokes = generateVanGoghStrokes(
      pixels,
      w,
      h,
      { mode: 2, stepSize: 12, brushMinLength: 10, brushMaxLength: 30, impasto: true },
      w / 1200
    );
    expect(smallStrokes.length).toBeGreaterThan(50);
    expect(smallStrokes.length).toBeLessThan(5000);

    const fineStrokes = generateVanGoghStrokes(
      pixels,
      128,
      128,
      { mode: 1, stepSize: 6, brushMinLength: 8, brushMaxLength: 24, impasto: false },
      1.0
    );
    const coarseStrokes = generateVanGoghStrokes(
      pixels,
      128,
      128,
      { mode: 1, stepSize: 24, brushMinLength: 8, brushMaxLength: 24, impasto: false },
      1.0
    );
    expect(fineStrokes.length).toBeGreaterThan(coarseStrokes.length);
  });
});
