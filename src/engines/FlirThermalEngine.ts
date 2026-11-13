import { canvasPool } from '../core/CanvasPool.ts';
import { hslToRgb, luminance } from '../core/ColorSpace.ts';
import { webgl2Pipeline } from '../core/WebGL2Pipeline.ts';
import type { FlirThermalParams, IImageEngine, RenderContext } from '../core/types.ts';

const FLIR_BLUR_FS = `#version 300 es
precision highp float;

uniform sampler2D uTex;
uniform vec2 uTexelStep;
in vec2 vUv;
out vec4 fragColor;

void main() {
  const float w0 = 0.2270270270;
  const float w1 = 0.1945945946;
  const float w2 = 0.1216216216;
  const float w3 = 0.0540540541;
  const float w4 = 0.0162162162;

  vec4 sum = texture(uTex, vUv) * w0;
  sum += (texture(uTex, vUv + uTexelStep * 1.0) + texture(uTex, vUv - uTexelStep * 1.0)) * w1;
  sum += (texture(uTex, vUv + uTexelStep * 2.0) + texture(uTex, vUv - uTexelStep * 2.0)) * w2;
  sum += (texture(uTex, vUv + uTexelStep * 3.0) + texture(uTex, vUv - uTexelStep * 3.0)) * w3;
  sum += (texture(uTex, vUv + uTexelStep * 4.0) + texture(uTex, vUv - uTexelStep * 4.0)) * w4;
  fragColor = sum;
}
`;

const FLIR_MAP_FS = `#version 300 es
precision highp float;

uniform sampler2D uSource;
uniform sampler2D uLut;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 px = texture(uSource, vUv);
  if (px.a < 0.04) {
    fragColor = px;
    return;
  }
  float lum = dot(px.rgb, vec3(0.299, 0.587, 0.114));
  vec3 mapped = texture(uLut, vec2(clamp(lum, 0.0, 1.0), 0.5)).rgb;
  fragColor = vec4(mapped, px.a);
}
`;

const FLIR_COMPOSITE_FS = `#version 300 es
precision highp float;

uniform sampler2D uMapped;
uniform sampler2D uBloom;
uniform vec2 uResolution;
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 base = texture(uMapped, vUv);
  vec3 bloom = texture(uBloom, vUv).rgb;
  vec3 screened = 1.0 - (1.0 - base.rgb) * (1.0 - bloom);
  vec3 color = mix(base.rgb, screened, 0.20);

  vec2 centered = (vUv - 0.5) * uResolution;
  float dist = length(centered);
  float innerR = min(uResolution.x, uResolution.y) * 0.42;
  float outerR = max(uResolution.x, uResolution.y) * 0.70;
  float t = clamp((dist - innerR) / max(1.0, outerR - innerR), 0.0, 1.0);
  color *= (1.0 - t * 0.65);

  fragColor = vec4(color, base.a);
}
`;

export function buildFlirLut(mode: FlirThermalParams['mode']): Uint8Array {
  const lut = new Uint8Array(256 * 3);

  for (let i = 0; i < 256; i++) {
    const norm = i / 255;
    let r: number;
    let g: number;
    let b: number;

    if (mode === 'emerald') {
      if (norm < 0.5) {
        const t = norm / 0.5;
        r = Math.floor(t * 15);
        g = Math.floor(t * 180);
        b = Math.floor(t * 30);
      } else {
        const t = (norm - 0.5) / 0.5;
        r = Math.floor(15 + t * 240);
        g = Math.floor(180 + t * 75);
        b = Math.floor(30 + t * 225);
      }
    } else if (mode === 'rainbow') {
      const h = (1 - norm) * 240;
      const rgb = hslToRgb(h / 360, 1.0, 0.5);
      r = rgb[0];
      g = rgb[1];
      b = rgb[2];
    } else {
      // Ironbow: Siyah/Lacivert -> Mor -> Kırmızı -> Sarı -> Beyaz
      // Düzeltilmiş aralıklar: [0, 0.25), [0.25, 0.50), [0.50, 0.75), [0.75, 1.0]
      if (norm < 0.25) {
        const t = norm / 0.25;
        r = Math.floor(t * 45);
        g = 0;
        b = Math.floor(80 + t * 100);
      } else if (norm < 0.5) {
        const t = (norm - 0.25) / 0.25;
        r = Math.floor(45 + t * 180);
        g = Math.floor(t * 30);
        b = Math.floor(180 - t * 180);
      } else if (norm < 0.75) {
        const t = (norm - 0.5) / 0.25;
        r = Math.floor(225 + t * 30);
        g = Math.floor(30 + t * 195);
        b = 0;
      } else {
        const t = (norm - 0.75) / 0.25;
        r = 255;
        g = Math.floor(225 + t * 30);
        b = Math.floor(t * 255);
      }
    }

    lut[i * 3] = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }

  return lut;
}

export class FlirThermalEngine implements IImageEngine<FlirThermalParams> {
  readonly id = 'flir' as const;
  readonly supportsWebGL2 = true;
  private readonly lutCache = new Map<FlirThermalParams['mode'], Uint8Array>();

  private getLut(mode: FlirThermalParams['mode']): Uint8Array {
    const cached = this.lutCache.get(mode);
    if (cached) return cached;
    const lut = buildFlirLut(mode);
    this.lutCache.set(mode, lut);
    return lut;
  }

  render(
    sourceCanvas: HTMLCanvasElement,
    params: FlirThermalParams,
    context: RenderContext
  ): HTMLCanvasElement {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const scale = context.referenceScale;
    const lut = this.getLut(params.mode);
    const outputCanvas = canvasPool.getCanvas('flir_output', w, h);

    if (context.preferGpu && webgl2Pipeline.canProcess(w, h)) {
      const ok = this.renderWebGL2(sourceCanvas, outputCanvas, w, h, scale, lut);
      if (ok) return outputCanvas;
    }

    return this.renderCpuFallback(sourceCanvas, outputCanvas, w, h, scale, lut);
  }

  private renderWebGL2(
    sourceCanvas: HTMLCanvasElement,
    outputCanvas: HTMLCanvasElement,
    w: number,
    h: number,
    scale: number,
    lut: Uint8Array
  ): boolean {
    const gl = webgl2Pipeline.getContext();
    if (!gl) return false;

    const mapProg = webgl2Pipeline.compileQuadProgram('flir_map_v1', FLIR_MAP_FS);
    const blurProg = webgl2Pipeline.compileQuadProgram('flir_blur_v1', FLIR_BLUR_FS);
    const compProg = webgl2Pipeline.compileQuadProgram('flir_comp_v1', FLIR_COMPOSITE_FS);
    if (!mapProg || !blurProg || !compProg) return false;

    const srcTex = webgl2Pipeline.uploadCanvasTexture(sourceCanvas, false);
    const lutTex = gl.createTexture();
    if (!srcTex || !lutTex) {
      if (srcTex) gl.deleteTexture(srcTex);
      if (lutTex) gl.deleteTexture(lutTex);
      return false;
    }

    const lutRgba = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
      lutRgba[i * 4] = lut[i * 3] ?? 0;
      lutRgba[i * 4 + 1] = lut[i * 3 + 1] ?? 0;
      lutRgba[i * 4 + 2] = lut[i * 3 + 2] ?? 0;
      lutRgba[i * 4 + 3] = 255;
    }

    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, lutRgba);

    const mappedFbo = webgl2Pipeline.createTextureFbo(w, h, false);
    const bw = Math.max(64, Math.round(w * 0.5));
    const bh = Math.max(64, Math.round(h * 0.5));
    const blurA = webgl2Pipeline.createTextureFbo(bw, bh, false);
    const blurB = webgl2Pipeline.createTextureFbo(bw, bh, false);

    try {
      if (!mappedFbo || !blurA || !blurB) return false;

      // 1. LUT Renk Eşleme
      gl.useProgram(mapProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.uniform1i(gl.getUniformLocation(mapProg, 'uSource'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, lutTex);
      gl.uniform1i(gl.getUniformLocation(mapProg, 'uLut'), 1);
      webgl2Pipeline.drawQuad(mapProg, w, h, true, mappedFbo);

      // 2. Ayrılabilir Isı Yayılımı (Heat Bloom)
      const stepScale = Math.max(0.75, scale * 1.25);
      gl.useProgram(blurProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, mappedFbo.texture);
      gl.uniform1i(gl.getUniformLocation(blurProg, 'uTex'), 0);
      gl.uniform2f(gl.getUniformLocation(blurProg, 'uTexelStep'), stepScale / bw, 0);
      webgl2Pipeline.drawQuad(blurProg, bw, bh, false, blurA);

      gl.useProgram(blurProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, blurA.texture);
      gl.uniform1i(gl.getUniformLocation(blurProg, 'uTex'), 0);
      gl.uniform2f(gl.getUniformLocation(blurProg, 'uTexelStep'), 0, stepScale / bh);
      webgl2Pipeline.drawQuad(blurProg, bw, bh, false, blurB);

      // 3. Bileştirme + Optik Vinjet
      gl.useProgram(compProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, mappedFbo.texture);
      gl.uniform1i(gl.getUniformLocation(compProg, 'uMapped'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, blurB.texture);
      gl.uniform1i(gl.getUniformLocation(compProg, 'uBloom'), 1);
      gl.uniform2f(gl.getUniformLocation(compProg, 'uResolution'), w, h);
      webgl2Pipeline.drawQuad(compProg, w, h, false, null);

      return webgl2Pipeline.copyToCanvas(outputCanvas);
    } finally {
      gl.deleteTexture(srcTex);
      gl.deleteTexture(lutTex);
      if (mappedFbo) webgl2Pipeline.deleteFbo(mappedFbo);
      if (blurA) webgl2Pipeline.deleteFbo(blurA);
      if (blurB) webgl2Pipeline.deleteFbo(blurB);
    }
  }

  private renderCpuFallback(
    sourceCanvas: HTMLCanvasElement,
    outputCanvas: HTMLCanvasElement,
    w: number,
    h: number,
    scale: number,
    lut: Uint8Array
  ): HTMLCanvasElement {
    const ctx = canvasPool.getContext2D(outputCanvas);
    const srcCtx = canvasPool.getContext2D(sourceCanvas);

    const imgData = srcCtx.getImageData(0, 0, w, h);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] ?? 0;
      if (a < 10) continue;

      const lum = Math.min(255, Math.round(luminance(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0)));
      const lutIdx = lum * 3;
      data[i] = lut[lutIdx] ?? 0;
      data[i + 1] = lut[lutIdx + 1] ?? 0;
      data[i + 2] = lut[lutIdx + 2] ?? 0;
    }

    ctx.putImageData(imgData, 0, 0);

    const blurDiv = Math.max(2, Math.round(4 * scale));
    const bw = Math.max(32, Math.round(w / blurDiv));
    const bh = Math.max(32, Math.round(h / blurDiv));
    const bloomCanvas = canvasPool.getCanvas('flir_bloom_cpu', bw, bh);
    const bloomCtx = canvasPool.getContext2D(bloomCanvas);
    bloomCtx.imageSmoothingEnabled = true;
    bloomCtx.drawImage(outputCanvas, 0, 0, bw, bh);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.2;
    ctx.drawImage(bloomCanvas, 0, 0, w, h);
    ctx.restore();

    ctx.save();
    const radGrad = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.42,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.7
    );
    radGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    radGrad.addColorStop(1, 'rgba(0, 0, 0, 0.65)');
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    return outputCanvas;
  }
}
