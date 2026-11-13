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

    const fSize = Math.max(14, Math.round(params.fontSize * scale));
    ctx.save();

    if (params.style === 'vhs') {
      const vhsFontSize = Math.max(12, Math.round(fSize * 0.75));
      ctx.font = `bold ${vhsFontSize}px "Courier New", Courier, monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      const posX = Math.round(w * 0.05);
      const posY = Math.round(h - h * 0.08);
      const displayText = `PLAY ► ${text.toUpperCase()}`;

      ctx.fillStyle = '#000000';
      ctx.fillText(displayText, posX + 2 * scale, posY + 2 * scale);

      ctx.fillStyle = '#00ffcc';
      ctx.fillText(displayText, posX, posY);

      const lineY = posY - Math.round(vhsFontSize * 0.4);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fillRect(0, lineY, w, Math.max(1, Math.round(2 * scale)));
    } else if (params.style === 'rgb_shift') {
      ctx.font = `900 ${fSize}px "Impact", "Arial Black", sans-serif`;
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
      const centerX = w / 2;
      const centerY = h / 2;

      ctx.translate(centerX, centerY);
      ctx.rotate((-12 * Math.PI) / 180);

      ctx.font = `900 ${fSize}px "Impact", "Arial Black", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const metrics = ctx.measureText(text);
      const padX = Math.round(fSize * 0.4);
      const padY = Math.round(fSize * 0.2);
      const boxW = metrics.width + padX * 2;
      const boxH = fSize + padY * 2;
      const borderW = Math.max(3, Math.round(fSize * 0.1));

      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = borderW;
      ctx.strokeRect(-boxW / 2, -boxH / 2, boxW, boxH);

      ctx.fillStyle = '#dc2626';
      ctx.fillText(text, 0, 0);

      ctx.globalCompositeOperation = 'destination-out';
      const dotCount = Math.floor(boxW * boxH * 0.012);
      const rng = createSeededRng(8842);

      for (let d = 0; d < dotCount; d++) {
        const rx = (rng() - 0.5) * boxW;
        const ry = (rng() - 0.5) * boxH;
        const rRadius = rng() * (2.5 * scale) + 0.5;
        ctx.beginPath();
        ctx.arc(rx, ry, rRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
    return outputCanvas;
  }
}
