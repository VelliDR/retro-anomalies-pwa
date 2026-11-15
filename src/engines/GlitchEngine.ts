import { canvasPool } from '../core/CanvasPool.ts';
import { clampByte, luminance, rgbToHsl } from '../core/ColorSpace.ts';
import { createSeededRng } from '../core/Noise.ts';
import type { GlitchParams, IImageEngine, RenderContext } from '../core/types.ts';
import { webgl2Pipeline } from '../core/WebGL2Pipeline.ts';

const GLITCH_BASE_FS = `#version 300 es
precision highp float;

uniform sampler2D uTex;
uniform vec2 uResolution;
uniform vec2 uInkShift;
uniform vec2 uChromaShift;
uniform float uNormIntensity;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 base = texture(uTex, vUv);
  vec2 invRes = 1.0 / uResolution;
  vec3 color = base.rgb;

  if (uNormIntensity > 0.1) {
    vec4 inkSrc = texture(uTex, clamp(vUv - uInkShift * invRes, 0.0, 1.0));
    float lum = dot(inkSrc.rgb, vec3(0.299, 0.587, 0.114)) * 0.9;
    float c = clamp((lum - 0.5) * 3.0 + 0.5, 0.0, 1.0);
    vec3 inkMultiplied = color * vec3(c);
    color = mix(color, inkMultiplied, 0.45 * uNormIntensity * inkSrc.a);
  }

  float darkAlpha = 0.30 * uNormIntensity;
  vec4 s1 = texture(uTex, clamp(vUv - uChromaShift * invRes, 0.0, 1.0));
  vec4 s2 = texture(uTex, clamp(vUv + uChromaShift * invRes, 0.0, 1.0));
  color = mix(color, min(color, s1.rgb), darkAlpha * s1.a);
  color = mix(color, min(color, s2.rgb), darkAlpha * s2.a);

  fragColor = vec4(color, base.a);
}
`;

export class GlitchEngine implements IImageEngine<GlitchParams> {
  readonly id = 'glitch' as const;
  readonly supportsWebGL2 = true;
  private cachedBenDaySize = 0;
  private benDayCanvas: HTMLCanvasElement | null = null;
  private benDayPattern: CanvasPattern | null = null;

  private getBenDayPattern(ctx: CanvasRenderingContext2D, scale: number): CanvasPattern | null {
    const size = Math.max(4, Math.round(5 * scale));
    if (!this.benDayPattern || this.cachedBenDaySize !== size || !this.benDayCanvas) {
      const patCanvas = this.benDayCanvas ?? document.createElement('canvas');
      patCanvas.width = size;
      patCanvas.height = size;
      const patCtx = canvasPool.getContext2D(patCanvas);
      patCtx.clearRect(0, 0, size, size);
      patCtx.fillStyle = '#111116';
      patCtx.beginPath();
      patCtx.arc(size / 2, size / 2, size / 4.2, 0, Math.PI * 2);
      patCtx.fill();

      this.benDayCanvas = patCanvas;
      this.benDayPattern = ctx.createPattern(patCanvas, 'repeat');
      this.cachedBenDaySize = size;
    }
    return this.benDayPattern;
  }

  private createInkCanvas(sourceCanvas: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
    // ctx.filter Safari/GPU tutarsızlığından kaçınmak için deterministik piksel ayrıştırma
    const inkCanvas = canvasPool.getCanvas('glitch_ink', w, h, { willReadFrequently: true });
    const inkCtx = canvasPool.getContext2D(inkCanvas, { willReadFrequently: true });
    inkCtx.drawImage(sourceCanvas, 0, 0);
    const img = inkCtx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = luminance(d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0) * 0.9;
      const c = clampByte((lum - 128) * 3.0 + 128);
      d[i] = c;
      d[i + 1] = c;
      d[i + 2] = c;
    }
    inkCtx.putImageData(img, 0, 0);
    return inkCanvas;
  }

  render(
    sourceCanvas: HTMLCanvasElement,
    params: GlitchParams,
    context: RenderContext
  ): HTMLCanvasElement {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const scale = context.referenceScale;
    const normIntensity = Math.min(1.0, Math.max(0.05, params.intensity / 100));

    const gyroX = params.gyroEffect ? context.tilt.tiltX * 36 * scale : 0;
    const gyroY = params.gyroEffect ? context.tilt.tiltY * 24 * scale : 0;

    const rng = createSeededRng(2099 + params.intensity * 131);

    const outputCanvas = canvasPool.getCanvas('glitch_output', w, h);
    const ctx = canvasPool.getContext2D(outputCanvas);
    const srcCtx = canvasPool.getContext2D(sourceCanvas);

    const inkShiftX = (rng() - 0.5) * 24 * normIntensity * scale + gyroX * 0.35;
    const inkShiftY = (rng() - 0.5) * 14 * normIntensity * scale + gyroY * 0.35;
    const shiftPx = Math.round((6 + normIntensity * 22) * scale);
    const chromaShiftX = -shiftPx + gyroX * 0.5;
    const chromaShiftY = shiftPx * 0.2 + gyroY * 0.5;

    const usedGpu =
      context.preferGpu &&
      webgl2Pipeline.canProcess(w, h) &&
      this.renderBaseWebGL2(
        sourceCanvas,
        outputCanvas,
        w,
        h,
        normIntensity,
        inkShiftX,
        inkShiftY,
        chromaShiftX,
        chromaShiftY
      );

    if (!usedGpu) {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(sourceCanvas, 0, 0);

      if (normIntensity > 0.1) {
        const inkCanvas = this.createInkCanvas(sourceCanvas, w, h);
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.45 * normIntensity;
        ctx.drawImage(inkCanvas, inkShiftX, inkShiftY);
        ctx.restore();
      }

      ctx.save();
      ctx.globalCompositeOperation = 'darken';
      ctx.globalAlpha = 0.3 * normIntensity;
      ctx.drawImage(sourceCanvas, chromaShiftX, chromaShiftY);
      ctx.drawImage(sourceCanvas, -chromaShiftX, -chromaShiftY);
      ctx.restore();
    }

    const shardCount = Math.floor(3 + normIntensity * 6);
    const maxShift = w * 0.2 * normIntensity;
    const pattern = this.getBenDayPattern(ctx, scale);

    for (let i = 0; i < shardCount; i++) {
      const cx = (0.15 + rng() * 0.7) * w;
      const cy = (0.15 + rng() * 0.7) * h;

      const shardW = (0.25 + rng() * 0.35) * w;
      const shardH = (0.15 + rng() * 0.25) * h;

      const shiftX = (rng() - 0.5) * maxShift + gyroX;
      const shiftY = (rng() - 0.5) * (maxShift * 0.4) + gyroY;

      const sampleX = Math.min(w - 1, Math.max(0, Math.floor(cx)));
      const sampleY = Math.min(h - 1, Math.max(0, Math.floor(cy)));
      const pxData = srcCtx.getImageData(sampleX, sampleY, 1, 1).data;
      const baseHsl = rgbToHsl(pxData[0] ?? 0, pxData[1] ?? 0, pxData[2] ?? 0);

      const isFarColor = rng() < 0.5;
      const hueShift = isFarColor ? 120 + rng() * 120 : (rng() - 0.5) * 40;
      const dynamicHue = Math.round((baseHsl.h + hueShift + 360) % 360);
      const dynamicSat = Math.round(Math.max(40, Math.min(100, baseHsl.s * 100 + (rng() - 0.5) * 30)));
      const dynamicLum = Math.round(Math.max(30, Math.min(80, baseHsl.l * 100 + (rng() - 0.5) * 30)));
      const dynamicColorStr = `hsl(${dynamicHue}, ${dynamicSat}%, ${dynamicLum}%)`;

      const hw = shardW * 0.5;
      const hh = shardH * 0.5;
      const poly: readonly [number, number][] = [
        [cx - hw + (rng() - 0.5) * hw * 0.4, cy - hh + (rng() - 0.5) * hh * 0.4],
        [cx + hw + (rng() - 0.5) * hw * 0.4, cy - hh * 0.5 + (rng() - 0.5) * hh * 0.4],
        [cx + hw * 0.8 + (rng() - 0.5) * hw * 0.4, cy + hh + (rng() - 0.5) * hh * 0.4],
        [cx - hw * 0.7 + (rng() - 0.5) * hw * 0.4, cy + hh * 0.8 + (rng() - 0.5) * hh * 0.4],
      ];

      const traceShardPoly = () => {
        ctx.beginPath();
        ctx.moveTo(poly[0]![0], poly[0]![1]);
        ctx.lineTo(poly[1]![0], poly[1]![1]);
        ctx.lineTo(poly[2]![0], poly[2]![1]);
        ctx.lineTo(poly[3]![0], poly[3]![1]);
        ctx.closePath();
      };

      ctx.save();
      traceShardPoly();
      ctx.clip();

      ctx.globalAlpha = 0.35;
      ctx.drawImage(sourceCanvas, shiftX * 0.4, shiftY * 0.4);

      ctx.globalAlpha = 1.0;
      ctx.drawImage(sourceCanvas, shiftX, shiftY);

      ctx.globalCompositeOperation = 'difference';
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = dynamicColorStr;
      ctx.fillRect(cx - shardW, cy - shardH, shardW * 2, shardH * 2);

      if (normIntensity > 0.15 && pattern) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = pattern;
        ctx.fillRect(cx - shardW, cy - shardH, shardW * 2, shardH * 2);
      }

      ctx.globalCompositeOperation = 'overlay';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.lineWidth = Math.max(1, Math.round(1.2 * scale));

      const lineCount = Math.floor(2 + rng() * 4);
      for (let l = 0; l < lineCount; l++) {
        const ly = cy - hh + rng() * shardH;
        ctx.beginPath();
        ctx.moveTo(cx - hw, ly);
        ctx.lineTo(cx + hw, ly + (rng() - 0.5) * 12 * scale);
        ctx.stroke();
      }
      ctx.restore();

      // Shard poligonu etrafına kromatik cyan / magenta çerçeve çiz
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = Math.max(1.5, Math.round(2 * scale));
      ctx.globalAlpha = 0.85;

      ctx.save();
      ctx.translate(-1.8 * scale, -1.8 * scale);
      ctx.strokeStyle = '#00f0ff';
      traceShardPoly();
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.translate(1.8 * scale, 1.8 * scale);
      ctx.strokeStyle = '#ff0055';
      traceShardPoly();
      ctx.stroke();
      ctx.restore();

      ctx.restore();
    }

    return outputCanvas;
  }

  private renderBaseWebGL2(
    sourceCanvas: HTMLCanvasElement,
    outputCanvas: HTMLCanvasElement,
    w: number,
    h: number,
    normIntensity: number,
    inkShiftX: number,
    inkShiftY: number,
    chromaShiftX: number,
    chromaShiftY: number
  ): boolean {
    const gl = webgl2Pipeline.getContext();
    if (!gl) return false;

    const program = webgl2Pipeline.compileQuadProgram('glitch_base_v1', GLITCH_BASE_FS);
    if (!program) return false;

    const srcTex = webgl2Pipeline.uploadCanvasTexture(sourceCanvas, true);
    if (!srcTex) return false;

    try {
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.uniform1i(gl.getUniformLocation(program, 'uTex'), 0);
      gl.uniform2f(gl.getUniformLocation(program, 'uResolution'), w, h);
      gl.uniform2f(gl.getUniformLocation(program, 'uInkShift'), inkShiftX, inkShiftY);
      gl.uniform2f(gl.getUniformLocation(program, 'uChromaShift'), chromaShiftX, chromaShiftY);
      gl.uniform1f(gl.getUniformLocation(program, 'uNormIntensity'), normIntensity);

      webgl2Pipeline.drawQuad(program, w, h, true, null);
      return webgl2Pipeline.copyToCanvas(outputCanvas);
    } finally {
      gl.deleteTexture(srcTex);
    }
  }
}
