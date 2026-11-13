import { canvasPool } from './CanvasPool.ts';

export interface LoadedImageResult {
  fullCanvas: HTMLCanvasElement;
  previewCanvas: HTMLCanvasElement;
  ratio: number;
}

function isHeicFile(file: File | Blob): boolean {
  const type = (file.type || '').toLowerCase();
  const name = 'name' in file && typeof file.name === 'string' ? file.name.toLowerCase() : '';
  return (
    type.includes('heic') ||
    type.includes('heif') ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')
  );
}

async function decodeToDrawable(blob: Blob): Promise<{
  drawable: ImageBitmap | HTMLImageElement;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return {
        drawable: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Eski Safari/tarayıcı sürümlerinde options desteklenmezse HTMLImageElement'e düş
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Görsel formatı ayrıştırılamadı.'));
      el.src = objectUrl;
    });
    return {
      drawable: img,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

export class ImageLoader {
  static async loadFromFile(
    file: File | Blob,
    previewMaxDim = 1200
  ): Promise<LoadedImageResult> {
    let targetBlob: Blob = file;

    if (isHeicFile(file)) {
      try {
        const heic2anyModule = await import('heic2any');
        const heic2any = heic2anyModule.default;
        const converted = await heic2any({
          blob: file,
          toType: 'image/jpeg',
          quality: 0.95,
        });
        targetBlob = Array.isArray(converted) ? (converted[0] ?? file) : converted;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`HEIC görseli dönüştürülürken bir hata oluştu: ${msg}`, { cause: err });
      }
    }

    const decoded = await decodeToDrawable(targetBlob);
    try {
      const fullW = decoded.width;
      const fullH = decoded.height;

      const fullCanvas = canvasPool.getCanvas('loader_full', fullW, fullH);
      const fullCtx = canvasPool.getContext2D(fullCanvas);
      fullCtx.drawImage(decoded.drawable, 0, 0, fullW, fullH);

      let prevW = fullW;
      let prevH = fullH;
      if (prevW > previewMaxDim || prevH > previewMaxDim) {
        if (prevW > prevH) {
          prevH = Math.round((prevH * previewMaxDim) / prevW);
          prevW = previewMaxDim;
        } else {
          prevW = Math.round((prevW * previewMaxDim) / prevH);
          prevH = previewMaxDim;
        }
      }

      const previewCanvas = canvasPool.getCanvas('loader_preview', prevW, prevH);
      const prevCtx = canvasPool.getContext2D(previewCanvas);
      prevCtx.imageSmoothingEnabled = true;
      prevCtx.imageSmoothingQuality = 'high';
      prevCtx.drawImage(decoded.drawable, 0, 0, prevW, prevH);

      return {
        fullCanvas,
        previewCanvas,
        ratio: fullW / prevW,
      };
    } finally {
      decoded.cleanup();
    }
  }
}
