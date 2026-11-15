import { canvasPool } from './CanvasPool.ts';

export interface LoadedImageResult {
  fullCanvas: HTMLCanvasElement;
  previewCanvas: HTMLCanvasElement;
  ratio: number;
}

const MAX_SAFE_FULL_DIM = 4096;
const MAX_SAFE_FULL_PIXELS = 16_777_216; // Mobil Safari canvas bellek sınırı (4096x4096)

function clampFullDimensions(w: number, h: number): { width: number; height: number } {
  let scale = 1;
  const maxSide = Math.max(w, h);
  if (maxSide > MAX_SAFE_FULL_DIM) {
    scale = Math.min(scale, MAX_SAFE_FULL_DIM / maxSide);
  }
  const pixels = w * h * scale * scale;
  if (pixels > MAX_SAFE_FULL_PIXELS) {
    scale *= Math.sqrt(MAX_SAFE_FULL_PIXELS / pixels);
  }
  if (scale >= 1) return { width: w, height: h };
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
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
    previewMaxDim = 1200,
    onBeforeAllocate?: () => void
  ): Promise<LoadedImageResult> {
    let targetBlob: Blob = file;

    if (isHeicFile(file)) {
      let heic2any: (typeof import('heic2any'))['default'];
      try {
        const heic2anyModule = await import('heic2any');
        heic2any = heic2anyModule.default;
      } catch (err) {
        const offlineHint =
          typeof navigator !== 'undefined' && navigator.onLine === false
            ? 'Çevrimdışı durumda HEIC çözücü modülü önbellekte bulunamadı. Çevrimiçi iken bir kez açın veya JPG/PNG yükleyin.'
            : 'HEIC çözücü modülü yüklenemedi.';
        throw new Error(offlineHint, { cause: err });
      }

      try {
        const converted = await heic2any({
          blob: file,
          toType: 'image/jpeg',
          quality: 0.95,
        });
        const resolved = Array.isArray(converted) ? converted[0] : converted;
        if (!resolved) {
          throw new Error('HEIC dönüşümü boş çıktı üretti.');
        }
        targetBlob = resolved;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`HEIC görseli dönüştürülürken bir hata oluştu: ${msg}`, { cause: err });
      }
    }

    const decoded = await decodeToDrawable(targetBlob);
    try {
      if (decoded.width <= 0 || decoded.height <= 0) {
        throw new Error('Görsel boyutları geçersiz (0×0).');
      }

      // Yükleme başarılı olduktan sonra eski havuzu temizle
      onBeforeAllocate?.();

      const { width: fullW, height: fullH } = clampFullDimensions(decoded.width, decoded.height);

      const fullCanvas = canvasPool.getCanvas('loader_full', fullW, fullH, {
        willReadFrequently: true,
      });
      const fullCtx = canvasPool.getContext2D(fullCanvas, { willReadFrequently: true });
      fullCtx.imageSmoothingEnabled = true;
      fullCtx.imageSmoothingQuality = 'high';
      fullCtx.drawImage(decoded.drawable, 0, 0, fullW, fullH);

      let prevW = fullW;
      let prevH = fullH;
      if (prevW > previewMaxDim || prevH > previewMaxDim) {
        if (prevW > prevH) {
          prevH = Math.max(1, Math.round((prevH * previewMaxDim) / prevW));
          prevW = previewMaxDim;
        } else {
          prevW = Math.max(1, Math.round((prevW * previewMaxDim) / prevH));
          prevH = previewMaxDim;
        }
      }

      const previewCanvas = canvasPool.getCanvas('loader_preview', prevW, prevH, {
        willReadFrequently: true,
      });
      const prevCtx = canvasPool.getContext2D(previewCanvas, { willReadFrequently: true });
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
