/**
 * @file app.js (Tam & Optimize)
 * @description Anomalies Retro & Glitch Medya Laboratuvarı
 * Çift çözünürlük, throttle edilmiş render, bellek dostu havuz.
 */

import { ImageLoader } from './core/ImageLoader.js';
import { canvasPool } from './core/CanvasPool.js';

import { PostcardEngine } from './engines/PostcardEngine.js';
import { PixelArtEngine } from './engines/PixelArtEngine.js';
import { ThermalPaperEngine } from './engines/ThermalPaperEngine.js';
import { AsciiMatrixEngine } from './engines/AsciiMatrixEngine.js';
import { CrtTvEngine } from './engines/CrtTvEngine.js';
import { FlirThermalEngine } from './engines/FlirThermalEngine.js';
import { CmykOffsetEngine } from './engines/CmykOffsetEngine.js';
import { PunkFanzineEngine } from './engines/PunkFanzineEngine.js';
import { ColorClashEngine } from './engines/ColorClashEngine.js';
import { GlitchEngine } from './engines/GlitchEngine.js';
import { TextGlitchEngine } from './engines/TextGlitchEngine.js';
import { VanGoghEngine } from './engines/VanGoghEngine.js';
import { MinecraftEngine } from './engines/MinecraftEngine.js';
import { SensorCorruptEngine } from './engines/SensorCorruptEngine.js';

class AnomaliesApp {
    constructor() {
        this.mainCanvas = document.getElementById('mainCanvas');
        this.ctx = this.mainCanvas.getContext('2d');
        this.dropZone = document.getElementById('drop-zone');
        this.fileInput = document.getElementById('fileInput');
        this.placeholder = document.getElementById('placeholder');
        this.paramsContainer = document.getElementById('paramsContainer');
        this.engineBar = document.getElementById('engineBar');
        this.btnUpload = document.getElementById('btnUpload');
        this.btnDownload = document.getElementById('btnDownload');

        this.engines = {
            pixelart: new PixelArtEngine(),
            thermalpaper: new ThermalPaperEngine(),
            ascii: new AsciiMatrixEngine(),
            crttv: new CrtTvEngine(),
            flir: new FlirThermalEngine(),
            cmyk: new CmykOffsetEngine(),
            fanzine: new PunkFanzineEngine(),
            colorclash: new ColorClashEngine(),
            glitch: new GlitchEngine(),
            textglitch: new TextGlitchEngine(),
            vangogh: new VanGoghEngine(),
            minecraft: new MinecraftEngine(),
            sensorcorrupt: new SensorCorruptEngine(),
            postcard: new PostcardEngine()
        };

        this.fullSourceCanvas = null;
        this.previewSourceCanvas = null;
        this.scaleRatio = 1.0;

        this.activeEngine = 'pixelart';
        this.params = {
            pixelart: { pixelSize: 128, paletteKey: 'gameboy' },
            thermalpaper: { paperType: 'aged', wear: 30, tornEdge: true },
            ascii: { charSetKey: 'density', colorMode: 'matrix', fontSize: 10, customText: 'ANOMALIES' },
            crttv: { scanlineGap: 3, phosphorGlow: true },
            flir: { mode: 'ironbow' },
            cmyk: { offsetPx: 5, dotSize: 8 },
            fanzine: { contrastBoost: 2.5, tonerNoise: 40 },
            colorclash: { blockSize: 8 },
            glitch: { intensity: 40 },
            textglitch: { text: 'SYSTEM ERROR', style: 'rgb_shift', fontSize: 42 },
            vangogh: { mode: 2, stepSize: 12, brushMinLength: 10, brushMaxLength: 30, impasto: true },
            minecraft: { mode: 1, blockSize: 24, paletteKey: 'classic' },
            postcard: { mode: 'halftone_paper', stampMargin: 28, engraveDensity: 6 },
            sensorcorrupt: { mode: 'chaos', noiseIntensity: 55, chaosLevel: 80, lineJitter: true, bitShift: true, seed: 424242 }
        };

        this.renderPending = false;
        this.initEventListeners();
    }

    initEventListeners() {
        this.btnUpload.addEventListener('click', () => this.fileInput.click());
        this.dropZone.addEventListener('click', () => {
            if (!this.previewSourceCanvas) this.fileInput.click();
        });

        this.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) this.handleFile(e.target.files[0]);
        });

        this.dropZone.addEventListener('dragover', (e) => e.preventDefault());
        this.dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length > 0) this.handleFile(e.dataTransfer.files[0]);
        });

        this.engineBar.addEventListener('click', (e) => {
            const btn = e.target.closest('.engine-btn');
            if (!btn) return;

            document.querySelectorAll('.engine-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            this.activeEngine = btn.getAttribute('data-engine');
            this.renderUIControls();
            this.render();
        });

        this.btnDownload.addEventListener('click', () => this.downloadHighResResult());
    }

    async handleFile(file) {
        try {
            this.btnUpload.textContent = '⏳ Yükleniyor...';
            this.btnUpload.disabled = true;

            canvasPool.releaseAll();
            this.fullSourceCanvas = null;
            this.previewSourceCanvas = null;

            const res = await ImageLoader.loadFromFile(file, 1200);

            this.fullSourceCanvas = res.fullCanvas;
            this.previewSourceCanvas = res.previewCanvas;
            this.scaleRatio = res.ratio;

            this.btnUpload.textContent = '📁 Fotoğraf Seç';
            this.btnUpload.disabled = false;
            this.placeholder.style.display = 'none';
            this.btnDownload.disabled = false;

            this.renderUIControls();
            this.render();
        } catch (err) {
            this.btnUpload.textContent = '📁 Fotoğraf Seç';
            this.btnUpload.disabled = false;
            alert(err.message || 'Görsel yüklenirken bir hata oluştu.');
        }
    }

    _executeEngine(targetSourceCanvas, scaleFactor = 1.0) {
        const key = this.activeEngine;
        const engineObj = this.engines[key];
        const p = this.params[key];

        switch (key) {
            case 'pixelart':
                return engineObj.render(targetSourceCanvas, Math.round(p.pixelSize * scaleFactor), p.paletteKey);
            case 'thermalpaper':
                return engineObj.render(targetSourceCanvas, p.paperType, p.wear, p.tornEdge);
            case 'ascii': {
                const activeCharSet = p.charSetKey === 'custom' ? (p.customText || 'ANOMALIES') : p.charSetKey;
                return engineObj.render(targetSourceCanvas, activeCharSet, p.colorMode, Math.round(p.fontSize * scaleFactor));
            }
            case 'crttv':
                return engineObj.render(targetSourceCanvas, Math.round(p.scanlineGap * scaleFactor), p.phosphorGlow);
            case 'flir':
                return engineObj.render(targetSourceCanvas, p.mode);
            case 'cmyk':
                return engineObj.render(targetSourceCanvas, Math.round(p.offsetPx * scaleFactor), Math.round(p.dotSize * scaleFactor));
            case 'fanzine':
                return engineObj.render(targetSourceCanvas, p.contrastBoost, p.tonerNoise);
            case 'colorclash':
                return engineObj.render(targetSourceCanvas, Math.round(p.blockSize * scaleFactor));
            case 'glitch':
                return engineObj.render(targetSourceCanvas, p.intensity);
            case 'textglitch':
                return engineObj.render(targetSourceCanvas, p.text, p.style, Math.round(p.fontSize * scaleFactor));
            case 'vangogh':
                return engineObj.render(
                    targetSourceCanvas,
                    parseInt(p.mode, 10),
                    Math.round(p.stepSize * scaleFactor),
                    Math.round(p.brushMinLength * scaleFactor),
                    Math.round(p.brushMaxLength * scaleFactor),
                    p.impasto
                );
            case 'minecraft':
                return engineObj.render(
                    targetSourceCanvas,
                    parseInt(p.mode, 10),
                    p.blockSize,
                    p.paletteKey
                );
            case 'postcard':
                return engineObj.render(
                    targetSourceCanvas,
                    p.mode,
                    p.stampMargin,
                    p.engraveDensity,
                    scaleFactor
                );
            case 'sensorcorrupt': {
                const tempCanvas = canvasPool.getCanvas('sensor_temp', targetSourceCanvas.width, targetSourceCanvas.height);
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(targetSourceCanvas, 0, 0);

                engineObj.process(
                    tempCtx,
                    tempCanvas.width,
                    tempCanvas.height,
                    {
                        mode: p.mode,
                        noiseIntensity: p.noiseIntensity / 100,
                        chaosLevel: p.chaosLevel / 100,
                        lineJitter: p.lineJitter,
                        bitShift: p.bitShift,
                        seed: p.seed
                    },
                    scaleFactor
                );
                return tempCanvas;
            }
            default:
                return targetSourceCanvas;
        }
    }

    render() {
        if (!this.previewSourceCanvas) return;
        if (!this.renderPending) {
            this.renderPending = true;
            requestAnimationFrame(() => {
                this._doRender();
                this.renderPending = false;
            });
        }
    }

    _doRender() {
        if (!this.previewSourceCanvas) return;
        const resultCanvas = this._executeEngine(this.previewSourceCanvas, 1.0);
        if (resultCanvas) {
            this.mainCanvas.width = resultCanvas.width;
            this.mainCanvas.height = resultCanvas.height;
            this.ctx.drawImage(resultCanvas, 0, 0);
        }
    }

    downloadHighResResult() {
        if (!this.fullSourceCanvas) return;
        const oldText = this.btnDownload.textContent;
        this.btnDownload.textContent = '⚙️ Yüksek Kalitede İşleniyor...';
        this.btnDownload.disabled = true;

        setTimeout(() => {
            try {
                const highResCanvas = this._executeEngine(this.fullSourceCanvas, this.scaleRatio);
                highResCanvas.toBlob((blob) => {
                    if (!blob) {
                        alert('Görsel oluşturulamadı, bellek yetersiz olabilir.');
                        this.btnDownload.textContent = oldText;
                        this.btnDownload.disabled = false;
                        return;
                    }
                    const blobUrl = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.download = `anomalies_${this.activeEngine}_${highResCanvas.width}x${highResCanvas.height}_${Date.now()}.png`;
                    link.href = blobUrl;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
                    this.btnDownload.textContent = oldText;
                    this.btnDownload.disabled = false;
                }, 'image/png', 1.0);
            } catch (err) {
                alert('İndirme sırasında hata oluştu: ' + err.message);
                this.btnDownload.textContent = oldText;
                this.btnDownload.disabled = false;
            }
        }, 50);
    }

    renderUIControls() {
        if (!this.previewSourceCanvas) {
            this.paramsContainer.innerHTML = '<p class="empty-state">İşlem yapmak için bir fotoğraf yükleyin.</p>';
            return;
        }

        const engine = this.activeEngine;
        const p = this.params[engine];
        let html = '';

        if (engine === 'pixelart') {
            html = `
                <div class="param-group">
                    <label>Çözünürlük / Piksel Boyutu: <b id="val-pixelSize">${p.pixelSize}px</b></label>
                    <input type="range" id="input-pixelSize" min="32" max="256" value="${p.pixelSize}">
                </div>
                <div class="param-group" style="margin-top: 12px;">
                    <label>Nostaljik Renk Paleti</label>
                    <select id="input-paletteKey">
                        <option value="gameboy" ${p.paletteKey === 'gameboy' ? 'selected' : ''}>Game Boy Classic (4 Ton Yeşil)</option>
                        <option value="gb-pocket" ${p.paletteKey === 'gb-pocket' ? 'selected' : ''}>Game Boy Pocket (Gri)</option>
                        <option value="cga" ${p.paletteKey === 'cga' ? 'selected' : ''}>CGA Mode 1 (Retro PC)</option>
                        <option value="c64" ${p.paletteKey === 'c64' ? 'selected' : ''}>Commodore 64 (16 Renk)</option>
                        <option value="cyberpunk" ${p.paletteKey === 'cyberpunk' ? 'selected' : ''}>Cyberpunk Neon</option>
                        <option value="vaporwave" ${p.paletteKey === 'vaporwave' ? 'selected' : ''}>Vaporwave Sunset</option>
                    </select>
                </div>
            `;
        } else if (engine === 'thermalpaper') {
            html = `
                <div class="param-group">
                    <label>Kağıt Tipi</label>
                    <select id="input-paperType">
                        <option value="aged" ${p.paperType === 'aged' ? 'selected' : ''}>Sararmış Kafein Fişi</option>
                        <option value="fresh" ${p.paperType === 'fresh' ? 'selected' : ''}>Taze Beyaz Termal Kağıt</option>
                    </select>
                </div>
                <div class="param-group" style="margin-top: 12px;">
                    <label>Yazıcı Aşınması & Çizgiler: <b id="val-wear">${p.wear}%</b></label>
                    <input type="range" id="input-wear" min="0" max="100" value="${p.wear}">
                </div>
                <div class="param-group" style="margin-top: 12px; display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="input-tornEdge" ${p.tornEdge ? 'checked' : ''}>
                    <label for="input-tornEdge">Tırtıklı Yırtık Kenarlar</label>
                </div>
            `;
        } else if (engine === 'ascii') {
            html = `
                <div class="param-group">
                    <label>Karakter Seti / Metin</label>
                    <select id="input-charSetKey">
                        <option value="density" ${p.charSetKey === 'density' ? 'selected' : ''}>Standart Yoğunluk (. :-=+*#%@)</option>
                        <option value="binary" ${p.charSetKey === 'binary' ? 'selected' : ''}>Binary (01)</option>
                        <option value="hex" ${p.charSetKey === 'hex' ? 'selected' : ''}>Hexadecimal (0-9 A-F)</option>
                        <option value="custom" ${p.charSetKey === 'custom' ? 'selected' : ''}>Özel Metin Modu</option>
                    </select>
                </div>
                <div id="custom-text-wrapper" class="param-group" style="margin-top: 8px; display: ${p.charSetKey === 'custom' ? 'block' : 'none'};">
                    <input type="text" id="input-customText" placeholder="Kelime veya dize girin..." value="${p.customText || 'ANOMALIES'}">
                </div>
                <div class="param-group" style="margin-top: 12px;">
                    <label>Renk Modu</label>
                    <select id="input-colorMode">
                        <option value="matrix" ${p.colorMode === 'matrix' ? 'selected' : ''}>Matrix Yeşili</option>
                        <option value="amber" ${p.colorMode === 'amber' ? 'selected' : ''}>Amber Monitör (Turuncu)</option>
                        <option value="fullcolor" ${p.colorMode === 'fullcolor' ? 'selected' : ''}>Orijinal Renkli ASCII</option>
                    </select>
                </div>
                <div class="param-group" style="margin-top: 12px;">
                    <label>Font Büyüklüğü: <b id="val-fontSize">${p.fontSize}px</b></label>
                    <input type="range" id="input-fontSize" min="6" max="20" value="${p.fontSize}">
                </div>
            `;
        } else if (engine === 'crttv') {
            html = `
                <div class="param-group">
                    <label>Tarama Çizgisi Sıklığı (Scanlines): <b id="val-scanlineGap">${p.scanlineGap}px</b></label>
                    <input type="range" id="input-scanlineGap" min="2" max="6" value="${p.scanlineGap}">
                </div>
                <div class="param-group" style="margin-top: 12px; display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="input-phosphorGlow" ${p.phosphorGlow ? 'checked' : ''}>
                    <label for="input-phosphorGlow">Fosfor Işıması (Bloom Efekti)</label>
                </div>
            `;
        } else if (engine === 'flir') {
            html = `
                <div class="param-group">
                    <label>Sıcaklık Renk Tayfı (Gradient)</label>
                    <select id="input-mode">
                        <option value="ironbow" ${p.mode === 'ironbow' ? 'selected' : ''}>Ironbow (Klasik Askeri FLIR)</option>
                        <option value="rainbow" ${p.mode === 'rainbow' ? 'selected' : ''}>Rainbow (Yüksek Kontrast)</option>
                        <option value="emerald" ${p.mode === 'emerald' ? 'selected' : ''}>Emerald (Gece Görüşü)</option>
                    </select>
                </div>
            `;
        } else if (engine === 'cmyk') {
            html = `
                <div class="param-group">
                    <label>Matbaa Kanal Kayması: <b id="val-offsetPx">${p.offsetPx}px</b></label>
                    <input type="range" id="input-offsetPx" min="1" max="15" value="${p.offsetPx}">
                </div>
                <div class="param-group" style="margin-top: 12px;">
                    <label>Tram Nokta Boyutu: <b id="val-dotSize">${p.dotSize}px</b></label>
                    <input type="range" id="input-dotSize" min="4" max="16" value="${p.dotSize}">
                </div>
            `;
        } else if (engine === 'fanzine') {
            html = `
                <div class="param-group">
                    <label>Kontrast Sertliği: <b id="val-contrastBoost">${p.contrastBoost}x</b></label>
                    <input type="range" id="input-contrastBoost" min="1.0" max="4.0" step="0.1" value="${p.contrastBoost}">
                </div>
                <div class="param-group" style="margin-top: 12px;">
                    <label>Toner Kiri / Gürültü: <b id="val-tonerNoise">${p.tonerNoise}%</b></label>
                    <input type="range" id="input-tonerNoise" min="0" max="100" value="${p.tonerNoise}">
                </div>
            `;
        } else if (engine === 'colorclash') {
            html = `
                <div class="param-group">
                    <label>ZX Spectrum Izgara Boyutu: <b id="val-blockSize">${p.blockSize}px</b></label>
                    <input type="range" id="input-blockSize" min="4" max="24" step="2" value="${p.blockSize}">
                </div>
            `;
        } else if (engine === 'glitch') {
            html = `
                <div class="param-group">
                    <label>Datamosh / Glitch Yoğunluğu: <b id="val-intensity">${p.intensity}%</b></label>
                    <input type="range" id="input-intensity" min="5" max="100" value="${p.intensity}">
                </div>
            `;
        } else if (engine === 'textglitch') {
            html = `
                <div class="param-group">
                    <label>Tipografi Metni</label>
                    <input type="text" id="input-text" value="${p.text}" placeholder="Yazı yazın...">
                </div>
                <div class="param-group" style="margin-top: 12px;">
                    <label>Glitch & Damga Stili</label>
                    <select id="input-style">
                        <option value="rgb_shift" ${p.style === 'rgb_shift' ? 'selected' : ''}>RGB Chromatic Shift</option>
                        <option value="vhs" ${p.style === 'vhs' ? 'selected' : ''}>90'lar VHS Kaset Zaman Damgası</option>
                        <option value="stamp" ${p.style === 'stamp' ? 'selected' : ''}>Bozuk Fanzin Damgası</option>
                    </select>
                </div>
                <div class="param-group" style="margin-top: 12px;">
                    <label>Font Boyutu: <b id="val-fontSize">${p.fontSize}px</b></label>
                    <input type="range" id="input-fontSize" min="16" max="80" value="${p.fontSize}">
                </div>
            `;
        } else if (engine === 'vangogh') {
            html = `
                <div class="param-group">
                    <label>Fırça Akış Modu</label>
                    <select id="input-mode">
                        <option value="1" ${p.mode == 1 ? 'selected' : ''}>Mod 1: Paralel Hat Akışı</option>
                        <option value="2" ${p.mode == 2 ? 'selected' : ''}>Mod 2: Girdap & Odak Bağlantıları (Yıldızlı Gece)</option>
                        <option value="3" ${p.mode == 3 ? 'selected' : ''}>Mod 3: Merkez Dik / Kenarlar Radyal</option>
                    </select>
                </div>
                <div class="param-group" style="margin-top: 12px;">
                    <label>Fırça Yoğunluğu / Adım: <b id="val-stepSize">${p.stepSize}px</b></label>
                    <input type="range" id="input-stepSize" min="6" max="24" value="${p.stepSize}">
                </div>
                <div class="param-group" style="margin-top: 12px;">
                    <label>Min Fırça Boyu: <b id="val-brushMinLength">${p.brushMinLength}px</b></label>
                    <input type="range" id="input-brushMinLength" min="5" max="20" value="${p.brushMinLength}">
                </div>
                <div class="param-group" style="margin-top: 12px;">
                    <label>Max Fırça Boyu: <b id="val-brushMaxLength">${p.brushMaxLength}px</b></label>
                    <input type="range" id="input-brushMaxLength" min="15" max="50" value="${p.brushMaxLength}">
                </div>
                <div class="param-group" style="margin-top: 12px; display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="input-impasto" ${p.impasto ? 'checked' : ''}>
                    <label for="input-impasto">3D Boya Kabartma (Impasto Işığı)</label>
                </div>
            `;
        } else if (engine === 'minecraft') {
            html = `
                <div class="param-group">
                    <label>Render Modu</label>
                    <select id="input-mode">
                        <option value="1" ${p.mode == 1 ? 'selected' : ''}>Mod 1: 2D Düz Blok Haritası (Flat Map)</option>
                        <option value="2" ${p.mode == 2 ? 'selected' : ''}>Mod 2: 2.5D İzometrik Voxel Küpleri</option>
                    </select>
                </div>
                <div class="param-group" style="margin-top: 12px;">
                    <label>Blok Boyutu: <b id="val-blockSize">${p.blockSize}px</b></label>
                    <input type="range" id="input-blockSize" min="8" max="48" step="2" value="${p.blockSize}">
                </div>
                <div class="param-group" style="margin-top: 12px;">
                    <label>Blok Renk Paleti</label>
                    <select id="input-paletteKey">
                        <option value="classic" ${p.paletteKey === 'classic' ? 'selected' : ''}>Klasik Doğal Bloklar (Toprak, Çim, Taş)</option>
                        <option value="colorful" ${p.paletteKey === 'colorful' ? 'selected' : ''}>Renkli Yün & Cevherler (Pixel Wool)</option>
                    </select>
                </div>
            `;
        } else if (engine === 'sensorcorrupt') {
            html = `
                <div class="param-group">
                    <label>Arıza Modu</label>
                    <select id="input-mode">
                        <option value="chaos" ${p.mode === 'chaos' ? 'selected' : ''}>Mod 2: Kaos (Circuit Bend & Mutasyon)</option>
                        <option value="standard" ${p.mode === 'standard' ? 'selected' : ''}>Mod 1: Standart (RGB Gürültü)</option>
                    </select>
                </div>
                <div class="param-group" style="margin-top: 12px;">
                    <label>Gürültü Yoğunluğu: <b id="val-noiseIntensity">${p.noiseIntensity}%</b></label>
                    <input type="range" id="input-noiseIntensity" min="0" max="140" value="${p.noiseIntensity}">
                </div>
                <div id="wrapper-chaos" style="display: ${p.mode === 'chaos' ? 'block' : 'none'};">
                    <div class="param-group" style="margin-top: 12px;">
                        <label>Sinyal Yırtılma Şiddeti (Kaos): <b id="val-chaosLevel">${p.chaosLevel}%</b></label>
                        <input type="range" id="input-chaosLevel" min="10" max="100" value="${p.chaosLevel}">
                    </div>
                </div>
                <div id="wrapper-standard" style="display: ${p.mode === 'standard' ? 'block' : 'none'};">
                    <div class="param-group" style="margin-top: 12px; display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" id="input-lineJitter" ${p.lineJitter ? 'checked' : ''}>
                        <label for="input-lineJitter">Yatay Sinyal Kayması (Scanline Jitter)</label>
                    </div>
                    <div class="param-group" style="margin-top: 12px; display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" id="input-bitShift" ${p.bitShift ? 'checked' : ''}>
                        <label for="input-bitShift">Bit-Shift Taşması (Neon Patlama)</label>
                    </div>
                </div>
                <div class="param-group" style="margin-top: 16px;">
                    <button type="button" id="btn-reroll-seed" class="action-btn" style="width: 100%; padding: 8px; cursor: pointer;">
                        🎲 Farklı Yırtılma Varyasyonu Üret
                    </button>
                </div>
            `;
        } else if (engine === 'postcard') {
            html = `
                <div class="param-group">
                    <label>Kartpostal Doku Modu</label>
                    <select id="input-mode">
                        <option value="halftone_paper" ${p.mode === 'halftone_paper' ? 'selected' : ''}>Klasik Kartpostal (Renkleri Korur + Kağıt Dokusu)</option>
                        <option value="engraving" ${p.mode === 'engraving' ? 'selected' : ''}>Gravür / Pasaport & Banknot (Para Tarzı Çizgisel)</option>
                    </select>
                </div>
                <div class="param-group" style="margin-top: 12px;">
                    <label>Pul Kenar Boşluğu: <b id="val-stampMargin">${p.stampMargin}px</b></label>
                    <input type="range" id="input-stampMargin" min="12" max="60" value="${p.stampMargin}">
                </div>
                <div id="wrapper-engrave" style="margin-top: 12px; display: ${p.mode === 'engraving' ? 'block' : 'none'};">
                    <div class="param-group">
                        <label>Gravür Çizgi Detayı: <b id="val-engraveDensity">${p.engraveDensity}px</b></label>
                        <input type="range" id="input-engraveDensity" min="3" max="12" value="${p.engraveDensity}">
                    </div>
                </div>
            `;
        }

        this.paramsContainer.innerHTML = html;
        this.bindDynamicParamEvents();
    }

    bindDynamicParamEvents() {
        const engine = this.activeEngine;

        if (engine === 'sensorcorrupt') {
            const rerollBtn = document.getElementById('btn-reroll-seed');
            if (rerollBtn) {
                rerollBtn.addEventListener('click', () => {
                    this.params.sensorcorrupt.seed = Math.floor(Math.random() * 999999);
                    this.render();
                });
            }
        }

        this.paramsContainer.querySelectorAll('input, select').forEach(input => {
            const updateParam = (e) => {
                const key = e.target.id.replace('input-', '');
                let value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;

                if (e.target.type === 'range') value = parseFloat(value);
                if (key === 'mode' && !isNaN(value)) value = parseInt(value, 10);

                if (key === 'charSetKey') {
                    const customWrapper = document.getElementById('custom-text-wrapper');
                    if (customWrapper) {
                        customWrapper.style.display = value === 'custom' ? 'block' : 'none';
                    }
                }

                if (key === 'mode' && engine === 'sensorcorrupt') {
                    const wrapChaos = document.getElementById('wrapper-chaos');
                    const wrapStd = document.getElementById('wrapper-standard');
                    if (wrapChaos && wrapStd) {
                        wrapChaos.style.display = value === 'chaos' ? 'block' : 'none';
                        wrapStd.style.display = value === 'standard' ? 'block' : 'none';
                    }
                }

                if (key === 'mode' && engine === 'postcard') {
                    const wrapEngrave = document.getElementById('wrapper-engrave');
                    if (wrapEngrave) {
                        wrapEngrave.style.display = value === 'engraving' ? 'block' : 'none';
                    }
                }

                this.params[engine][key] = value;

                const valLabel = document.getElementById(`val-${key}`);
                if (valLabel) {
                    let suffix = '';
                    if (key === 'contrastBoost') suffix = 'x';
                    else if (['wear', 'tonerNoise', 'intensity', 'noiseIntensity', 'chaosLevel'].includes(key)) suffix = '%';
                    else if (typeof value === 'number') suffix = 'px';
                    valLabel.textContent = `${value}${suffix}`;
                }

                this.render();
            };

            input.addEventListener('input', updateParam);
            input.addEventListener('change', updateParam);
        });
    }
}

window.addEventListener('DOMContentLoaded', () => new AnomaliesApp());