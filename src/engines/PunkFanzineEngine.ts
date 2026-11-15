import { canvasPool } from '../core/CanvasPool.ts';
import { clampByte, luminance } from '../core/ColorSpace.ts';
import { createSeededRng } from '../core/Noise.ts';
import type { IImageEngine, PunkFanzineParams, RenderContext } from '../core/types.ts';
import { webgl2Pipeline } from '../core/WebGL2Pipeline.ts';

const FANZINE_FS = `#version 300 es
precision highp float;

uniform sampler2D uTex;
uniform vec2 uResolution;
uniform float uContrastBoost;
uniform float uTonerNoise;
uniform float uScale;

in vec2 vUv;
out vec4 fragColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec4 src = texture(uTex, vUv);
  if (src.a < 0.04) {
    fragColor = src;
    return;
  }

  vec2 px = floor(vUv * uResolution);
  float seedOffset = floor(uContrastBoost * 100.0) + floor(uTonerNoise * 100.0);
  float h1 = hash12(px + vec2(seedOffset, 19.77));
  float h2 = hash12(px * 0.5 + vec2(77.1, seedOffset));
  float h3 = hash12(px + vec2(31.7, 53.9));
  float h4 = hash12(px + vec2(91.3, 11.1));

  float lum = dot(src.rgb, vec3(0.299, 0.587, 0.114)) * 255.0;
  lum = (lum - 128.0) * uContrastBoost + 128.0;

  float microNoise = (h1 - 0.5) * uTonerNoise * 75.0;
  float clumpNoise = h2 > 0.94 ? (h3 - 0.5) * uTonerNoise * 140.0 : 0.0;
  lum += microNoise + clumpNoise;

  vec3 color;
  if (lum < 125.0) {
    color = vec3(20.0 / 255.0);
  } else {
    float paperGrain = (h4 - 0.5) * (12.0 / 255.0);
    color = clamp(vec3(228.0, 224.0, 215.0) / 255.0 + vec3(paperGrain), 0.0, 1.0);
  }

  // Fotokopi toner şeritleri
  if (uTonerNoise > 0.15) {
    float colBucket = floor(px.x / max(1.0, 2.0 * uScale));
    float colRand = hash12(vec2(colBucket, seedOffset * 0.37));
    float streakProb = clamp((2.0 + uTonerNoise * 6.0) * uScale / max(120.0, uResolution.x * 0.18), 0.0, 0.12);
    if (colRand > 1.0 - streakProb) {
      color = mix(color, vec3(20.0 / 255.0), 0.12);
    }
  }

  // Radyal vinyet (merkez %35 açık, kenarlara doğru %75 kararma)
  float minDim = min(uResolution.x, uResolution.y);
  float maxDim = max(uResolution.x, uResolution.y);
  float rInner = minDim * 0.35;
  float rOuter = max(rInner + 1.0, maxDim * 0.68);
  float dist = length((vUv - 0.5) * uResolution);
  float t = clamp((dist - rInner) / (rOuter - rInner), 0.0, 1.0);
  float vigAlpha = t < 0.7 ? mix(0.0, 0.20, t / 0.7) : mix(0.20, 0.75, (t - 0.7) / 0.3);
  color *= (1.0 - vigAlpha);

  fragColor = vec4(color, src.a);
}
`;

export class PunkFanzineEngine implements IImageEngine<PunkFanzineParams> {
  readonly id = 'fanzine' as const;
  readonly supportsWebGL2 = true;

  render(
    sourceCanvas: HTMLCanvasElement,
    params: PunkFanzineParams,
    context: RenderContext
  ): HTMLCanvasElement {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const scale = context.referenceScale;
    const outputCanvas = canvasPool.getCanvas('fanzine_output', w, h, {
      willReadFrequently: !context.preferGpu,
    });

    if (context.preferGpu && webgl2Pipeline.canProcess(w, h)) {
      const ok = this.renderWebGL2(sourceCanvas, outputCanvas, w, h, params, scale);
      if (ok) return outputCanvas;
    }

    return this.renderCpu(sourceCanvas, outputCanvas, w, h, params, scale);
  }

  private renderWebGL2(
    sourceCanvas: HTMLCanvasElement,
    outputCanvas: HTMLCanvasElement,
    w: number,
    h: number,
    params: PunkFanzineParams,
    scale: number
  ): boolean {
    const gl = webgl2Pipeline.getContext();
    if (!gl) return false;

    const program = webgl2Pipeline.compileQuadProgram('fanzine_v1', FANZINE_FS);
    if (!program) return false;

    const srcTex = webgl2Pipeline.uploadCanvasTexture(sourceCanvas, true);
    if (!srcTex) return false;

    try {
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.uniform1i(gl.getUniformLocation(program, 'uTex'), 0);
      gl.uniform2f(gl.getUniformLocation(program, 'uResolution'), w, h);
      gl.uniform1f(gl.getUniformLocation(program, 'uContrastBoost'), params.contrastBoost);
      gl.uniform1f(gl.getUniformLocation(program, 'uTonerNoise'), params.tonerNoise / 100);
      gl.uniform1f(gl.getUniformLocation(program, 'uScale'), scale);

      webgl2Pipeline.drawQuad(program, w, h, true, null);
      return webgl2Pipeline.copyToCanvas(outputCanvas);
    } finally {
      gl.deleteTexture(srcTex);
    }
  }

  private renderCpu(
    sourceCanvas: HTMLCanvasElement,
    outputCanvas: HTMLCanvasElement,
    w: number,
    h: number,
    params: PunkFanzineParams,
    scale: number
  ): HTMLCanvasElement {
    const ctx = canvasPool.getContext2D(outputCanvas);
    const srcCtx = canvasPool.getContext2D(sourceCanvas);

    const imgData = srcCtx.getImageData(0, 0, w, h);
    const d = imgData.data;

    const normNoise = params.tonerNoise / 100;
    const rng = createSeededRng(1977 + Math.round(params.contrastBoost * 100) + params.tonerNoise);

    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3] ?? 0;
      if (a < 10) continue;

      let lum = luminance(d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0);
      lum = (lum - 128) * params.contrastBoost + 128;

      const microNoise = (rng() - 0.5) * normNoise * 75;
      const clumpNoise = rng() > 0.94 ? (rng() - 0.5) * normNoise * 140 : 0;
      lum += microNoise + clumpNoise;

      if (lum < 125) {
        d[i] = 20;
        d[i + 1] = 20;
        d[i + 2] = 20;
      } else {
        const paperGrain = (rng() - 0.5) * 12;
        d[i] = clampByte(228 + paperGrain);
        d[i + 1] = clampByte(224 + paperGrain);
        d[i + 2] = clampByte(215 + paperGrain);
      }
    }

    ctx.putImageData(imgData, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';

    if (normNoise > 0.15) {
      const streakCount = Math.floor((2 + normNoise * 6) * scale);
      ctx.fillStyle = 'rgba(20, 20, 20, 0.12)';
      for (let s = 0; s < streakCount; s++) {
        const streakX = Math.floor(rng() * w);
        const streakW = Math.max(1, Math.round((1 + rng() * 3) * scale));
        ctx.fillRect(streakX, 0, streakW, h);
      }
    }

    const radGrad = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.35,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.68
    );
    radGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    radGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.20)');
    radGrad.addColorStop(1, 'rgba(0, 0, 0, 0.75)');

    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    return outputCanvas;
  }
}
