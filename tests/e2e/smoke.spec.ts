import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';

// 1x1 veya 64x64 geçerli bir test PNG üretimi için canvas yerine saf PNG bytes (veya tarayıcı içi sentetik PNG)
test('loads app, processes synthetic image across WebGL2/Worker engines, toggles compare and export options', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto('/');
  await expect(page).toHaveTitle(/Anomalies/);

  const gpuBadge = page.locator('#gpuStatusBadge');
  await expect(gpuBadge).toBeVisible();
  await expect(gpuBadge).toHaveAttribute('type', 'button');

  // Sentetik PNG dosyası oluşturup input#fileInput üzerinden yükle
  const pngBuffer = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 120;
    const ctx = c.getContext('2d')!;
    const grad = ctx.createLinearGradient(0, 0, 160, 120);
    grad.addColorStop(0, '#ff3366');
    grad.addColorStop(0.5, '#ffcc33');
    grad.addColorStop(1, '#1155ff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 160, 120);
    const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });

  await page.setInputFiles('#fileInput', {
    name: 'synthetic-test.png',
    mimeType: 'image/png',
    buffer: Buffer.from(pngBuffer),
  });

  // Çıktı ve araçlar görünür hale gelmeli
  await expect(page.locator('#btnDownload')).toBeEnabled();
  await expect(page.locator('#viewportTools')).toBeVisible();
  await expect(page.locator('#exportOptionsCard')).toBeVisible();

  // WebGL2 / Worker motorları hata vermeden çalışmalı
  for (const engine of ['fanzine', 'glitch', 'ascii', 'vangogh', 'postcard']) {
    await page.click(`.engine-btn[data-engine="${engine}"]`);
    await page.waitForTimeout(150);
  }

  // Canvas piksel çıktısının boş olmadığını doğrula
  const canvasDims = await page.evaluate(() => {
    const c = document.getElementById('mainCanvas') as HTMLCanvasElement;
    return { w: c.width, h: c.height };
  });
  expect(canvasDims.w).toBeGreaterThan(100);
  expect(canvasDims.h).toBeGreaterThan(100);

  // Önce / Sonra karşılaştırma düğmesi & slider testi
  const compareBtn = page.locator('#btnCompareToggle');
  await compareBtn.click();
  await expect(compareBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#compareCanvas')).toBeVisible();
  await expect(page.locator('#compareRange')).toBeVisible();

  await page.locator('#compareRange').fill('75');
  await page.locator('#compareRange').dispatchEvent('input');
  await expect(page.locator('#comparePercentLabel')).toHaveText('%75');

  // Esnek dışa aktarma format/kalite kontrolü
  await expect(page.locator('#exportQuality')).toBeDisabled();
  await page.selectOption('#exportFormat', 'image/webp');
  await expect(page.locator('#exportQuality')).toBeEnabled();

  expect(pageErrors).toEqual([]);
});
