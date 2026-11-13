import { canvasPool } from '../core/CanvasPool.ts';
import { webgl2Pipeline } from '../core/WebGL2Pipeline.ts';
import type { CmykOffsetParams, IImageEngine, RenderContext } from '../core/types.ts';

const CMYK_ROSETTE_FS = `#version 300 es
precision highp float;

uniform sampler2D uSource;
uniform vec2 uResolution;
uniform float uDotSize;
uniform float uOffsetPx;
in vec2 vUv;
out vec4 fragColor;

vec2 rotate2d(vec2 p, float angleRad) {
  float c = cos(angleRad);
  float s = sin(angleRad);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

float halftoneChannel(vec2 pxCoord, vec2 shiftPx, float angleRad, int channelIdx) {
  vec2 shifted = pxCoord - shiftPx;
  vec2 rot = rotate2d(shifted, -angleRad);
  vec2 cellIdx = floor(rot / uDotSize);
  vec2 cellCenterRot = (cellIdx + 0.5) * uDotSize;
  vec2 cellCenterPx = rotate2d(cellCenterRot, angleRad) + shiftPx;

  // Hücre merkezinde 5-nokta alan yumuşatmalı örnekleme
  vec2 uvC = clamp(cellCenterPx / uResolution, 0.0, 1.0);
  vec2 stepUv = (uDotSize * 0.28) / uResolution;
  vec4 c0 = texture(uSource, uvC);
  vec3 avg = (
    c0.rgb +
    texture(uSource, clamp(uvC + vec2(stepUv.x, 0.0), 0.0, 1.0)).rgb +
    texture(uSource, clamp(uvC - vec2(stepUv.x, 0.0), 0.0, 1.0)).rgb +
    texture(uSource, clamp(uvC + vec2(0.0, stepUv.y), 0.0, 1.0)).rgb +
    texture(uSource, clamp(uvC - vec2(0.0, stepUv.y), 0.0, 1.0)).rgb
  ) * 0.2;

  if (c0.a < 0.1) return 0.0;

  float k = 1.0 - max(avg.r, max(avg.g, avg.b));
  float ink = k;
  if (channelIdx == 0) ink = k >= 0.999 ? 0.0 : (1.0 - avg.r - k) / (1.0 - k);
  else if (channelIdx == 1) ink = k >= 0.999 ? 0.0 : (1.0 - avg.g - k) / (1.0 - k);
  else if (channelIdx == 2) ink = k >= 0.999 ? 0.0 : (1.0 - avg.b - k) / (1.0 - k);

  if (ink < 0.03) return 0.0;

  float radius = sqrt(clamp(ink, 0.0, 1.0)) * (uDotSize * 0.575);
  float dist = length(rot - cellCenterRot);
  return 1.0 - smoothstep(radius - 0.65, radius + 0.65, dist);
}

void main() {
  // Ekran koordinatı (üstten aşağı)
  vec2 pxCoord = vec2(vUv.x * uResolution.x, vUv.y * uResolution.y);

  // Klasik matbaa Rosette açıları: C=15°, M=75°, Y=0°, K=45°
  float cCov = halftoneChannel(pxCoord, vec2(-uOffsetPx, -uOffsetPx * 0.5), 0.26179939, 0);
  float mCov = halftoneChannel(pxCoord, vec2( uOffsetPx,  uOffsetPx * 0.5), 1.30899694, 1);
  float yCov = halftoneChannel(pxCoord, vec2(0.0,        uOffsetPx * 0.3), 0.0,        2);
  float kCov = halftoneChannel(pxCoord, vec2(0.0,        0.0),             0.78539816, 3);

  vec3 paper = vec3(0.988, 0.980, 0.969); // #fcfaf7 matbaa kağıdı
  vec3 cInk = mix(vec3(1.0), vec3(0.0, 0.90, 1.0), cCov);
  vec3 mInk = mix(vec3(1.0), vec3(1.0, 0.0, 0.50), mCov);
  vec3 yInk = mix(vec3(1.0), vec3(1.0, 0.92, 0.23), yCov);
  vec3 kInk = mix(vec3(1.0), vec3(0.10, 0.10, 0.10), kCov);

  vec3 color = paper * cInk * mInk * yInk * kInk;
  fragColor = vec4(color, 1.0);
}
`;

export class CmykOffsetEngine implements IImageEngine<CmykOffsetParams> {
  readonly id = 'cmyk' as const;
  readonly supportsWebGL2 = true;

  render(
    sourceCanvas: HTMLCanvasElement,
    params: CmykOffsetParams,
    context: RenderContext
  ): HTMLCanvasElement {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;

    const dSize = Math.max(3, Math.round(params.dotSize * context.referenceScale));
    const offPx = Math.round(params.offsetPx * context.referenceScale);
    const outputCanvas = canvasPool.getCanvas('cmyk_output', w, h);

    if (context.preferGpu && webgl2Pipeline.canProcess(w, h)) {
      const ok = this.renderWebGL2(sourceCanvas, outputCanvas, w, h, dSize, offPx);
      if (ok) return outputCanvas;
    }

    return this.renderCpuFallback(sourceCanvas, outputCanvas, w, h, dSize, offPx);
  }

  private renderWebGL2(
    sourceCanvas: HTMLCanvasElement,
    outputCanvas: HTMLCanvasElement,
    w: number,
    h: number,
    dSize: number,
    offPx: number
  ): boolean {
    const gl = webgl2Pipeline.getContext();
    if (!gl) return false;

    const prog = webgl2Pipeline.compileQuadProgram('cmyk_rosette_v1', CMYK_ROSETTE_FS);
    if (!prog) return false;

    const srcTex = webgl2Pipeline.uploadCanvasTexture(sourceCanvas, true);
    if (!srcTex) return false;

    try {
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.uniform1i(gl.getUniformLocation(prog, 'uSource'), 0);
      gl.uniform2f(gl.getUniformLocation(prog, 'uResolution'), w, h);
      gl.uniform1f(gl.getUniformLocation(prog, 'uDotSize'), dSize);
      gl.uniform1f(gl.getUniformLocation(prog, 'uOffsetPx'), offPx);

      webgl2Pipeline.drawQuad(prog, w, h, true, null);
      return webgl2Pipeline.copyToCanvas(outputCanvas);
    } finally {
      gl.deleteTexture(srcTex);
    }
  }

  private renderCpuFallback(
    sourceCanvas: HTMLCanvasElement,
    outputCanvas: HTMLCanvasElement,
    w: number,
    h: number,
    dSize: number,
    offPx: number
  ): HTMLCanvasElement {
    const ctx = canvasPool.getContext2D(outputCanvas);
    const srcCtx = canvasPool.getContext2D(sourceCanvas);

    const imgData = srcCtx.getImageData(0, 0, w, h);
    const d = imgData.data;

    ctx.fillStyle = '#fcfaf7';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'multiply';

    const maxRadius = (dSize / 2) * 1.15;
    const diag = Math.hypot(w, h);

    // Rosette açıları: C=15°, M=75°, Y=0°, K=45°
    const channels = [
      { color: '#00e5ff', ox: -offPx, oy: -offPx * 0.5, angle: (15 * Math.PI) / 180, type: 'c' as const },
      { color: '#ff007f', ox: offPx, oy: offPx * 0.5, angle: (75 * Math.PI) / 180, type: 'm' as const },
      { color: '#ffeb3b', ox: 0, oy: offPx * 0.3, angle: 0, type: 'y' as const },
      { color: '#1a1a1a', ox: 0, oy: 0, angle: (45 * Math.PI) / 180, type: 'k' as const },
    ];

    const cx = w * 0.5;
    const cy = h * 0.5;

    for (const ch of channels) {
      ctx.fillStyle = ch.color;
      const cosA = Math.cos(ch.angle);
      const sinA = Math.sin(ch.angle);

      for (let gy = -diag * 0.55; gy < diag * 0.55; gy += dSize) {
        for (let gx = -diag * 0.55; gx < diag * 0.55; gx += dSize) {
          const px = cx + gx * cosA - gy * sinA + ch.ox;
          const py = cy + gx * sinA + gy * cosA + ch.oy;

          if (px < -dSize || px >= w + dSize || py < -dSize || py >= h + dSize) continue;

          const srcX = Math.min(w - 1, Math.max(0, Math.floor(px)));
          const srcY = Math.min(h - 1, Math.max(0, Math.floor(py)));
          const i = (srcY * w + srcX) * 4;

          const a = (d[i + 3] ?? 0) / 255;
          if (a < 0.1) continue;

          const r = (d[i] ?? 0) / 255;
          const g = (d[i + 1] ?? 0) / 255;
          const b = (d[i + 2] ?? 0) / 255;
          const k = 1 - Math.max(r, g, b);

          let ink = k;
          if (ch.type === 'c') ink = k === 1 ? 0 : (1 - r - k) / (1 - k);
          else if (ch.type === 'm') ink = k === 1 ? 0 : (1 - g - k) / (1 - k);
          else if (ch.type === 'y') ink = k === 1 ? 0 : (1 - b - k) / (1 - k);

          if (ink > 0.03) {
            ctx.beginPath();
            ctx.arc(px, py, Math.sqrt(ink) * maxRadius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    ctx.globalCompositeOperation = 'source-over';
    return outputCanvas;
  }
}
