import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';

async function sampleMainCanvas(page: Page) {
  return page.evaluate(() => {
    const c = document.getElementById('mainCanvas') as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    const w = c.width;
    const h = c.height;
    const data = ctx.getImageData(0, 0, w, h).data;

    let topR = 0;
    let topG = 0;
    let topB = 0;
    let topA = 0;
    let topN = 0;
    let botR = 0;
    let botG = 0;
    let botB = 0;
    let botA = 0;
    let botN = 0;
    let minAlpha = 255;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const a = data[i + 3] ?? 0;
        if (a < minAlpha) minAlpha = a;
        if (y >= 8 && y < Math.floor(h * 0.35) && x >= 8 && x < w - 8) {
          topR += data[i] ?? 0;
          topG += data[i + 1] ?? 0;
          topB += data[i + 2] ?? 0;
          topA += a;
          topN++;
        } else if (y >= Math.floor(h * 0.65) && y < h - 8 && x >= 8 && x < w - 8) {
          botR += data[i] ?? 0;
          botG += data[i + 1] ?? 0;
          botB += data[i + 2] ?? 0;
          botA += a;
          botN++;
        }
      }
    }

    const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
    const avgTop = { r: topR / topN, g: topG / topN, b: topB / topN, a: topA / topN };
    const avgBot = { r: botR / botN, g: botG / botN, b: botB / botN, a: botA / botN };

    return {
      w,
      h,
      minAlpha,
      topLum: lum(avgTop.r, avgTop.g, avgTop.b),
      botLum: lum(avgBot.r, avgBot.g, avgBot.b),
      top: avgTop,
      bot: avgBot,
      hash: `${w}x${h}:${Math.round(avgTop.r)}:${Math.round(avgBot.b)}:${minAlpha}`,
    };
  });
}

test('processes all engines, maintains WebGL2/CPU orientation & alpha parity, and exports cleanly without HTTP/console errors', async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('response', (res) => {
    if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.url()}`);
  });

  await page.goto('/');
  await expect(page).toHaveTitle(/Anomalies/);

  const gpuBadge = page.locator('#gpuStatusBadge');
  await expect(gpuBadge).toBeVisible();
  await expect(gpuBadge).toHaveAttribute('type', 'button');

  // Üst yarı sıcak-aydınlık (255, 190, 40), alt yarı koyu-mavi (20, 40, 220) sentetik PNG
  const pngBuffer = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 120;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffbe28';
    ctx.fillRect(0, 0, 160, 60);
    ctx.fillStyle = '#1428dc';
    ctx.fillRect(0, 60, 160, 60);
    const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });

  await page.setInputFiles('#fileInput', {
    name: 'synthetic-test.png',
    mimeType: 'image/png',
    buffer: Buffer.from(pngBuffer),
  });

  await expect(page.locator('#btnDownload')).toBeEnabled();
  await expect(page.locator('#viewportTools')).toBeVisible();
  await expect(page.locator('#exportOptionsCard')).toBeVisible();
  await expect.poll(async () => (await sampleMainCanvas(page)).w).toBe(160);

  // WebGL2 motorlarında Y yönelimi, alfa korunumu ve CPU paritesi kontrolü
  const gpuEngines = ['glitch', 'crttv', 'ascii', 'flir', 'cmyk', 'fanzine', 'vangogh'] as const;

  for (const mode of ['gpu', 'cpu'] as const) {
    const isPressed = (await gpuBadge.getAttribute('aria-pressed')) === 'true';
    const wantGpu = mode === 'gpu';
    if (wantGpu !== isPressed) {
      await gpuBadge.click();
    }

    for (const engine of gpuEngines) {
      const prevHash = (await sampleMainCanvas(page)).hash;
      await page.click(`.engine-btn[data-engine="${engine}"]`);
      if (engine !== 'vangogh') {
        await expect.poll(async () => (await sampleMainCanvas(page)).hash).not.toBe(prevHash);
      } else {
        await page.waitForTimeout(350);
      }

      const s = await sampleMainCanvas(page);
      expect(s.minAlpha).toBeGreaterThanOrEqual(250);
      expect(s.topLum).toBeGreaterThan(s.botLum);
      if (engine === 'glitch' || engine === 'cmyk' || engine === 'crttv' || engine === 'vangogh') {
        expect(s.top.r).toBeGreaterThan(s.top.b);
        expect(s.bot.b).toBeGreaterThan(s.bot.r);
      }
    }
  }

  // Koşullu UI kontrollerini (visibleWhen) ve TextGlitch Stamp alfa korumasını doğrula
  await page.click('.engine-btn[data-engine="sensorcorrupt"]');
  await expect(page.locator('#input-chaosLevel')).toBeVisible();
  await expect(page.locator('#input-lineJitter')).toBeHidden();
  await page.selectOption('#input-mode', 'standard');
  await expect(page.locator('#input-lineJitter')).toBeVisible();
  await expect(page.locator('#input-bitShift')).toBeVisible();

  await page.click('.engine-btn[data-engine="textglitch"]');
  await page.selectOption('#input-style', 'stamp');
  await page.waitForTimeout(120);
  const stampSample = await sampleMainCanvas(page);
  expect(stampSample.minAlpha).toBe(255);

  // Kalan CPU/Worker motorları (pixelart, thermalpaper, colorclash, minecraft, postcard)
  for (const engine of ['pixelart', 'thermalpaper', 'colorclash', 'minecraft', 'postcard']) {
    await page.click(`.engine-btn[data-engine="${engine}"]`);
    await page.waitForTimeout(150);
    const dims = await sampleMainCanvas(page);
    if (engine === 'postcard') {
      expect(dims.w).toBeGreaterThan(160);
      expect(dims.h).toBeGreaterThan(120);
    } else {
      expect(dims.w).toBe(160);
      expect(dims.h).toBe(120);
    }
  }

  // Önce / Sonra karşılaştırma düğmesi + Postcard merkezleme kontrolü
  const compareBtn = page.locator('#btnCompareToggle');
  await compareBtn.click();
  await expect(compareBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#compareCanvas')).toBeVisible();
  const compareCornerAlpha = await page.evaluate(() => {
    const c = document.getElementById('compareCanvas') as HTMLCanvasElement;
    return c.getContext('2d')!.getImageData(0, 0, 1, 1).data[3];
  });
  expect(compareCornerAlpha).toBe(0);

  await page.locator('#compareRange').fill('75');
  await page.locator('#compareRange').dispatchEvent('input');
  await expect(page.locator('#comparePercentLabel')).toHaveText('%75');

  // Esnek dışa aktarma format/kalite kontrolü ve gerçek indirme doğrulaması
  await expect(page.locator('#exportQuality')).toBeDisabled();
  await page.selectOption('#exportFormat', 'image/webp');
  await expect(page.locator('#exportQuality')).toBeEnabled();

  const downloadPromise = page.waitForEvent('download');
  await page.click('#btnDownload');
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('anomalies_postcard_');

  expect(failedRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
