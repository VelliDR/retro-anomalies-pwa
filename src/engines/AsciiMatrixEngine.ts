import { canvasPool } from '../core/CanvasPool.ts';
import { luminance } from '../core/ColorSpace.ts';
import type { AsciiMatrixParams, IImageEngine, RenderContext } from '../core/types.ts';
import { webgl2Pipeline } from '../core/WebGL2Pipeline.ts';

const CHAR_SETS = {
  density: ' .:-=+*#%@',
  binary: '01',
  hex: '0123456789ABCDEF',
} as const;

const ASCII_FS = `#version 300 es
precision highp float;

uniform sampler2D uTex;
uniform sampler2D uAtlas;
uniform vec2 uResolution;
uniform vec2 uCellSize;
uniform float uCharCount;
uniform int uColorMode; // 0 = matrix, 1 = amber, 2 = color

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 screenPx = vUv * uResolution;
  vec2 cellIdx = floor(screenPx / uCellSize);
  vec2 localUv = fract(screenPx / uCellSize);

  vec2 centerPx = min(uResolution - 1.0, (cellIdx + 0.5) * uCellSize);
  vec2 sampleUv = centerPx / uResolution;
  vec4 src = texture(uTex, sampleUv);

  vec3 bg = vec3(4.0, 8.0, 4.0) / 255.0;
  if (src.a < 0.1) {
    fragColor = vec4(bg, 1.0);
    return;
  }

  float lum = dot(src.rgb, vec3(0.299, 0.587, 0.114));
  float charIdx = clamp(floor(lum * uCharCount), 0.0, uCharCount - 1.0);
  vec2 atlasUv = vec2((charIdx + localUv.x) / uCharCount, localUv.y);
  float glyphAlpha = texture(uAtlas, atlasUv).a;

  vec3 fg;
  if (uColorMode == 0) {
    float green = (50.0 + lum * 205.0) / 255.0;
    float rb = lum > 0.75 ? ((lum - 0.75) * 4.0 * 180.0) / 255.0 : 0.0;
    fg = vec3(rb, green, max(20.0 / 255.0, rb));
  } else if (uColorMode == 1) {
    float red = (80.0 + lum * 175.0) / 255.0;
    float green = (lum * 180.0) / 255.0;
    float blue = lum > 0.85 ? ((lum - 0.85) * 6.0 * 150.0) / 255.0 : 0.0;
    fg = vec3(red, green, blue);
  } else {
    fg = src.rgb;
  }

  fragColor = vec4(mix(bg, fg, glyphAlpha), 1.0);
}
`;

export class AsciiMatrixEngine implements IImageEngine<AsciiMatrixParams> {
  readonly id = 'ascii' as const;
  readonly supportsWebGL2 = true;
  private cachedAtlasKey = '';
  private cachedAtlasCanvas: HTMLCanvasElement | null = null;

  private getGlyphAtlas(chars: readonly string[], cellW: number, cellH: number): HTMLCanvasElement {
    const key = `${chars.join('')}|${cellW}x${cellH}`;
    if (
      this.cachedAtlasKey === key &&
      this.cachedAtlasCanvas &&
      this.cachedAtlasCanvas.width === chars.length * cellW &&
      this.cachedAtlasCanvas.height === cellH
    ) {
      return this.cachedAtlasCanvas;
    }

    // CanvasPool dışındaki özel tuval: export sonrası releaseExcept tarafından sıfırlanmaz
    const atlasCanvas = this.cachedAtlasCanvas ?? document.createElement('canvas');
    atlasCanvas.width = Math.max(1, chars.length * cellW);
    atlasCanvas.height = Math.max(1, cellH);
    const atlasCtx = canvasPool.getContext2D(atlasCanvas);
    atlasCtx.clearRect(0, 0, atlasCanvas.width, atlasCanvas.height);
    atlasCtx.fillStyle = '#ffffff';
    atlasCtx.font = `bold ${cellH}px "Courier New", Courier, monospace`;
    atlasCtx.textAlign = 'center';
    atlasCtx.textBaseline = 'middle';

    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i] ?? ' ';
      atlasCtx.fillText(ch, i * cellW + cellW / 2, cellH / 2);
    }

    this.cachedAtlasKey = key;
    this.cachedAtlasCanvas = atlasCanvas;
    return atlasCanvas;
  }

  render(
    sourceCanvas: HTMLCanvasElement,
    params: AsciiMatrixParams,
    context: RenderContext
  ): HTMLCanvasElement {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const cellH = Math.max(6, Math.round(params.fontSize * context.referenceScale));
    const cellW = Math.max(3, Math.round(cellH * 0.6));
    const isPreset = params.charSetKey !== 'custom';
    const rawChars = isPreset
      ? CHAR_SETS[
          params.charSetKey === 'binary'
            ? 'binary'
            : params.charSetKey === 'hex'
            ? 'hex'
            : 'density'
        ]
      : params.customText || 'ANOMALIES';
    const glyphs = Array.from(rawChars);

    const outputCanvas = canvasPool.getCanvas('ascii_output', w, h);

    if (isPreset && context.preferGpu && webgl2Pipeline.canProcess(w, h)) {
      const atlasCanvas = this.getGlyphAtlas(glyphs, cellW, cellH);
      if (webgl2Pipeline.canProcess(atlasCanvas.width, atlasCanvas.height)) {
        const ok = this.renderWebGL2(
          sourceCanvas,
          atlasCanvas,
          outputCanvas,
          w,
          h,
          cellW,
          cellH,
          glyphs.length,
          params.colorMode
        );
        if (ok) return outputCanvas;
      }
    }

    return this.renderCpu(
      sourceCanvas,
      outputCanvas,
      w,
      h,
      cellW,
      cellH,
      isPreset,
      glyphs,
      params.colorMode
    );
  }

  private renderWebGL2(
    sourceCanvas: HTMLCanvasElement,
    atlasCanvas: HTMLCanvasElement,
    outputCanvas: HTMLCanvasElement,
    w: number,
    h: number,
    cellW: number,
    cellH: number,
    charCount: number,
    colorMode: AsciiMatrixParams['colorMode']
  ): boolean {
    const gl = webgl2Pipeline.getContext();
    if (!gl) return false;

    const program = webgl2Pipeline.compileQuadProgram('ascii_v2', ASCII_FS);
    if (!program) return false;

    const srcTex = webgl2Pipeline.uploadCanvasTexture(sourceCanvas, true);
    const atlasTex = webgl2Pipeline.uploadCanvasTexture(atlasCanvas, false);
    if (!srcTex || !atlasTex) {
      if (srcTex) gl.deleteTexture(srcTex);
      if (atlasTex) gl.deleteTexture(atlasTex);
      return false;
    }

    try {
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.uniform1i(gl.getUniformLocation(program, 'uTex'), 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.uniform1i(gl.getUniformLocation(program, 'uAtlas'), 1);

      gl.uniform2f(gl.getUniformLocation(program, 'uResolution'), w, h);
      gl.uniform2f(gl.getUniformLocation(program, 'uCellSize'), cellW, cellH);
      gl.uniform1f(gl.getUniformLocation(program, 'uCharCount'), charCount);
      gl.uniform1i(
        gl.getUniformLocation(program, 'uColorMode'),
        colorMode === 'matrix' ? 0 : colorMode === 'amber' ? 1 : 2
      );

      webgl2Pipeline.drawQuad(program, w, h, true, null);
      return webgl2Pipeline.copyToCanvas(outputCanvas);
    } finally {
      gl.deleteTexture(srcTex);
      gl.deleteTexture(atlasTex);
    }
  }

  private renderCpu(
    sourceCanvas: HTMLCanvasElement,
    outputCanvas: HTMLCanvasElement,
    w: number,
    h: number,
    cellW: number,
    cellH: number,
    isPreset: boolean,
    chars: readonly string[],
    colorMode: AsciiMatrixParams['colorMode']
  ): HTMLCanvasElement {
    const ctx = canvasPool.getContext2D(outputCanvas);
    const srcCtx = canvasPool.getContext2D(sourceCanvas);

    ctx.fillStyle = '#040804';
    ctx.fillRect(0, 0, w, h);

    const imgData = srcCtx.getImageData(0, 0, w, h);
    const d = imgData.data;

    ctx.font = `bold ${cellH}px "Courier New", Courier, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let customCharIdx = 0;

    for (let y = 0; y < h; y += cellH) {
      for (let x = 0; x < w; x += cellW) {
        const srcX = Math.min(w - 1, Math.floor(x + cellW / 2));
        const srcY = Math.min(h - 1, Math.floor(y + cellH / 2));
        const i = (srcY * w + srcX) * 4;

        const r = d[i] ?? 0;
        const g = d[i + 1] ?? 0;
        const b = d[i + 2] ?? 0;
        const a = (d[i + 3] ?? 0) / 255;

        if (a < 0.1) continue;

        const lum = luminance(r, g, b) / 255;

        let charToDraw: string;
        if (isPreset) {
          const charIdx = Math.min(chars.length - 1, Math.floor(lum * chars.length));
          charToDraw = chars[charIdx] ?? ' ';
        } else {
          charToDraw = chars[customCharIdx % chars.length] ?? ' ';
          customCharIdx++;
        }

        if (colorMode === 'matrix') {
          const green = Math.floor(50 + lum * 205);
          const redBlue = lum > 0.75 ? Math.floor((lum - 0.75) * 4 * 180) : 0;
          ctx.fillStyle = `rgb(${redBlue}, ${green}, ${Math.max(20, redBlue)})`;
        } else if (colorMode === 'amber') {
          const red = Math.floor(80 + lum * 175);
          const green = Math.floor(lum * 180);
          const blue = lum > 0.85 ? Math.floor((lum - 0.85) * 6 * 150) : 0;
          ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
        } else {
          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        }

        ctx.fillText(charToDraw, x + cellW / 2, y + cellH / 2);
      }
    }

    return outputCanvas;
  }
}
