export interface CanvasPoolOptions {
  willReadFrequently?: boolean;
}

/**
 * Bellek sızıntılarını ve gereksiz GPU/DOM tahsislerini önleyen sabit tuval havuzu.
 */
export class CanvasPool {
  private readonly pool = new Map<string, HTMLCanvasElement>();
  private readonly readbackFlags = new Map<string, boolean>();

  getCanvas(
    id: string,
    width: number,
    height: number,
    options?: CanvasPoolOptions
  ): HTMLCanvasElement {
    const wantReadback = Boolean(options?.willReadFrequently);
    let canvas = this.pool.get(id);
    const prevReadback = this.readbackFlags.get(id) ?? false;

    if (!canvas || (options?.willReadFrequently !== undefined && prevReadback !== wantReadback)) {
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      canvas = document.createElement('canvas');
      this.pool.set(id, canvas);
      this.readbackFlags.set(id, wantReadback);
      if (wantReadback) {
        // İlk context çağrısında readback bayrağını kilitle
        canvas.getContext('2d', { willReadFrequently: true });
      }
    }

    const safeW = Math.max(1, width | 0);
    const safeH = Math.max(1, height | 0);

    if (canvas.width !== safeW || canvas.height !== safeH) {
      canvas.width = safeW;
      canvas.height = safeH;
    } else {
      const ctx = canvas.getContext('2d', wantReadback ? { willReadFrequently: true } : undefined);
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.imageSmoothingEnabled = true;
        ctx.clearRect(0, 0, safeW, safeH);
      }
    }

    return canvas;
  }

  getContext2D(
    canvas: HTMLCanvasElement,
    options?: CanvasRenderingContext2DSettings
  ): CanvasRenderingContext2D {
    const ctx = canvas.getContext('2d', options);
    if (!ctx) {
      throw new Error('2D Canvas context alınamadı.');
    }
    return ctx;
  }

  release(id: string): void {
    const canvas = this.pool.get(id);
    if (!canvas) return;
    canvas.width = 0;
    canvas.height = 0;
    this.pool.delete(id);
    this.readbackFlags.delete(id);
  }

  releaseExcept(keepIds: readonly string[]): void {
    const keep = new Set(keepIds);
    for (const [id, canvas] of this.pool.entries()) {
      if (keep.has(id)) continue;
      canvas.width = 0;
      canvas.height = 0;
      this.pool.delete(id);
      this.readbackFlags.delete(id);
    }
  }

  releaseAll(): void {
    this.pool.forEach((canvas) => {
      canvas.width = 0;
      canvas.height = 0;
    });
    this.pool.clear();
    this.readbackFlags.clear();
  }
}

export const canvasPool = new CanvasPool();
