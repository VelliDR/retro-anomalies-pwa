import { describe, expect, it } from 'vitest';
import { oklabToRgb, redmeanDistanceSq, rgbToOklab } from '../src/core/ColorSpace.ts';
import { createSeededRng, PerlinNoise2D } from '../src/core/Noise.ts';
import { buildFlirLut } from '../src/engines/FlirThermalEngine.ts';

describe('ColorSpace', () => {
  it('round-trips sRGB <-> OKLab accurately across primary and midtone colors', () => {
    const samples: Array<[number, number, number]> = [
      [0, 0, 0],
      [255, 255, 255],
      [255, 0, 85],
      [16, 185, 129],
      [42, 99, 210],
      [180, 140, 95],
    ];

    for (const [r, g, b] of samples) {
      const lab = rgbToOklab(r, g, b);
      const [rr, gg, bb] = oklabToRgb(lab.L, lab.a, lab.b);
      expect(Math.abs(rr - r)).toBeLessThanOrEqual(1);
      expect(Math.abs(gg - g)).toBeLessThanOrEqual(1);
      expect(Math.abs(bb - b)).toBeLessThanOrEqual(1);
    }
  });

  it('computes symmetric zero distance for identical colors in Redmean', () => {
    expect(redmeanDistanceSq(120, 45, 200, 120, 45, 200)).toBe(0);
    expect(redmeanDistanceSq(10, 20, 30, 40, 50, 60)).toBe(
      redmeanDistanceSq(40, 50, 60, 10, 20, 30)
    );
  });
});

describe('Noise & PRNG', () => {
  it('produces identical sequences for identical seeds', () => {
    const a = createSeededRng(424242);
    const b = createSeededRng(424242);
    for (let i = 0; i < 20; i++) {
      expect(a()).toBe(b());
    }
  });

  it('generates near-zero divergence for curl noise', () => {
    const perlin = new PerlinNoise2D();
    const h = 0.005;
    const x = 1.73;
    const y = 2.41;
    const vxRight = perlin.curl(x + h, y).vx;
    const vxLeft = perlin.curl(x - h, y).vx;
    const vyUp = perlin.curl(x, y + h).vy;
    const vyDown = perlin.curl(x, y - h).vy;

    const divergence = (vxRight - vxLeft) / (2 * h) + (vyUp - vyDown) / (2 * h);
    expect(Math.abs(divergence)).toBeLessThan(0.05);
  });
});

describe('FlirThermalEngine Ironbow LUT', () => {
  it('covers the [0.25, 0.50) red-magenta transition without negative wraparound', () => {
    const lut = buildFlirLut('ironbow');
    // Index 96 => norm ≈ 0.376 (ikinci çeyrek)
    const idx = 96 * 3;
    const r = lut[idx]!;
    const g = lut[idx + 1]!;
    const b = lut[idx + 2]!;
    expect(r).toBeGreaterThan(100);
    expect(r).toBeLessThanOrEqual(225);
    expect(g).toBeGreaterThanOrEqual(0);
    expect(g).toBeLessThanOrEqual(30);
    expect(b).toBeGreaterThan(50);
    expect(b).toBeLessThan(180);
  });
});
