import { canvasPool } from '../core/CanvasPool.ts';
import { createSeededRng } from '../core/Noise.ts';
import type { IImageEngine, RenderContext, TextGlitchParams } from '../core/types.ts';

export class TextGlitchEngine implements IImageEngine<TextGlitchParams> {
  readonly id = 'textglitch' as const;

  render(
    sourceCanvas: HTMLCanvasElement,
    params: TextGlitchParams,
    context: RenderContext
  ): HTMLCanvasElement {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const scale = context.referenceScale;

    const outputCanvas = canvasPool.getCanvas('text_output', w, h);
    const ctx = canvasPool.getContext2D(outputCanvas);

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(sourceCanvas, 0, 0);

    const text = params.text;
    if (!text || text.trim() === '') return outputCanvas;

    let fSize = Math.max(14, Math.round(params.fontSize * scale));
    ctx.save();

    if (params.style === 'vhs') {
      let vhsFontSize = Math.max(12, Math.round(fSize * 0.75));
      const displayText = `PLAY ► ${text.toUpperCase()}`;
      ctx.font = `bold ${vhsFontSize}px "Courier New", Courier, monospace`;
      const vhsMetrics = ctx.measureText(displayText);
      if (vhsMetrics.width > w * 0.88 && vhsMetrics.width > 0) {
        vhsFontSize = Math.max(10, Math.floor(vhsFontSize * ((w * 0.88) / vhsMetrics.width)));
        ctx.font = `bold ${vhsFontSize}px "Courier New", Courier, monospace`;
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      const posX = Math.round(w * 0.05);
      const posY = Math.round(h - h * 0.08);

      ctx.fillStyle = '#000000';
      ctx.fillText(displayText, posX + 2 * scale, posY + 2 * scale);

      ctx.fillStyle = '#00ffcc';
      ctx.fillText(displayText, posX, posY);

      const lineY = posY - Math.round(vhsFontSize * 0.4);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(0, lineY, w, Math.max(1, Math.round(2 * scale)));
    } else if (params.style === 'rgb_shift') {
      ctx.font = `900 ${fSize}px "Impact", "Arial Black", sans-serif`;
      const rgbMetrics = ctx.measureText(text);
      if (rgbMetrics.width > w * 0.88 && rgbMetrics.width > 0) {
        fSize = Math.max(12, Math.floor(fSize * ((w * 0.88) / rgbMetrics.width)));
        ctx.font = `900 ${fSize}px "Impact", "Arial Black", sans-serif`;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const centerX = w / 2;
      const centerY = h / 2;
      const shift = Math.max(2, Math.round(fSize * 0.12));

      ctx.fillStyle = 'rgba(0, 0, 0, 0.70)';
      ctx.fillText(text, centerX + 3 * scale, centerY + 3 * scale);

      ctx.fillStyle = '#ff0055';
      ctx.fillText(text, centerX + shift, centerY);

      ctx.fillStyle = '#00f0ff';
      ctx.fillText(text, centerX - shift, centerY);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, centerX, centerY);

      const sliceY = centerY - fSize * 0.2;
      const sliceH = Math.max(2, Math.round(fSize * 0.15));
      const sliceShift = Math.round(fSize * 0.15);

      ctx.drawImage(
        outputCanvas,
        centerX - w * 0.4,
        sliceY,
        w * 0.8,
        sliceH,
        centerX - w * 0.4 + sliceShift,
        sliceY,
        w * 0.8,
        sliceH
      );
    } else {
      // Yalnızca damgayı eskitmek için ayrı geçici katman kullan (fotoğraf piksellerini delme)
      const stampCanvas = canvasPool.getCanvas('textglitch_stamp', w, h);
      const stampCtx = canvasPool.getContext2D(stampCanvas);
      stampCtx.save();
      stampCtx.clearRect(0, 0, w, h);

      stampCtx.font = `900 ${fSize}px "Impact", "Arial Black", sans-serif`;
      const initialMetrics = stampCtx.measureText(text);
      const maxBoxW = w * 0.82;
      if (initialMetrics.width + fSize * 0.8 > maxBoxW && initialMetrics.width > 0) {
        fSize = Math.max(12, Math.floor(fSize * (maxBoxW / (initialMetrics.width + fSize * 0.8))));
        stampCtx.font = `900 ${fSize}px "Impact", "Arial Black", sans-serif`;
      }

      const centerX = w / 2;
      const centerY = h / 2;

      stampCtx.translate(centerX, centerY);
      stampCtx.rotate((-12 * Math.PI) / 180);

      stampCtx.textAlign = 'center';
      stampCtx.textBaseline = 'middle';

      const metrics = stampCtx.measureText(text);
      const padX = Math.round(fSize * 0.4);
      const padY = Math.round(fSize * 0.2);
      const boxW = metrics.width + padX * 2;
      const boxH = fSize + padY * 2;
      const borderW = Math.max(3, Math.round(fSize * 0.1));

      stampCtx.strokeStyle = '#dc2626';
      stampCtx.lineWidth = borderW;
      stampCtx.strokeRect(-boxW / 2, -boxH / 2, boxW, boxH);

      stampCtx.fillStyle = '#dc2626';
      stampCtx.fillText(text, 0, 0);

      stampCtx.globalCompositeOperation = 'destination-out';
      const dotCount = Math.floor(boxW * boxH * 0.012);
      const rng = createSeededRng(8842);

      for (let d = 0; d < dotCount; d++) {
        const rx = (rng() - 0.5) * boxW;
        const ry = (rng() - 0.5) * boxH;
        const rRadius = rng() * (2.5 * scale) + 0.5;
        stampCtx.beginPath();
        stampCtx.arc(rx, ry, rRadius, 0, Math.PI * 2);
        stampCtx.fill();
      }

      stampCtx.restore();
      ctx.drawImage(stampCanvas, 0, 0);
    }

    ctx.restore();
    return outputCanvas;
  }
}
