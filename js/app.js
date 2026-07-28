/**
 * @file app.js
 * @description Anomalies Retro & Glitch Medya Laboratuvarı Çift Çözünürlük Orkestratörü.
 */

import { ImageLoader } from './core/ImageLoader.js';

// Motorlar
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
            vangogh: new VanGoghEngine()
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
            vangogh: { mode: 2, stepSize: 12, brushMinLength: 10, brushMaxLength: 30, impasto: true }
        };

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
            default:
                return targetSourceCanvas;
        }
    }

    render() {
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

    // İşlemi ana UI thread'i kilitlemeden başlatıyoruz
    setTimeout(() => {
        try {
            const highResCanvas = this._executeEngine(this.fullSourceCanvas, this.scaleRatio);

            // iOS Safari için toDataURL yerine toBlob kullanımı şarttır (RAM çökmesini engeller)
            highResCanvas.toBlob((blob) => {
                if (!blob) {
                    alert('Görsel oluşturulamadı, bellek yetersiz olabilir.');
                    this.btnDownload.textContent = oldText;
                    this.btnDownload.disabled = false;
                    return;
                }

                // Bellekte geçici bir Blob URL oluşturuyoruz
                const blobUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = `anomalies_${this.activeEngine}_${highResCanvas.width}x${highResCanvas.height}_${Date.now()}.png`;
                link.href = blobUrl;

                // iOS Safari'nin indirmeyi tanıması için elementi DOM'a ekliyoruz
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                // İşlem bitince geçici belleği serbest bırakıyoruz
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
        }

        this.paramsContainer.innerHTML = html;
        this.bindDynamicParamEvents();
    }

    bindDynamicParamEvents() {
        const engine = this.activeEngine;

        this.paramsContainer.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('input', (e) => {
                const key = e.target.id.replace('input-', '');
                let value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;

                if (e.target.type === 'range') value = parseFloat(value);

                if (key === 'charSetKey') {
                    const customWrapper = document.getElementById('custom-text-wrapper');
                    if (customWrapper) {
                        customWrapper.style.display = value === 'custom' ? 'block' : 'none';
                    }
                }

                this.params[engine][key] = value;

                const valLabel = document.getElementById(`val-${key}`);
                if (valLabel) {
                    let suffix = '';
                    if (key === 'contrastBoost') suffix = 'x';
                    else if (['wear', 'tonerNoise', 'intensity'].includes(key)) suffix = '%';
                    else if (typeof value === 'number') suffix = 'px';

                    valLabel.textContent = `${value}${suffix}`;
                }

                this.render();
            });
        });
    }
}

window.addEventListener('DOMContentLoaded', () => new AnomaliesApp());