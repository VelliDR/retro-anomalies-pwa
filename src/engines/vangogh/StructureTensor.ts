import { luminance, oklabDistanceSq, rgbToOklab, type OKLab } from '../../core/ColorSpace.ts';
import type { PerlinNoise2D } from '../../core/Noise.ts';
import type { VanGoghParams } from '../../core/types.ts';

export interface StructureTensorField {
  readonly jxx: Float32Array;
  readonly jyy: Float32Array;
  readonly jxy: Float32Array;
  readonly gradMag: Float32Array;
  readonly sw: number;
  readonly sh: number;
  readonly width: number;
  readonly height: number;
}

export interface TensorSample {
  vx: number;
  vy: number;
  coherence: number;
  gradMag: number;
}

export interface Point2D {
  x: number;
  y: number;
}

const GAUSS_5 = [0.06136, 0.24477, 0.38774, 0.24477, 0.06136] as const;
const GAUSS_9 = [
  0.028532, 0.067234, 0.124009, 0.179044, 0.20236, 0.179044, 0.124009, 0.067234, 0.028532,
] as const;

function separableGaussian(
  src: Float32Array,
  w: number,
  h: number,
  kernel: readonly number[],
  temp: Float32Array,
  dst: Float32Array
): void {
  const half = (kernel.length - 1) >> 1;

  // Yatay geçiş
  for (let y = 0; y < h; y++) {
    const rowOff = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -half; k <= half; k++) {
        const sx = x + k < 0 ? 0 : x + k >= w ? w - 1 : x + k;
        acc += (src[rowOff + sx] ?? 0) * (kernel[k + half] ?? 0);
      }
      temp[rowOff + x] = acc;
    }
  }

  // Dikey geçiş
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -half; k <= half; k++) {
        const sy = y + k < 0 ? 0 : y + k >= h ? h - 1 : y + k;
        acc += (temp[sy * w + x] ?? 0) * (kernel[k + half] ?? 0);
      }
      dst[y * w + x] = acc;
    }
  }
}

export function computeScharrStructureTensor(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  maxTensorDim = 512
): StructureTensorField {
  const maxDim = Math.max(width, height);
  const ratio = maxDim > maxTensorDim ? maxTensorDim / maxDim : 1;
  const sw = Math.max(48, Math.round(width * ratio));
  const sh = Math.max(48, Math.round(height * ratio));
  const size = sw * sh;

  const lumRaw = new Float32Array(size);
  const lumSmooth = new Float32Array(size);
  const temp = new Float32Array(size);

  // Bilinear luminans örneklemesi (aliasing önler)
  for (let y = 0; y < sh; y++) {
    const sy = ((y + 0.5) * height) / sh - 0.5;
    const y0 = Math.max(0, Math.min(height - 1, Math.floor(sy)));
    const y1 = Math.min(height - 1, y0 + 1);
    const fy = Math.max(0, sy - y0);

    for (let x = 0; x < sw; x++) {
      const sx = ((x + 0.5) * width) / sw - 0.5;
      const x0 = Math.max(0, Math.min(width - 1, Math.floor(sx)));
      const x1 = Math.min(width - 1, x0 + 1);
      const fx = Math.max(0, sx - x0);

      const i00 = (y0 * width + x0) * 4;
      const i10 = (y0 * width + x1) * 4;
      const i01 = (y1 * width + x0) * 4;
      const i11 = (y1 * width + x1) * 4;

      const l00 = luminance(pixels[i00] ?? 0, pixels[i00 + 1] ?? 0, pixels[i00 + 2] ?? 0);
      const l10 = luminance(pixels[i10] ?? 0, pixels[i10 + 1] ?? 0, pixels[i10 + 2] ?? 0);
      const l01 = luminance(pixels[i01] ?? 0, pixels[i01 + 1] ?? 0, pixels[i01 + 2] ?? 0);
      const l11 = luminance(pixels[i11] ?? 0, pixels[i11 + 1] ?? 0, pixels[i11 + 2] ?? 0);

      const top = l00 + (l10 - l00) * fx;
      const bot = l01 + (l11 - l01) * fx;
      lumRaw[y * sw + x] = top + (bot - top) * fy;
    }
  }

  // Ön yumuşatma: sensör gürültüsünü temizler
  separableGaussian(lumRaw, sw, sh, GAUSS_5, temp, lumSmooth);

  const jxxRaw = new Float32Array(size);
  const jyyRaw = new Float32Array(size);
  const jxyRaw = new Float32Array(size);
  const gradMag = new Float32Array(size);

  // 3x3 Scharr gradyanı (Sobel'e göre çok daha düşük açısal hata)
  for (let y = 1; y < sh - 1; y++) {
    const r0 = (y - 1) * sw;
    const r1 = y * sw;
    const r2 = (y + 1) * sw;

    for (let x = 1; x < sw - 1; x++) {
      const l00 = lumSmooth[r0 + x - 1] ?? 0;
      const l10 = lumSmooth[r0 + x] ?? 0;
      const l20 = lumSmooth[r0 + x + 1] ?? 0;
      const l01 = lumSmooth[r1 + x - 1] ?? 0;
      const l21 = lumSmooth[r1 + x + 1] ?? 0;
      const l02 = lumSmooth[r2 + x - 1] ?? 0;
      const l12 = lumSmooth[r2 + x] ?? 0;
      const l22 = lumSmooth[r2 + x + 1] ?? 0;

      const gx = (3 * (l20 + l22 - l00 - l02) + 10 * (l21 - l01)) / 32;
      const gy = (3 * (l02 + l22 - l00 - l20) + 10 * (l12 - l10)) / 32;

      const idx = r1 + x;
      jxxRaw[idx] = gx * gx;
      jyyRaw[idx] = gy * gy;
      jxyRaw[idx] = gx * gy;
      gradMag[idx] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  const jxx = new Float32Array(size);
  const jyy = new Float32Array(size);
  const jxy = new Float32Array(size);

  // Ayrılabilir Gauss tensör yumuşatma
  separableGaussian(jxxRaw, sw, sh, GAUSS_9, temp, jxx);
  separableGaussian(jyyRaw, sw, sh, GAUSS_9, temp, jyy);
  separableGaussian(jxyRaw, sw, sh, GAUSS_9, temp, jxy);

  return { jxx, jyy, jxy, gradMag, sw, sh, width, height };
}

export function sampleTensorBilinear(
  field: StructureTensorField,
  x: number,
  y: number
): TensorSample {
  const gx = Math.max(0, Math.min(field.sw - 1.001, (x / field.width) * (field.sw - 1)));
  const gy = Math.max(0, Math.min(field.sh - 1.001, (y / field.height) * (field.sh - 1)));

  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(field.sw - 1, x0 + 1);
  const y1 = Math.min(field.sh - 1, y0 + 1);
  const fx = gx - x0;
  const fy = gy - y0;

  const i00 = y0 * field.sw + x0;
  const i10 = y0 * field.sw + x1;
  const i01 = y1 * field.sw + x0;
  const i11 = y1 * field.sw + x1;

  const bilerp = (arr: Float32Array): number => {
    const a = arr[i00] ?? 0;
    const b = arr[i10] ?? 0;
    const c = arr[i01] ?? 0;
    const d = arr[i11] ?? 0;
    const top = a + (b - a) * fx;
    const bot = c + (d - c) * fx;
    return top + (bot - top) * fy;
  };

  const sxx = bilerp(field.jxx);
  const syy = bilerp(field.jyy);
  const sxy = bilerp(field.jxy);
  const gradMag = bilerp(field.gradMag);

  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy) + Math.PI / 2;
  const diff = sxx - syy;
  const coherence = Math.min(1, Math.sqrt(diff * diff + 4 * sxy * sxy) / (sxx + syy + 1e-5));

  return {
    vx: Math.cos(angle),
    vy: Math.sin(angle),
    coherence,
    gradMag,
  };
}

export function sampleFlowDirection(
  field: StructureTensorField,
  x: number,
  y: number,
  mode: VanGoghParams['mode'],
  noise: PerlinNoise2D,
  scale: number,
  turbulence: number
): { vx: number; vy: number; gradMag: number; coherence: number } {
  const t = sampleTensorBilinear(field, x, y);
  const nx = (x / scale) * 0.0028;
  const ny = (y / scale) * 0.0028;

  if (mode === 2) {
    // Yıldızlı Gece Modu: Çok oktavlı divergence-free Curl Noise + kenar uyumu
    const c1 = noise.curl(nx * 1.4, ny * 1.4, 0.02);
    const c2 = noise.curl(nx * 3.1 + 7.3, ny * 3.1 + 2.9, 0.02);
    const cx = c1.vx + c2.vx * 0.45;
    const cy = c1.vy + c2.vy * 0.45;
    const cLen = Math.hypot(cx, cy) || 1;
    const cvx = cx / cLen;
    const cvy = cy / cLen;

    // Yüksek coherence kenarlarda nesneyi koru, düşük coherence alanlarda girdap oluştur
    const wTensor = 0.22 + 0.72 * t.coherence;
    const dot = t.vx * cvx + t.vy * cvy;
    const alignSign = dot < 0 ? -1 : 1;
    const bx = t.vx * alignSign * wTensor + cvx * (1 - wTensor);
    const by = t.vy * alignSign * wTensor + cvy * (1 - wTensor);
    const len = Math.hypot(bx, by) || 1;
    return { vx: bx / len, vy: by / len, gradMag: t.gradMag, coherence: t.coherence };
  }

  if (mode === 3) {
    // Merkez / Radyal + Kenar Harmanlama
    const dx = x - field.width * 0.5;
    const dy = y - field.height * 0.5;
    const radLen = Math.hypot(dx, dy) || 1;
    // Merkez etrafında teğetsel akış
    const rvx = -dy / radLen;
    const rvy = dx / radLen;

    const dot = t.vx * rvx + t.vy * rvy;
    const alignSign = dot < 0 ? -1 : 1;
    const wTensor = 0.15 + 0.85 * t.coherence;
    const bx = t.vx * alignSign * wTensor + rvx * (1 - wTensor);
    const by = t.vy * alignSign * wTensor + rvy * (1 - wTensor);
    const len = Math.hypot(bx, by) || 1;
    return { vx: bx / len, vy: by / len, gradMag: t.gradMag, coherence: t.coherence };
  }

  // Mod 1: Paralel Hat Akışı (düşük coherence alanlarda hafif Perlin salınımı)
  const drift = (noise.sample(nx * 1.8, ny * 1.8) - 0.5) * turbulence * (1.15 - t.coherence);
  const angle = Math.atan2(t.vy, t.vx) + drift;
  return {
    vx: Math.cos(angle),
    vy: Math.sin(angle),
    gradMag: t.gradMag,
    coherence: t.coherence,
  };
}

export interface TraceOptions {
  mode: VanGoghParams['mode'];
  stepLength: number;
  maxSteps: number;
  turbulence: number;
  colorBarrierSq: number;
}

export function traceStreamlineRK2(
  startX: number,
  startY: number,
  pixels: Uint8ClampedArray,
  field: StructureTensorField,
  noise: PerlinNoise2D,
  scale: number,
  seedLab: OKLab,
  options: TraceOptions
): Point2D[] {
  const { width, height } = field;
  const points: Point2D[] = [{ x: startX, y: startY }];

  let currX = startX;
  let currY = startY;
  let prevVx = 0;
  let prevVy = 0;
  let hasPrev = false;

  for (let step = 0; step < options.maxSteps; step++) {
    if (currX < 2 || currX >= width - 2 || currY < 2 || currY >= height - 2) break;

    const k1 = sampleFlowDirection(field, currX, currY, options.mode, noise, scale, options.turbulence);
    if (hasPrev && k1.vx * prevVx + k1.vy * prevVy < 0) {
      k1.vx = -k1.vx;
      k1.vy = -k1.vy;
    }

    const midX = Math.max(1, Math.min(width - 2, currX + k1.vx * options.stepLength * 0.5));
    const midY = Math.max(1, Math.min(height - 2, currY + k1.vy * options.stepLength * 0.5));
    const k2 = sampleFlowDirection(field, midX, midY, options.mode, noise, scale, options.turbulence);

    // Sign-consistent yarı-vektör hizalaması: ±180° geri katlanmayı önler
    if (k2.vx * k1.vx + k2.vy * k1.vy < 0) {
      k2.vx = -k2.vx;
      k2.vy = -k2.vy;
    }

    const nextX = currX + k2.vx * options.stepLength;
    const nextY = currY + k2.vy * options.stepLength;
    if (nextX < 1 || nextX >= width - 1 || nextY < 1 || nextY >= height - 1) break;

    // Renk bariyeri kontrolü (keskin nesne kenarlarından taşmayı engeller)
    if (step >= 1) {
      const px = Math.min(width - 1, Math.max(0, Math.floor(nextX)));
      const py = Math.min(height - 1, Math.max(0, Math.floor(nextY)));
      const pIdx = (py * width + px) * 4;
      const sampleLab = rgbToOklab(
        pixels[pIdx] ?? 0,
        pixels[pIdx + 1] ?? 0,
        pixels[pIdx + 2] ?? 0
      );
      if (oklabDistanceSq(seedLab, sampleLab) > options.colorBarrierSq) {
        break;
      }
    }

    currX = nextX;
    currY = nextY;
    prevVx = k2.vx;
    prevVy = k2.vy;
    hasPrev = true;
    points.push({ x: currX, y: currY });
  }

  return points;
}

export function generateStratifiedSeeds(
  width: number,
  height: number,
  density: number,
  scale: number,
  rng: () => number
): Point2D[] {
  const cellSize = Math.max(2 * scale, (1 / Math.sqrt(Math.max(1e-5, density))) * scale);
  const cols = Math.max(1, Math.ceil(width / cellSize));
  const rows = Math.max(1, Math.ceil(height / cellSize));
  const seeds: Point2D[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = Math.min(width - 1, (col + 0.1 + rng() * 0.8) * cellSize);
      const y = Math.min(height - 1, (row + 0.1 + rng() * 0.8) * cellSize);
      seeds.push({ x, y });
    }
  }

  // Deterministik Fisher-Yates karıştırma: tarama çizgisi sırası izini yok eder
  for (let i = seeds.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = seeds[i]!;
    seeds[i] = seeds[j]!;
    seeds[j] = tmp;
  }

  return seeds;
}
