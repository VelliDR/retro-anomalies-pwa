/**
 * Bellek sızıntılarını ve gereksiz GPU/DOM tahsislerini önleyen sabit tuval havuzu.
 */
export class CanvasPool {
  private readonly pool = new Map<string, HTMLCanvasElement>();

  getCanvas(id: string, width: number, height: number): HTMLCanvasElement {
    let canvas = this.pool.get(id);
    if (!canvas) {
      canvas = document.createElement('canvas');
      this.pool.set(id, canvas);
    }

    const safeW = Math.max(1, width | 0);
    const safeH = Math.max(1, height | 0);

    if (canvas.width !== safeW || canvas.height !== safeH) {
      canvas.width = safeW;
      canvas.height = safeH;
    } else {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, safeW, safeH);
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
  }

  releaseExcept(keepIds: readonly string[]): void {
    const keep = new Set(keepIds);
    for (const [id, canvas] of this.pool.entries()) {
      if (keep.has(id)) continue;
      canvas.width = 0;
      canvas.height = 0;
      this.pool.delete(id);
    }
  }

  releaseAll(): void {
    this.pool.forEach((canvas) => {
      canvas.width = 0;
      canvas.height = 0;
    });
    this.pool.clear();
  }
}

export const canvasPool = new CanvasPool();
