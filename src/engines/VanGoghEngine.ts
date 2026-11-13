import { canvasPool } from '../core/CanvasPool.ts';
import { clamp } from '../core/ColorSpace.ts';
import { PerlinNoise2D } from '../core/Noise.ts';
import type { IImageEngine, RenderContext, VanGoghParams } from '../core/types.ts';
import { webgl2Pipeline } from '../core/WebGL2Pipeline.ts';
import { workerBridge } from '../core/WorkerBridge.ts';
import {
  FLOATS_PER_VERTEX,
  generateVanGoghStrokes,
  packStrokesToRibbonChunks,
  type StrokeInstance,
} from './vangogh/StrokeGenerator.ts';

const UNDERPAINT_BLUR_FS = `#version 300 es
precision highp float;

uniform sampler2D uTex;
uniform vec2 uTexelStep;
uniform float uGrade;
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

  if (uGrade > 0.5) {
    float l = dot(sum.rgb, vec3(0.299, 0.587, 0.114));
    vec3 sat = mix(vec3(l), sum.rgb, 1.38);
    vec3 con = (sat - 0.5) * 1.08 + 0.5;
    sum.rgb = clamp(con, 0.0, 1.0);
  }
  fragColor = sum;
}
`;

const BRUSH_RIBBON_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUv;
layout(location = 2) in vec2 aDir;
layout(location = 3) in vec4 aColor;
layout(location = 4) in float aMeta; // floor(meta) = bristles, fract(meta) = seed

uniform vec2 uResolution;

out vec2 vUv;
out vec2 vDir;
out vec4 vColor;
out float vMeta;

void main() {
  vec2 ndc = vec2(
    (aPos.x / uResolution.x) * 2.0 - 1.0,
    1.0 - (aPos.y / uResolution.y) * 2.0
  );
  gl_Position = vec4(ndc, 0.0, 1.0);
  vUv = aUv;
  vDir = aDir;
  vColor = aColor;
  vMeta = aMeta;
}
`;

const BRUSH_RIBBON_FS = `#version 300 es
precision highp float;

in vec2 vUv;
in vec2 vDir;
in vec4 vColor;
in float vMeta;

layout(location = 0) out vec4 fragColor;
layout(location = 1) out vec4 fragNormal;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

void main() {
  float u = vUv.x;
  float v = vUv.y;

  float endFade = smoothstep(0.0, 0.12, u) * smoothstep(1.0, 0.84, u);
  float edgeMask = 1.0 - smoothstep(0.76, 1.0, abs(v));
  float bristles = max(3.0, floor(vMeta));
  float seed = fract(vMeta);

  // Kıl izleri ve analitik yükseklik türevi
  float freq = bristles * 3.14159265;
  float phase = v * freq + sin(u * 6.2831853 + seed * 17.3) * 0.55;
  float ridge = 0.5 + 0.5 * cos(phase);
  float dRidgeDv = -sin(phase) * (0.35 + 0.12 * bristles * 0.2);
  float dTaperDu = cos(u * 3.14159265) * 0.45;

  // Kıl başına mikro ton çeşitliliği
  float bristleId = floor((v * 0.5 + 0.5) * bristles);
  float bRand = hash11(bristleId * 19.31 + seed * 97.13) - 0.5;
  vec3 paintRgb = clamp(vColor.rgb + vec3(bRand * 0.085) + (ridge - 0.5) * 0.05, 0.0, 1.0);

  // Kıllar arası ince boşluk bırakarak dokulu yağlı boya görünümü ver
  float bristleGap = smoothstep(0.04, 0.34, ridge + 0.22);
  float alpha = clamp(vColor.a * endFade * edgeMask * (0.72 + 0.28 * bristleGap), 0.0, 1.0);
  if (alpha < 0.01) discard;

  vec2 perp = vec2(-vDir.y, vDir.x);
  vec2 slope = (vDir * dTaperDu + perp * dRidgeDv) * endFade;
  vec2 encSlope = clamp(slope * 0.5 + 0.5, 0.0, 1.0);

  fragColor = vec4(paintRgb, alpha);
  fragNormal = vec4(encSlope, clamp(ridge * endFade, 0.0, 1.0), alpha);
}
`;

const IMPASTO_LIGHT_FS = `#version 300 es
precision highp float;

uniform sampler2D uColorTex;
uniform sampler2D uNormalTex;
uniform vec2 uResolution;
uniform float uImpasto;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 base = texture(uColorTex, vUv);
  if (uImpasto < 0.5) {
    fragColor = base;
    return;
  }

  vec4 normSample = texture(uNormalTex, vUv);
  vec2 texel = 1.0 / uResolution;

  // Komşu yükseklik farkı ile makro boya kabartma kenarı
  float hL = texture(uNormalTex, vUv - vec2(texel.x, 0.0)).b;
  float hR = texture(uNormalTex, vUv + vec2(texel.x, 0.0)).b;
  float hD = texture(uNormalTex, vUv - vec2(0.0, texel.y)).b;
  float hU = texture(uNormalTex, vUv + vec2(0.0, texel.y)).b;

  vec2 analyticSlope = normSample.rg * 2.0 - 1.0;
  vec2 macroGrad = vec2(hR - hL, hU - hD) * 1.4;
  vec2 combinedSlope = (analyticSlope * 0.9 + macroGrad) * normSample.a;

  // Sol-üst yönlü atölye ışığı (Blinn-Phong)
  vec3 N = normalize(vec3(-combinedSlope.x, combinedSlope.y, 0.85));
  vec3 L = normalize(vec3(-0.55, 0.65, 0.82));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);

  float diff = clamp(dot(N, L), 0.0, 1.0);
  float spec = pow(clamp(dot(N, H), 0.0, 1.0), 34.0) * normSample.a;

  // İnce keten tuval dokusu
  vec2 pxCoord = vUv * uResolution;
  float weave = (sin(pxCoord.x * 1.4) * sin(pxCoord.y * 1.4)) * 0.014;

  vec3 lit = base.rgb * (0.86 + 0.24 * diff + weave) + vec3(0.20 * spec);
  fragColor = vec4(clamp(lit, 0.0, 1.0), base.a);
}
`;

export class VanGoghEngine implements IImageEngine<VanGoghParams> {
  readonly id = 'vangogh' as const;
  readonly supportsWebGL2 = true;
  private readonly noise = new PerlinNoise2D();
  private sharedVbo: WebGLBuffer | null = null;

  render(
    sourceCanvas: HTMLCanvasElement,
    params: VanGoghParams,
    context: RenderContext
  ): HTMLCanvasElement {
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;
    const scale = context.referenceScale;

    const targetCanvas = canvasPool.getCanvas('vangogh_output', width, height);
    const srcCtx = canvasPool.getContext2D(sourceCanvas);
    const pixels = srcCtx.getImageData(0, 0, width, height).data;

    const strokes = generateVanGoghStrokes(pixels, width, height, params, scale, this.noise);

    if (context.preferGpu && webgl2Pipeline.canProcess(width, height)) {
      const chunks = packStrokesToRibbonChunks(strokes);
      const ok = this.renderWebGL2Chunks(
        sourceCanvas,
        targetCanvas,
        chunks,
        width,
        height,
        scale,
        params.impasto
      );
      if (ok) return targetCanvas;
    }

    return this.renderCpuFallback(
      sourceCanvas,
      targetCanvas,
      strokes,
      width,
      height,
      scale,
      params.impasto
    );
  }

  async renderAsync(
    sourceCanvas: HTMLCanvasElement,
    params: VanGoghParams,
    context: RenderContext,
    signal?: AbortSignal
  ): Promise<HTMLCanvasElement> {
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;
    const scale = context.referenceScale;
    const srcCtx = canvasPool.getContext2D(sourceCanvas);
    const pixels = srcCtx.getImageData(0, 0, width, height).data;

    const useGpu = context.preferGpu && webgl2Pipeline.canProcess(width, height);

    if (useGpu) {
      const chunks = await workerBridge.computeVanGoghRibbons(
        pixels,
        width,
        height,
        params,
        scale,
        signal
      );
      if (signal?.aborted) {
        const err = new Error('Render cancelled');
        err.name = 'AbortError';
        throw err;
      }

      const targetCanvas = canvasPool.getCanvas('vangogh_output', width, height);
      const ok = this.renderWebGL2Chunks(
        sourceCanvas,
        targetCanvas,
        chunks,
        width,
        height,
        scale,
        params.impasto
      );
      if (ok) return targetCanvas;

      const strokes = generateVanGoghStrokes(pixels, width, height, params, scale, this.noise);
      return this.renderCpuFallback(
        sourceCanvas,
        targetCanvas,
        strokes,
        width,
        height,
        scale,
        params.impasto
      );
    }

    const strokes = await workerBridge.computeVanGoghStrokes(
      pixels,
      width,
      height,
      params,
      scale,
      signal
    );
    if (signal?.aborted) {
      const err = new Error('Render cancelled');
      err.name = 'AbortError';
      throw err;
    }

    const targetCanvas = canvasPool.getCanvas('vangogh_output', width, height);
    return this.renderCpuFallback(
      sourceCanvas,
      targetCanvas,
      strokes,
      width,
      height,
      scale,
      params.impasto
    );
  }

  private renderWebGL2Chunks(
    sourceCanvas: HTMLCanvasElement,
    outputCanvas: HTMLCanvasElement,
    chunks: readonly Float32Array[],
    width: number,
    height: number,
    scale: number,
    impasto: boolean
  ): boolean {
    const gl = webgl2Pipeline.getContext();
    if (!gl) return false;

    const blurProg = webgl2Pipeline.compileQuadProgram('vg_underpaint_v1', UNDERPAINT_BLUR_FS);
    const brushProg = webgl2Pipeline.compileProgram(
      'vg_brush_v1',
      BRUSH_RIBBON_VS,
      BRUSH_RIBBON_FS
    );
    const lightProg = webgl2Pipeline.compileQuadProgram('vg_impasto_v1', IMPASTO_LIGHT_FS);
    if (!blurProg || !brushProg || !lightProg) return false;

    const srcTex = webgl2Pipeline.uploadCanvasTexture(sourceCanvas, true);
    if (!srcTex) return false;

    const uw = Math.max(64, Math.round(width * 0.5));
    const uh = Math.max(64, Math.round(height * 0.5));
    const blurA = webgl2Pipeline.createTextureFbo(uw, uh, false);
    const mrt = webgl2Pipeline.createMrtFbo(width, height);

    try {
      if (!blurA || !mrt) return false;

      // 1. Astar Katmanı: Ayrılabilir GPU Gauss Blur + Doygunluk
      const blurStep = Math.max(1.0, 2.2 * scale);
      gl.useProgram(blurProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.uniform1i(gl.getUniformLocation(blurProg, 'uTex'), 0);
      gl.uniform2f(gl.getUniformLocation(blurProg, 'uTexelStep'), blurStep / uw, 0);
      gl.uniform1f(gl.getUniformLocation(blurProg, 'uGrade'), 0.0);
      webgl2Pipeline.drawQuad(blurProg, uw, uh, true, blurA);

      // MRT Attachment 0'a astarı çiz, Attachment 1'i nötr normale temizle
      gl.bindFramebuffer(gl.FRAMEBUFFER, mrt.fbo);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.clearBufferfv(gl.COLOR, 1, new Float32Array([0.5, 0.5, 0.0, 0.0]));
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);

      gl.useProgram(blurProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, blurA.texture);
      gl.uniform1i(gl.getUniformLocation(blurProg, 'uTex'), 0);
      gl.uniform2f(gl.getUniformLocation(blurProg, 'uTexelStep'), 0, blurStep / uh);
      gl.uniform1f(gl.getUniformLocation(blurProg, 'uGrade'), 1.0);
      webgl2Pipeline.drawQuad(blurProg, width, height, false, {
        fbo: mrt.fbo,
        texture: mrt.textures[0],
        width,
        height,
      });

      // 2. MRT Fırça Ribbon Çizimi (Renk + Analitik Yüzey Normali)
      if (!this.sharedVbo) {
        this.sharedVbo = gl.createBuffer();
      }
      if (!this.sharedVbo) return false;

      const vao = gl.createVertexArray();
      if (!vao) return false;

      try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, mrt.fbo);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        gl.viewport(0, 0, width, height);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.useProgram(brushProg);
        gl.uniform2f(gl.getUniformLocation(brushProg, 'uResolution'), width, height);

        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.sharedVbo);

        const stride = FLOATS_PER_VERTEX * 4;
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 16);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 4, gl.FLOAT, false, stride, 24);
        gl.enableVertexAttribArray(4);
        gl.vertexAttribPointer(4, 1, gl.FLOAT, false, stride, 40);

        for (let c = 0; c < chunks.length; c++) {
          const chunk = chunks[c];
          if (!chunk || chunk.length === 0) continue;
          gl.bufferData(gl.ARRAY_BUFFER, chunk, gl.STREAM_DRAW);
          gl.drawArrays(gl.TRIANGLES, 0, chunk.length / FLOATS_PER_VERTEX);
        }

        gl.disable(gl.BLEND);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      } finally {
        gl.bindVertexArray(null);
        gl.deleteVertexArray(vao);
      }

      // 3. Final Blinn-Phong Impasto Işıklandırma Geçişi
      gl.useProgram(lightProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, mrt.textures[0]);
      gl.uniform1i(gl.getUniformLocation(lightProg, 'uColorTex'), 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, mrt.textures[1]);
      gl.uniform1i(gl.getUniformLocation(lightProg, 'uNormalTex'), 1);

      gl.uniform2f(gl.getUniformLocation(lightProg, 'uResolution'), width, height);
      gl.uniform1f(gl.getUniformLocation(lightProg, 'uImpasto'), impasto ? 1.0 : 0.0);

      webgl2Pipeline.drawQuad(lightProg, width, height, false, null);
      return webgl2Pipeline.copyToCanvas(outputCanvas);
    } finally {
      gl.deleteTexture(srcTex);
      if (blurA) webgl2Pipeline.deleteFbo(blurA);
      if (mrt) webgl2Pipeline.deleteMrtFbo(mrt);
    }
  }

  private renderCpuFallback(
    sourceCanvas: HTMLCanvasElement,
    targetCanvas: HTMLCanvasElement,
    strokes: StrokeInstance[],
    width: number,
    height: number,
    scale: number,
    impasto: boolean
  ): HTMLCanvasElement {
    const ctx = canvasPool.getContext2D(targetCanvas);

    // Safari/ctx.filter sorununu önlemek için ölçekli astar bulanıklaştırma
    const uw = Math.max(32, Math.round(width / Math.max(4, 10 * scale)));
    const uh = Math.max(32, Math.round(height / Math.max(4, 10 * scale)));
    const underCanvas = canvasPool.getCanvas('vg_under_cpu', uw, uh);
    const underCtx = canvasPool.getContext2D(underCanvas);
    underCtx.imageSmoothingEnabled = true;
    underCtx.imageSmoothingQuality = 'high';
    underCtx.drawImage(sourceCanvas, 0, 0, uw, uh);

    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(underCanvas, 0, 0, width, height);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let s = 0; s < strokes.length; s++) {
      const stroke = strokes[s]!;
      const pts = stroke.points;
      if (pts.length < 2) continue;

      const [r, g, b] = stroke.rgb;
      const halfW = stroke.width * 0.5;
      const bristles = Math.max(3, Math.min(5, stroke.bristles));

      for (let br = 0; br < bristles; br++) {
        const frac = br / (bristles - 1) - 0.5;
        const offset = frac * stroke.width * 0.72;
        const shade = Math.round(frac * 18);
        const rr = clamp(r + shade, 0, 255);
        const gg = clamp(g + shade, 0, 255);
        const bb = clamp(b + shade, 0, 255);

        ctx.strokeStyle = `rgba(${rr}, ${gg}, ${bb}, ${stroke.alpha})`;
        ctx.lineWidth = Math.max(0.8 * scale, (stroke.width / bristles) * 1.15);

        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i]!;
          const prev = pts[Math.max(0, i - 1)]!;
          const next = pts[Math.min(pts.length - 1, i + 1)]!;
          const dx = next.x - prev.x;
          const dy = next.y - prev.y;
          const len = Math.hypot(dx, dy) || 1;
          const ox = p.x + (-dy / len) * offset;
          const oy = p.y + (dx / len) * offset;

          if (i === 0) ctx.moveTo(ox, oy);
          else ctx.lineTo(ox, oy);
        }
        ctx.stroke();
      }

      if (impasto && stroke.impastoStrength > 0.5) {
        const reliefOffset = Math.max(0.7, 0.9 * scale);
        ctx.lineWidth = Math.max(0.6 * scale, halfW * 0.25);

        ctx.strokeStyle = `rgba(0, 0, 0, ${stroke.alpha * 0.2})`;
        ctx.beginPath();
        pts.forEach((p, idx) => {
          if (idx === 0) ctx.moveTo(p.x + reliefOffset, p.y + reliefOffset);
          else ctx.lineTo(p.x + reliefOffset, p.y + reliefOffset);
        });
        ctx.stroke();

        ctx.strokeStyle = `rgba(255, 255, 255, ${stroke.alpha * 0.34})`;
        ctx.beginPath();
        pts.forEach((p, idx) => {
          if (idx === 0) ctx.moveTo(p.x - reliefOffset, p.y - reliefOffset);
          else ctx.lineTo(p.x - reliefOffset, p.y - reliefOffset);
        });
        ctx.stroke();
      }
    }

    return targetCanvas;
  }
}
