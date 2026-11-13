export interface OnomatopoeiaOptions {
  fontSize?: number;
  scale?: number;
  x?: number;
  y?: number;
  rotation?: number;
  color?: string;
}

export class TextOverlayEngine {
  renderOnomatopoeia(
    targetCanvas: HTMLCanvasElement,
    text = 'THWIP!',
    options: OnomatopoeiaOptions = {}
  ): void {
    const w = targetCanvas.width;
    const h = targetCanvas.height;
    const resScale = Math.max(w, h) / 1200;
    const userScale = options.scale ?? 1.0;

    const ctx = targetCanvas.getContext('2d');
    if (!ctx) return;

    const fontSize = Math.round((options.fontSize ?? 90) * resScale * userScale);
    const x = options.x ?? w * 0.5;
    const y = options.y ?? h * 0.3;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(options.rotation ?? -0.12);

    ctx.font = `900 ${fontSize}px "Impact", "Bangers", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const shadowDepth = Math.max(1, Math.round(8 * resScale * userScale));
    for (let i = shadowDepth; i > 0; i--) {
      ctx.fillStyle = '#000000';
      ctx.fillText(text, i, i);
    }

    ctx.fillStyle = options.color ?? '#ffe600';
    ctx.fillText(text, 0, 0);

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.max(2, Math.round(4 * resScale * userScale));
    ctx.strokeText(text, 0, 0);

    ctx.restore();
  }

  renderComicFrame(targetCanvas: HTMLCanvasElement): void {
    const w = targetCanvas.width;
    const h = targetCanvas.height;
    const scale = Math.max(w, h) / 1200;
    const ctx = targetCanvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.fillStyle = '#ff0055';
    ctx.fillRect(20 * scale, 20 * scale, 130 * scale, 50 * scale);

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.round(16 * scale)}px sans-serif`;
    ctx.fillText('ANOMALIES', 28 * scale, 41 * scale);
    ctx.font = `bold ${Math.round(13 * scale)}px sans-serif`;
    ctx.fillText('#42 APPROVED', 28 * scale, 61 * scale);

    ctx.restore();
  }
}
