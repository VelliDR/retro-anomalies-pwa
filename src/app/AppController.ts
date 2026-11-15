import { MotionController } from '../controllers/MotionController.ts';
import { canvasPool } from '../core/CanvasPool.ts';
import { clamp } from '../core/ColorSpace.ts';
import { ImageLoader } from '../core/ImageLoader.ts';
import type {
  EngineId,
  EngineParamsMap,
  RenderContext,
  TextOverlayParams,
  TiltState,
} from '../core/types.ts';
import { webgl2Pipeline } from '../core/WebGL2Pipeline.ts';
import { TextOverlayEngine } from '../engines/TextOverlayEngine.ts';
import {
  createDefaultParams,
  createDefaultTextOverlay,
  createEngines,
  type EngineCollection,
} from './EngineRegistry.ts';
import { renderParamControls } from './ParamControls.ts';

type ExportMimeType = 'image/png' | 'image/webp' | 'image/jpeg';

const EXPORT_EXTENSION: Record<ExportMimeType, string> = {
  'image/png': 'png',
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
};

export class AppController {
  private readonly mainCanvas = document.getElementById('mainCanvas') as HTMLCanvasElement | null;
  private readonly ctx = this.mainCanvas?.getContext('2d') ?? null;
  private readonly canvasStage = document.getElementById('canvasStage');
  private readonly compareCanvas = document.getElementById(
    'compareCanvas'
  ) as HTMLCanvasElement | null;
  private readonly compareCtx = this.compareCanvas?.getContext('2d') ?? null;
  private readonly compareDivider = document.getElementById('compareDivider');
  private readonly viewportTools = document.getElementById('viewportTools');
  private readonly btnCompareToggle = document.getElementById(
    'btnCompareToggle'
  ) as HTMLButtonElement | null;
  private readonly compareRange = document.getElementById(
    'compareRange'
  ) as HTMLInputElement | null;
  private readonly comparePercentLabel = document.getElementById('comparePercentLabel');

  private readonly dropZone = document.getElementById('drop-zone');
  private readonly fileInput = document.getElementById('fileInput') as HTMLInputElement | null;
  private readonly placeholder = document.getElementById('placeholder');
  private readonly paramsContainer = document.getElementById('paramsContainer');
  private readonly engineBar = document.getElementById('engineBar');
  private readonly exportOptionsCard = document.getElementById('exportOptionsCard');
  private readonly exportFormat = document.getElementById(
    'exportFormat'
  ) as HTMLSelectElement | null;
  private readonly exportMaxDim = document.getElementById(
    'exportMaxDim'
  ) as HTMLSelectElement | null;
  private readonly exportQuality = document.getElementById(
    'exportQuality'
  ) as HTMLInputElement | null;
  private readonly exportQualityWrap = document.getElementById('exportQualityWrap');
  private readonly exportQualityVal = document.getElementById('exportQualityVal');
  private readonly btnUpload = document.getElementById('btnUpload') as HTMLButtonElement | null;
  private readonly btnDownload = document.getElementById('btnDownload') as HTMLButtonElement | null;
  private readonly btnShare = document.getElementById('btnShare') as HTMLButtonElement | null;
  private readonly statusToast = document.getElementById('statusToast');
  private readonly gpuStatusBadge = document.getElementById(
    'gpuStatusBadge'
  ) as HTMLButtonElement | null;

  private readonly engines: EngineCollection = createEngines();
  private readonly textOverlay = new TextOverlayEngine();
  private readonly params: EngineParamsMap = createDefaultParams();
  private readonly textOverlayParams: TextOverlayParams = createDefaultTextOverlay();
  private readonly motion: MotionController;

  private fullSourceCanvas: HTMLCanvasElement | null = null;
  private previewSourceCanvas: HTMLCanvasElement | null = null;
  private activeEngine: EngineId = 'pixelart';
  private currentTilt: TiltState = { tiltX: 0, tiltY: 0 };
  private preferGpu = webgl2Pipeline.getCapabilities().available;
  private renderPending = false;
  private isRenderingPreview = false;
  private queuedPreviewRender = false;
  private activePreviewPromise: Promise<void> | null = null;
  private isExporting = false;
  private dragDepth = 0;
  private activeRenderController: AbortController | null = null;
  private renderSequence = 0;
  private shakeTimerId: number | null = null;
  private shakeBaseIntensity: number | null = null;
  private toastTimerId: number | null = null;

  private compareEnabled = false;
  private compareSplitPct = 50;
  private isDraggingCompare = false;

  constructor() {
    this.motion = new MotionController(
      () => this.handleShake(),
      (tilt) => this.handleTilt(tilt)
    );
    this.updateGpuBadge();
    this.initShareSupport();
    this.updateExportQualityState();
    this.updateCompareVisuals();
    this.initEventListeners();
  }

  private showStatus(message: string, isError = false): void {
    if (!this.statusToast) {
      if (isError) console.error(message);
      return;
    }
    if (this.toastTimerId !== null) window.clearTimeout(this.toastTimerId);
    this.statusToast.textContent = message;
    this.statusToast.classList.toggle('error', isError);
    this.statusToast.hidden = false;
    this.toastTimerId = window.setTimeout(() => {
      if (this.statusToast) this.statusToast.hidden = true;
      this.toastTimerId = null;
    }, 4500);
  }

  private initShareSupport(): void {
    if (!this.btnShare) return;
    const canWebShare =
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function';
    this.btnShare.hidden = !canWebShare;
  }

  private updateGpuBadge(): void {
    if (!this.gpuStatusBadge) return;
    const caps = webgl2Pipeline.getCapabilities();
    if (!caps.available) {
      this.gpuStatusBadge.textContent = 'CPU Modu';
      this.gpuStatusBadge.classList.remove('gpu-on', 'gpu-forced-cpu');
      this.gpuStatusBadge.setAttribute('aria-pressed', 'false');
      this.gpuStatusBadge.title = 'Bu cihazda WebGL2 kullanılamıyor';
      return;
    }

    if (this.preferGpu) {
      this.gpuStatusBadge.textContent = `WebGL2 Aktif (${caps.maxTextureSize}px)`;
      this.gpuStatusBadge.classList.add('gpu-on');
      this.gpuStatusBadge.classList.remove('gpu-forced-cpu');
      this.gpuStatusBadge.setAttribute('aria-pressed', 'true');
      this.gpuStatusBadge.title = 'Tıklayarak CPU moduna geçebilirsiniz';
    } else {
      this.gpuStatusBadge.textContent = 'CPU Modu (Zorunlu)';
      this.gpuStatusBadge.classList.remove('gpu-on');
      this.gpuStatusBadge.classList.add('gpu-forced-cpu');
      this.gpuStatusBadge.setAttribute('aria-pressed', 'false');
      this.gpuStatusBadge.title = 'Tıklayarak WebGL2 hızlandırmayı açabilirsiniz';
    }
  }

  private updateExportQualityState(): void {
    const format = (this.exportFormat?.value as ExportMimeType | undefined) ?? 'image/png';
    const isLossy = format !== 'image/png';
    if (this.exportQuality) {
      this.exportQuality.disabled = !isLossy;
    }
    if (this.exportQualityWrap) {
      this.exportQualityWrap.classList.toggle('disabled', !isLossy);
    }
    if (this.exportQualityVal && this.exportQuality) {
      this.exportQualityVal.textContent = isLossy ? `%${this.exportQuality.value}` : 'Kayıpsız';
    }
  }

  private updateCompareVisuals(): void {
    const active = this.compareEnabled && Boolean(this.previewSourceCanvas);
    if (this.canvasStage) {
      this.canvasStage.style.setProperty('--split-pct', `${this.compareSplitPct}%`);
    }
    if (this.btnCompareToggle) {
      this.btnCompareToggle.classList.toggle('active', active);
      this.btnCompareToggle.setAttribute('aria-pressed', String(active));
    }
    if (this.compareCanvas) {
      this.compareCanvas.hidden = !active;
    }
    if (this.compareDivider) {
      this.compareDivider.hidden = !active;
    }
    if (this.compareRange) {
      this.compareRange.hidden = !active;
      this.compareRange.value = String(this.compareSplitPct);
    }
    if (this.comparePercentLabel) {
      this.comparePercentLabel.hidden = !active;
      this.comparePercentLabel.textContent = `%${Math.round(this.compareSplitPct)}`;
    }
  }

  private syncCompareCanvas(): void {
    if (
      !this.compareEnabled ||
      !this.previewSourceCanvas ||
      !this.mainCanvas ||
      !this.compareCanvas ||
      !this.compareCtx
    ) {
      return;
    }
    const w = this.mainCanvas.width;
    const h = this.mainCanvas.height;
    if (w <= 0 || h <= 0) return;

    if (this.compareCanvas.width !== w || this.compareCanvas.height !== h) {
      this.compareCanvas.width = w;
      this.compareCanvas.height = h;
    }
    const sw = this.previewSourceCanvas.width;
    const sh = this.previewSourceCanvas.height;
    this.compareCtx.clearRect(0, 0, w, h);
    if (w > sw && h > sh) {
      const dx = Math.round((w - sw) / 2);
      const dy = Math.round((h - sh) / 2);
      this.compareCtx.drawImage(this.previewSourceCanvas, dx, dy, sw, sh);
    } else {
      this.compareCtx.drawImage(this.previewSourceCanvas, 0, 0, w, h);
    }
  }

  private updateSplitFromPointer(clientX: number): void {
    if (!this.canvasStage) return;
    const rect = this.canvasStage.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
    this.compareSplitPct = Math.round(pct);
    this.updateCompareVisuals();
  }

  private initEventListeners(): void {
    this.gpuStatusBadge?.addEventListener('click', () => {
      if (!webgl2Pipeline.getCapabilities().available) return;
      this.preferGpu = !this.preferGpu;
      this.updateGpuBadge();
      this.render();
    });

    this.btnUpload?.addEventListener('click', () => {
      void this.motion.init();
      this.fileInput?.click();
    });

    if (this.dropZone) {
      this.dropZone.addEventListener('click', () => {
        if (!this.previewSourceCanvas) {
          void this.motion.init();
          this.fileInput?.click();
        }
      });
      this.dropZone.addEventListener('keydown', (e) => {
        if (!this.previewSourceCanvas && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          void this.motion.init();
          this.fileInput?.click();
        }
      });
      this.dropZone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        this.dragDepth++;
        this.dropZone?.classList.add('drag-over');
      });
      this.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        this.dropZone?.classList.add('drag-over');
      });
      this.dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        this.dragDepth = Math.max(0, this.dragDepth - 1);
        if (this.dragDepth === 0) {
          this.dropZone?.classList.remove('drag-over');
        }
      });
      this.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        this.dragDepth = 0;
        this.dropZone?.classList.remove('drag-over');
        const file = e.dataTransfer?.files[0];
        if (file) void this.handleFile(file);
      });
    }

    this.fileInput?.addEventListener('change', () => {
      const file = this.fileInput?.files?.[0];
      if (this.fileInput) this.fileInput.value = '';
      if (file) void this.handleFile(file);
    });

    this.engineBar?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest('.engine-btn') as HTMLElement | null;
      if (!btn) return;

      const engineAttr = btn.dataset.engine as EngineId | undefined;
      if (!engineAttr || !(engineAttr in this.engines)) return;

      this.engineBar?.querySelectorAll('.engine-btn').forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');

      this.activeEngine = engineAttr;
      this.renderUIControls();
      this.render();
    });

    this.btnCompareToggle?.addEventListener('click', () => {
      if (!this.previewSourceCanvas) return;
      this.compareEnabled = !this.compareEnabled;
      this.syncCompareCanvas();
      this.updateCompareVisuals();
    });

    this.compareRange?.addEventListener('input', () => {
      if (!this.compareRange) return;
      this.compareSplitPct = clamp(Number(this.compareRange.value), 0, 100);
      this.updateCompareVisuals();
    });

    this.canvasStage?.addEventListener('pointerdown', (e) => {
      if (!this.compareEnabled || !this.previewSourceCanvas) return;
      this.isDraggingCompare = true;
      this.canvasStage?.setPointerCapture?.(e.pointerId);
      this.updateSplitFromPointer(e.clientX);
    });
    this.canvasStage?.addEventListener('pointermove', (e) => {
      if (!this.isDraggingCompare) return;
      this.updateSplitFromPointer(e.clientX);
    });
    const stopDrag = () => {
      this.isDraggingCompare = false;
    };
    this.canvasStage?.addEventListener('pointerup', stopDrag);
    this.canvasStage?.addEventListener('pointercancel', stopDrag);

    this.exportFormat?.addEventListener('change', () => this.updateExportQualityState());
    this.exportQuality?.addEventListener('input', () => this.updateExportQualityState());

    this.btnDownload?.addEventListener('click', () => this.exportHighResResult('download'));
    this.btnShare?.addEventListener('click', () => this.exportHighResResult('share'));
  }

  private handleShake(): void {
    if (this.activeEngine !== 'glitch') return;
    if (this.shakeTimerId !== null) window.clearTimeout(this.shakeTimerId);

    if (this.shakeBaseIntensity === null) {
      this.shakeBaseIntensity = this.params.glitch.intensity;
    }
    this.params.glitch.intensity = Math.min(100, this.shakeBaseIntensity + 30);

    const input = document.getElementById('input-intensity') as HTMLInputElement | null;
    const label = document.getElementById('val-intensity');
    if (input) input.value = String(this.params.glitch.intensity);
    if (label) label.textContent = `${this.params.glitch.intensity}%`;

    this.render();

    this.shakeTimerId = window.setTimeout(() => {
      const restored = this.shakeBaseIntensity ?? this.params.glitch.intensity;
      this.shakeBaseIntensity = null;
      this.shakeTimerId = null;
      this.params.glitch.intensity = restored;

      if (this.activeEngine === 'glitch') {
        const curInput = document.getElementById('input-intensity') as HTMLInputElement | null;
        const curLabel = document.getElementById('val-intensity');
        if (curInput) curInput.value = String(restored);
        if (curLabel) curLabel.textContent = `${restored}%`;
        this.render();
      }
    }, 1000);
  }

  private handleTilt(tilt: TiltState): void {
    if (this.activeEngine === 'glitch' && this.params.glitch.gyroEffect) {
      this.currentTilt = tilt;
      this.render();
    }
  }

  async handleFile(file: File): Promise<void> {
    try {
      if (this.btnUpload) {
        this.btnUpload.textContent = '⏳ Yükleniyor...';
        this.btnUpload.disabled = true;
      }

      const res = await ImageLoader.loadFromFile(file, 1200, () => {
        this.activeRenderController?.abort();
        ++this.renderSequence;
        this.queuedPreviewRender = false;
        this.fullSourceCanvas = null;
        this.previewSourceCanvas = null;
        canvasPool.releaseAll();
      });
      this.fullSourceCanvas = res.fullCanvas;
      this.previewSourceCanvas = res.previewCanvas;

      if (this.btnUpload) {
        this.btnUpload.textContent = '📁 Fotoğraf Seç';
        this.btnUpload.disabled = false;
      }
      if (this.placeholder) this.placeholder.style.display = 'none';
      if (this.dropZone) {
        this.dropZone.removeAttribute('role');
        this.dropZone.removeAttribute('tabindex');
      }
      if (this.viewportTools) this.viewportTools.hidden = false;
      if (this.exportOptionsCard) this.exportOptionsCard.hidden = false;
      if (this.btnDownload) this.btnDownload.disabled = false;
      if (this.btnShare) this.btnShare.disabled = false;

      this.updateCompareVisuals();
      void this.motion.init();

      this.renderUIControls();
      this.render();
    } catch (err) {
      if (this.btnUpload) {
        this.btnUpload.textContent = '📁 Fotoğraf Seç';
        this.btnUpload.disabled = false;
      }
      const message = err instanceof Error ? err.message : 'Görsel yüklenirken bir hata oluştu.';
      this.showStatus(message, true);
    }
  }

  private async executeEngineAsync<K extends EngineId>(
    key: K,
    targetSourceCanvas: HTMLCanvasElement,
    signal?: AbortSignal,
    options?: {
      params?: EngineParamsMap[K];
      textOverlay?: TextOverlayParams;
      tilt?: TiltState;
      preferGpu?: boolean;
    }
  ): Promise<HTMLCanvasElement> {
    const engine = this.engines[key];
    const params = options?.params ?? this.params[key];
    const textOverlayParams = options?.textOverlay ?? this.textOverlayParams;
    const maxDim = Math.max(targetSourceCanvas.width, targetSourceCanvas.height);

    const context: RenderContext = {
      referenceScale: maxDim / 1200,
      tilt: options?.tilt ?? this.currentTilt,
      preferGpu: options?.preferGpu ?? this.preferGpu,
    };

    const resultCanvas = engine.renderAsync
      ? await engine.renderAsync(targetSourceCanvas, params, context, signal)
      : engine.render(targetSourceCanvas, params, context);

    if (signal?.aborted) {
      const err = new Error('Render cancelled');
      err.name = 'AbortError';
      throw err;
    }

    if (resultCanvas !== targetSourceCanvas) {
      if (textOverlayParams.comicFrame) {
        this.textOverlay.renderComicFrame(resultCanvas);
      }
      if (textOverlayParams.enabled && textOverlayParams.text) {
        this.textOverlay.renderOnomatopoeia(resultCanvas, textOverlayParams.text, {
          color: textOverlayParams.color,
          scale: textOverlayParams.scale,
        });
      }
    }

    return resultCanvas;
  }

  render(): void {
    if (!this.previewSourceCanvas) return;
    if (this.isExporting) {
      this.queuedPreviewRender = true;
      return;
    }
    if (!this.renderPending) {
      this.renderPending = true;
      requestAnimationFrame(() => {
        this.renderPending = false;
        this.doRender();
      });
    }
  }

  private doRender(): void {
    if (!this.previewSourceCanvas || !this.mainCanvas || !this.ctx || this.isExporting) return;

    if (this.isRenderingPreview) {
      this.queuedPreviewRender = true;
      this.activeRenderController?.abort();
      return;
    }

    this.activeRenderController?.abort();
    const controller = new AbortController();
    this.activeRenderController = controller;
    const seq = ++this.renderSequence;

    this.isRenderingPreview = true;
    const renderPromise = this.runPreviewRender(
      this.activeEngine,
      this.previewSourceCanvas,
      seq,
      controller.signal
    );
    this.activePreviewPromise = renderPromise;
    void renderPromise;
  }

  private async runPreviewRender(
    engineId: EngineId,
    sourceCanvas: HTMLCanvasElement,
    seq: number,
    signal: AbortSignal
  ): Promise<void> {
    if (!this.mainCanvas || !this.ctx) {
      this.isRenderingPreview = false;
      return;
    }
    try {
      const resultCanvas = await this.executeEngineAsync(engineId, sourceCanvas, signal);
      if (signal.aborted || seq !== this.renderSequence) return;
      this.mainCanvas.width = resultCanvas.width;
      this.mainCanvas.height = resultCanvas.height;
      this.ctx.drawImage(resultCanvas, 0, 0);
      this.syncCompareCanvas();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('Render hatası:', err);
      this.showStatus('Önizleme oluşturulurken bir hata oluştu.', true);
    } finally {
      this.isRenderingPreview = false;
      this.activePreviewPromise = null;
      if (this.queuedPreviewRender && !this.isExporting && this.previewSourceCanvas) {
        this.queuedPreviewRender = false;
        this.doRender();
      }
    }
  }

  private resolveExportSource(fullSource: HTMLCanvasElement): HTMLCanvasElement {
    const maxDimLimit = Number(this.exportMaxDim?.value ?? 0);
    if (!maxDimLimit || maxDimLimit <= 0) return fullSource;

    const fw = fullSource.width;
    const fh = fullSource.height;
    const currentMax = Math.max(fw, fh);
    if (currentMax <= maxDimLimit) return fullSource;

    const scale = maxDimLimit / currentMax;
    const tw = Math.max(1, Math.round(fw * scale));
    const th = Math.max(1, Math.round(fh * scale));
    const scaledCanvas = canvasPool.getCanvas('export_scaled_src', tw, th);
    const sCtx = canvasPool.getContext2D(scaledCanvas);
    sCtx.imageSmoothingEnabled = true;
    sCtx.imageSmoothingQuality = 'high';
    sCtx.drawImage(fullSource, 0, 0, tw, th);
    return scaledCanvas;
  }

  private canvasToBlobAsync(
    canvas: HTMLCanvasElement,
    mimeType: ExportMimeType,
    quality: number
  ): Promise<Blob | null> {
    let targetCanvas = canvas;
    if (mimeType === 'image/jpeg') {
      const opaque = canvasPool.getCanvas('export_jpeg_opaque', canvas.width, canvas.height);
      const oCtx = canvasPool.getContext2D(opaque);
      oCtx.fillStyle = '#0b0f17';
      oCtx.fillRect(0, 0, canvas.width, canvas.height);
      oCtx.drawImage(canvas, 0, 0);
      targetCanvas = opaque;
    }

    return new Promise((resolve) => {
      targetCanvas.toBlob(
        (blob) => {
          if (blob || mimeType === 'image/png') {
            resolve(blob);
            return;
          }
          // WEBP desteklemeyen tarayıcılar için PNG fallback
          targetCanvas.toBlob((fallbackBlob) => resolve(fallbackBlob), 'image/png', 1.0);
        },
        mimeType,
        mimeType === 'image/png' ? 1.0 : quality
      );
    });
  }

  private exportHighResResult(mode: 'download' | 'share'): void {
    if (this.isExporting || !this.fullSourceCanvas || !this.btnDownload) return;
    this.isExporting = true;

    const fullSource = this.fullSourceCanvas;
    const engineId = this.activeEngine;
    const paramsSnapshot = structuredClone(this.params[engineId]);
    const overlaySnapshot = structuredClone(this.textOverlayParams);
    const tiltSnapshot = { ...this.currentTilt };
    const preferGpuSnapshot = this.preferGpu;

    const activeBtn = mode === 'share' && this.btnShare ? this.btnShare : this.btnDownload;
    const oldDownloadText = this.btnDownload.textContent ?? '💾 Dışa Aktar';
    const oldShareText = this.btnShare?.textContent ?? '📤 Paylaş';

    this.btnDownload.disabled = true;
    if (this.btnShare) this.btnShare.disabled = true;
    activeBtn.textContent = '⚙️ İşleniyor...';

    const mimeType = (this.exportFormat?.value as ExportMimeType | undefined) ?? 'image/png';
    const quality = clamp(Number(this.exportQuality?.value ?? 92) / 100, 0.5, 1.0);

    window.setTimeout(() => {
      void (async () => {
        try {
          this.activeRenderController?.abort();
          ++this.renderSequence;
          this.queuedPreviewRender = false;
          if (this.activePreviewPromise) {
            await this.activePreviewPromise.catch(() => undefined);
          }

          const exportSrc = this.resolveExportSource(fullSource);
          const highResCanvas = await this.executeEngineAsync(engineId, exportSrc, undefined, {
            params: paramsSnapshot,
            textOverlay: overlaySnapshot,
            tilt: tiltSnapshot,
            preferGpu: preferGpuSnapshot,
          });
          const blob = await this.canvasToBlobAsync(highResCanvas, mimeType, quality);

          if (!blob) {
            this.showStatus('Görsel oluşturulamadı, bellek yetersiz olabilir.', true);
            return;
          }

          const finalMime = (blob.type as ExportMimeType) || mimeType;
          const ext = EXPORT_EXTENSION[finalMime] ?? 'png';
          const fileName = `anomalies_${engineId}_${highResCanvas.width}x${highResCanvas.height}_${Date.now()}.${ext}`;

          if (mode === 'share' && typeof navigator.share === 'function') {
            const file = new File([blob], fileName, { type: finalMime });
            if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: 'Anomalies // Retro Media Lab',
              });
              return;
            }
          }

          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = fileName;
          link.href = blobUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
          this.showStatus(`Kaydedildi (${highResCanvas.width}×${highResCanvas.height})`);
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') return;
          const message = err instanceof Error ? err.message : String(err);
          this.showStatus(`Dışa aktarma sırasında hata oluştu: ${message}`, true);
        } finally {
          // Yüksek çözünürlüklü geçici canvas'ları bellekten temizle (mobil Safari koruması)
          canvasPool.releaseExcept(['loader_full', 'loader_preview']);
          this.isExporting = false;
          if (this.btnDownload) {
            this.btnDownload.textContent = oldDownloadText;
            this.btnDownload.disabled = false;
          }
          if (this.btnShare) {
            this.btnShare.textContent = oldShareText;
            this.btnShare.disabled = false;
          }
          if (this.queuedPreviewRender && this.previewSourceCanvas) {
            this.queuedPreviewRender = false;
            this.render();
          }
        }
      })();
    }, 30);
  }

  private renderUIControls(): void {
    if (!this.paramsContainer) return;

    if (!this.previewSourceCanvas) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'İşlem yapmak için bir fotoğraf yükleyin.';
      this.paramsContainer.replaceChildren(empty);
      return;
    }

    const activeParams = this.params[this.activeEngine] as unknown as Record<string, unknown>;
    renderParamControls(
      this.paramsContainer,
      this.activeEngine,
      activeParams,
      this.textOverlayParams,
      {
        onParamChange: () => {
          if (this.activeEngine === 'glitch') {
            if (this.shakeTimerId !== null) {
              window.clearTimeout(this.shakeTimerId);
              this.shakeTimerId = null;
              this.shakeBaseIntensity = null;
            }
            if (this.params.glitch.gyroEffect) {
              void this.motion.init();
            }
          }
          this.render();
        },
        onAction: (actionId) => {
          if (actionId === 'reroll-seed' && this.activeEngine === 'sensorcorrupt') {
            this.params.sensorcorrupt.seed = Math.floor(Math.random() * 999999);
            this.render();
          }
        },
      }
    );
  }
}
