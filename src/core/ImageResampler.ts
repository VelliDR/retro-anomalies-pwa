/**
 * Yüksek çözünürlüklü görselleri moiré ve aliasing olmadan hedef ızgaraya indirger.
 * Her hedef hücredeki tüm kaynak piksellerin alan ortalamasını (box integration) hesaplar.
 */
export function downsampleAreaAverage(
  pixels: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dstW * dstH * 4);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;

  for (let dy = 0; dy < dstH; dy++) {
    const syStart = Math.floor(dy * scaleY);
    const syEnd = Math.min(srcH, Math.max(syStart + 1, Math.ceil((dy + 1) * scaleY)));

    for (let dx = 0; dx < dstW; dx++) {
      const sxStart = Math.floor(dx * scaleX);
      const sxEnd = Math.min(srcW, Math.max(sxStart + 1, Math.ceil((dx + 1) * scaleX)));

      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;
      let count = 0;

      for (let sy = syStart; sy < syEnd; sy++) {
        const rowOff = sy * srcW;
        for (let sx = sxStart; sx < sxEnd; sx++) {
          const i = (rowOff + sx) * 4;
          rSum += pixels[i] ?? 0;
          gSum += pixels[i + 1] ?? 0;
          bSum += pixels[i + 2] ?? 0;
          aSum += pixels[i + 3] ?? 0;
          count++;
        }
      }

      const outIdx = (dy * dstW + dx) * 4;
      if (count > 0) {
        out[outIdx] = Math.round(rSum / count);
        out[outIdx + 1] = Math.round(gSum / count);
        out[outIdx + 2] = Math.round(bSum / count);
        out[outIdx + 3] = Math.round(aSum / count);
      }
    }
  }

  return out;
}
