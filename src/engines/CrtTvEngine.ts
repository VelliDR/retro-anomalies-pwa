import { canvasPool } from '../core/CanvasPool.ts';
import { webgl2Pipeline } from '../core/WebGL2Pipeline.ts';
import type { CrtTvParams, IImageEngine, RenderContext } from '../core/types.ts';

const CRT_BLUR_FS = `#version 300 es
precision highp float;

uniform sampler2D uTex;
uniform vec2 uTexelStep;
in vec2 vUv;
out vec4 fragColor;

void main() {
  // 9-tap Gauss ağırlıklı ayrılabilir bulanıklaştırma (Fosfor Bloom için)
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

const CRT_COMPOSITE_FS = `#version 300 es
precision highp float;

uniform sampler2D uSource;
uniform sampler2D uBloom;
uniform vec2 uResolution;
uniform float uShiftUv;
uniform float uBloomEnabled;
uniform float uScanGap;
uniform float uLineH;
in vec2 vUv;
out vec4 fragColor;

vec3 screenBlend(vec3 base, vec3 top, float alpha) {
  vec3 blended = 1.0 - (1.0 - base) * (1.0 - top);
  return mix(base, blended, alpha);
}

void main() {
  vec4 baseSample = texture(uSource, vUv);
  vec3 color = baseSample.rgb;

  // 1. CRT Kromatik Sapma (Sağ/Sol RGB tüp kayması)
  vec3 shifted = texture(uSource, clamp(vUv + vec2(uShiftUv, 0.0), 0.0, 1.0)).rgb;
  color = screenBlend(color, shifted, 0.35);

  // 2. Fosfor Işıması (Bloom)
  if (uBloomEnabled > 0.5) {
    vec3 bloomCol = clamp(texture(uBloom, vUv).rgb * 1.25, 0.0, 1.0);
    color = screenBlend(color, bloomCol, 0.30);
  }

  // 3. Yatay Tarama Çizgileri (Üstten aşağı piksel koordinatı)
  float yPx = uResolution.y - gl_FragCoord.y;
  if (mod(yPx, uScanGap) < uLineH) {
    color *= 0.60;
  }

  // 4. Tüp Cam Kenar Gölgesi (Vignette)
  vec2 centered = (vUv - 0.5) * uResolution;
  float dist = length(centered);
  float innerR = min(uResolution.x, uResolution.y) * 0.40;
  float outerR = max(uResolution.x, uResolution.y) * 0.72;
  float t = clamp((dist - innerR) / max(1.0, outerR - innerR), 0.0, 1.0);
  float vigAlpha = t < 0.7 ? mix(0.0, 0.25, t / 0.7) : mix(0.25, 0.85, (t - 0.7) / 0.3);
  color *= (1.0 - vigAlpha);

  fragColor = vec4(color, baseSample.a);
}
`;

export class CrtTvEngine implements IImageEngine<CrtTvParams> {
  readonly id = 'crttv' as const;
  readonly supportsWebGL2 = true;

  render(
    sourceCanvas: HTMLCanvasElement,
    params: CrtTvParams,
    context: RenderContext
  ): HTMLCanvasElement {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const scale = context.referenceScale;
    const gap = Math.max(2, Math.round(params.scanlineGap * scale));
    const lineH = Math.max(1, Math.round(gap * 0.45));
    const shiftPx = Math.max(1, Math.round(2 * scale));

    const outputCanvas = canvasPool.getCanvas('crt_output', w, h);

    if (context.preferGpu && webgl2Pipeline.canProcess(w, h)) {
      const ok = this.renderWebGL2(sourceCanvas, outputCanvas, w, h, scale, gap, lineH, shiftPx, params.phosphorGlow);
      if (ok) return outputCanvas;
    }

    return this.renderCpuFallback(sourceCanvas, outputCanvas, w, h, scale, gap, lineH, shiftPx, params.phosphorGlow);
  }

  private renderWebGL2(
    sourceCanvas: HTMLCanvasElement,
    outputCanvas: HTMLCanvasElement,
    w: number,
    h: number,
    scale: number,
    gap: number,
    lineH: number,
    shiftPx: number,
    phosphorGlow: boolean
  ): boolean {
    const gl = webgl2Pipeline.getContext();
    if (!gl) return false;

    const compProg = webgl2Pipeline.compileQuadProgram('crt_composite_v1', CRT_COMPOSITE_FS);
    const blurProg = phosphorGlow
      ? webgl2Pipeline.compileQuadProgram('crt_blur_v1', CRT_BLUR_FS)
      : null;
    if (!compProg || (phosphorGlow && !blurProg)) return false;

    const srcTex = webgl2Pipeline.uploadCanvasTexture(sourceCanvas, true);
    if (!srcTex) return false;

    let fboA = null;
    let fboB = null;
    try {
      if (phosphorGlow && blurProg) {
        const bw = Math.max(64, Math.round(w * 0.5));
        const bh = Math.max(64, Math.round(h * 0.5));
        fboA = webgl2Pipeline.createTextureFbo(bw, bh, false);
        fboB = webgl2Pipeline.createTextureFbo(bw, bh, false);
        if (!fboA || !fboB) return false;

        const radiusScale = Math.max(0.75, scale * 1.35);

        gl.useProgram(blurProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, srcTex);
        gl.uniform1i(gl.getUniformLocation(blurProg, 'uTex'), 0);
        gl.uniform2f(gl.getUniformLocation(blurProg, 'uTexelStep'), radiusScale / bw, 0);
        webgl2Pipeline.drawQuad(blurProg, bw, bh, false, fboA);

        gl.useProgram(blurProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, fboA.texture);
        gl.uniform1i(gl.getUniformLocation(blurProg, 'uTex'), 0);
        gl.uniform2f(gl.getUniformLocation(blurProg, 'uTexelStep'), 0, radiusScale / bh);
        webgl2Pipeline.drawQuad(blurProg, bw, bh, false, fboB);
      }

      gl.useProgram(compProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.uniform1i(gl.getUniformLocation(compProg, 'uSource'), 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, fboB ? fboB.texture : srcTex);
      gl.uniform1i(gl.getUniformLocation(compProg, 'uBloom'), 1);

      gl.uniform2f(gl.getUniformLocation(compProg, 'uResolution'), w, h);
      gl.uniform1f(gl.getUniformLocation(compProg, 'uShiftUv'), shiftPx / w);
      gl.uniform1f(gl.getUniformLocation(compProg, 'uBloomEnabled'), phosphorGlow ? 1.0 : 0.0);
      gl.uniform1f(gl.getUniformLocation(compProg, 'uScanGap'), gap);
      gl.uniform1f(gl.getUniformLocation(compProg, 'uLineH'), lineH);

      webgl2Pipeline.drawQuad(compProg, w, h, true, null);
      return webgl2Pipeline.copyToCanvas(outputCanvas);
    } finally {
      gl.deleteTexture(srcTex);
      if (fboA) webgl2Pipeline.deleteFbo(fboA);
      if (fboB) webgl2Pipeline.deleteFbo(fboB);
    }
  }

  private renderCpuFallback(
    sourceCanvas: HTMLCanvasElement,
    outputCanvas: HTMLCanvasElement,
    w: number,
    h: number,
    scale: number,
    gap: number,
    lineH: number,
    shiftPx: number,
    phosphorGlow: boolean
  ): HTMLCanvasElement {
    const ctx = canvasPool.getContext2D(outputCanvas);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(sourceCanvas, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.35;
    ctx.drawImage(sourceCanvas, -shiftPx, 0);
    ctx.restore();

    if (phosphorGlow) {
      // Safari/GPU ctx.filter sorunlarından kaçınmak için ölçek düşürme tabanlı yumuşak bloom
      const blurDiv = Math.max(2, Math.round(4 * scale));
      const bw = Math.max(32, Math.round(w / blurDiv));
      const bh = Math.max(32, Math.round(h / blurDiv));
      const glowCanvas = canvasPool.getCanvas('crt_glow_cpu', bw, bh);
      const glowCtx = canvasPool.getContext2D(glowCanvas);
      glowCtx.imageSmoothingEnabled = true;
      glowCtx.imageSmoothingQuality = 'high';
      glowCtx.drawImage(sourceCanvas, 0, 0, bw, bh);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.28;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(glowCanvas, 0, 0, w, h);
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.40)';
    for (let y = 0; y < h; y += gap) {
      ctx.fillRect(0, y, w, lineH);
    }

    const radGrad = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.4,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.72
    );
    radGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    radGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.25)');
    radGrad.addColorStop(1, 'rgba(0, 0, 0, 0.85)');

    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    return outputCanvas;
  }
}
