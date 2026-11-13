import { describe, expect, it } from 'vitest';
import { downsampleAreaAverage } from '../src/core/ImageResampler.ts';
import {
  solveSpectrumBlock,
  SPECTRUM_BRIGHT_BANK,
  SPECTRUM_NORMAL_BANK,
} from '../src/engines/ColorClashEngine.ts';
import { processPixelArtGrid } from '../src/engines/PixelArtEngine.ts';
import { computePostcardEngravingSegments } from '../src/engines/PostcardEngine.ts';
import { processThermalDots } from '../src/engines/ThermalPaperEngine.ts';

describe('ImageResampler', () => {
  it('computes exact box area average when downsampling 4x4 -> 2x2', () => {
    const src = new Uint8ClampedArray(4 * 4 * 4);
    // Sol-üst 2x2 blok: (0,0)=0, (1,0)=100, (0,1)=100, (1,1)=200 => ort = 100
    const setPx = (x: number, y: number, val: number) => {
      const i = (y * 4 + x) * 4;
      src[i] = val;
      src[i + 1] = val;
      src[i + 2] = val;
      src[i + 3] = 255;
    };
    setPx(0, 0, 0);
    setPx(1, 0, 100);
    setPx(0, 1, 100);
    setPx(1, 1, 200);
    setPx(2, 0, 200);
    setPx(3, 0, 200);
    setPx(2, 1, 200);
    setPx(3, 1, 200);

    const out = downsampleAreaAverage(src, 4, 4, 2, 2);
    expect(out[0]).toBe(100);
    expect(out[4]).toBe(200);
  });
});

describe('ColorClashEngine ZX Spectrum BRIGHT Bank Constraint', () => {
  it('never mixes Normal (192) and Bright (255) non-black colors in the same block', () => {
    const w = 8;
    const h = 8;
    const pixels = new Uint8ClampedArray(w * h * 4);

    // Yarısı parlak camgöbeği (0,255,255), yarısı koyu kırmızı (180,0,0)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (x < 4) {
          pixels[i] = 180;
          pixels[i + 1] = 0;
          pixels[i + 2] = 0;
        } else {
          pixels[i] = 0;
          pixels[i + 1] = 255;
          pixels[i + 2] = 255;
        }
        pixels[i + 3] = 255;
      }
    }

    const res = solveSpectrumBlock(pixels, w, h, 0, 0, 8);
    const key = (c: readonly [number, number, number]) => c.join(',');
    const normalKeys = new Set(SPECTRUM_NORMAL_BANK.map(key));
    const brightKeys = new Set(SPECTRUM_BRIGHT_BANK.map(key));

    const bothNormal = normalKeys.has(key(res.ink)) && normalKeys.has(key(res.paper));
    const bothBright = brightKeys.has(key(res.ink)) && brightKeys.has(key(res.paper));

    expect(bothNormal || bothBright).toBe(true);
  });
});

describe('Worker-Ready Engine Kernels', () => {
  it('processPixelArtGrid downsamples and quantizes cleanly in OKLab', () => {
    const w = 64;
    const h = 64;
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      pixels[i * 4] = 200;
      pixels[i * 4 + 1] = 220;
      pixels[i * 4 + 2] = 40;
      pixels[i * 4 + 3] = 255;
    }

    const res = processPixelArtGrid(
      pixels,
      w,
      h,
      { paletteKey: 'gameboy', pixelSize: 32, ditherMode: 'atkinson' },
      1.0
    );
    expect(res.smallW).toBe(32);
    expect(res.smallH).toBe(32);
    expect(res.pixels.length).toBe(32 * 32 * 4);
  });

  it('processThermalDots generates 0/1 matrix for Atkinson dithering', () => {
    const w = 36;
    const h = 36;
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const v = x < 18 ? 30 : 230;
        pixels[i] = v;
        pixels[i + 1] = v;
        pixels[i + 2] = v;
        pixels[i + 3] = 255;
      }
    }

    const res = processThermalDots(
      pixels,
      w,
      h,
      { paperType: 'fresh', ditherMode: 'atkinson', wear: 20, tornEdge: false },
      1.0
    );
    expect(res.matrixCols).toBe(12);
    expect(res.matrixRows).toBe(12);
    expect(res.dots.length).toBe(144);
    // Sol yarı koyu => daha fazla nokta, sağ yarı açık => daha az nokta
    expect(res.dots[0]).toBe(1);
    expect(res.dots[11]).toBe(0);
  });

  it('computePostcardEngravingSegments emits 5-float line tuples in dark areas', () => {
    const w = 64;
    const h = 64;
    const pixels = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      pixels[i * 4] = 40;
      pixels[i * 4 + 1] = 40;
      pixels[i * 4 + 2] = 40;
      pixels[i * 4 + 3] = 255;
    }

    const segs = computePostcardEngravingSegments(pixels, w, h, 8, 1.0);
    expect(segs.length).toBeGreaterThan(0);
    expect(segs.length % 5).toBe(0);
  });
});
