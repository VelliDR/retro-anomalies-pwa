import type {
  EngineId,
  EngineMetadata,
  EngineParamsMap,
  IImageEngine,
  TextOverlayParams,
} from '../core/types.ts';
import { AsciiMatrixEngine } from '../engines/AsciiMatrixEngine.ts';
import { CmykOffsetEngine } from '../engines/CmykOffsetEngine.ts';
import { ColorClashEngine } from '../engines/ColorClashEngine.ts';
import { CrtTvEngine } from '../engines/CrtTvEngine.ts';
import { FlirThermalEngine } from '../engines/FlirThermalEngine.ts';
import { GlitchEngine } from '../engines/GlitchEngine.ts';
import { MinecraftEngine } from '../engines/MinecraftEngine.ts';
import { PixelArtEngine } from '../engines/PixelArtEngine.ts';
import { PostcardEngine } from '../engines/PostcardEngine.ts';
import { PunkFanzineEngine } from '../engines/PunkFanzineEngine.ts';
import { SensorCorruptEngine } from '../engines/SensorCorruptEngine.ts';
import { TextGlitchEngine } from '../engines/TextGlitchEngine.ts';
import { ThermalPaperEngine } from '../engines/ThermalPaperEngine.ts';
import { VanGoghEngine } from '../engines/VanGoghEngine.ts';

export type EngineCollection = {
  [K in EngineId]: IImageEngine<EngineParamsMap[K]>;
};

export function createEngines(): EngineCollection {
  return {
    pixelart: new PixelArtEngine(),
    glitch: new GlitchEngine(),
    sensorcorrupt: new SensorCorruptEngine(),
    textglitch: new TextGlitchEngine(),
    crttv: new CrtTvEngine(),
    ascii: new AsciiMatrixEngine(),
    thermalpaper: new ThermalPaperEngine(),
    flir: new FlirThermalEngine(),
    cmyk: new CmykOffsetEngine(),
    fanzine: new PunkFanzineEngine(),
    colorclash: new ColorClashEngine(),
    vangogh: new VanGoghEngine(),
    minecraft: new MinecraftEngine(),
    postcard: new PostcardEngine(),
  };
}

export function createDefaultParams(): EngineParamsMap {
  return {
    pixelart: { pixelSize: 128, paletteKey: 'gameboy', ditherMode: 'bayer' },
    thermalpaper: { paperType: 'aged', wear: 30, tornEdge: true, ditherMode: 'atkinson' },
    ascii: { charSetKey: 'density', colorMode: 'matrix', fontSize: 10, customText: 'ANOMALIES' },
    crttv: { scanlineGap: 3, phosphorGlow: true },
    flir: { mode: 'ironbow' },
    cmyk: { offsetPx: 5, dotSize: 8 },
    fanzine: { contrastBoost: 2.5, tonerNoise: 40 },
    colorclash: { blockSize: 8 },
    glitch: { intensity: 40, gyroEffect: false },
    textglitch: { text: 'SYSTEM ERROR', style: 'rgb_shift', fontSize: 42 },
    vangogh: { mode: 2, stepSize: 12, brushMinLength: 10, brushMaxLength: 30, impasto: true },
    minecraft: { mode: 1, blockSize: 24, paletteKey: 'classic' },
    postcard: { mode: 'halftone_paper', stampMargin: 28, engraveDensity: 6 },
    sensorcorrupt: {
      mode: 'chaos',
      noiseIntensity: 55,
      chaosLevel: 80,
      lineJitter: true,
      bitShift: true,
      seed: 424242,
    },
  };
}

export function createDefaultTextOverlay(): TextOverlayParams {
  return {
    enabled: false,
    text: 'THWIP!',
    color: '#ff0055',
    scale: 1.0,
    comicFrame: false,
  };
}

export const ENGINE_METADATA: readonly EngineMetadata[] = [
  {
    id: 'pixelart',
    label: 'Pixel Art',
    icon: '👾',
    fields: [
      { type: 'range', key: 'pixelSize', label: 'Çözünürlük / Piksel Boyutu', min: 32, max: 256, unit: 'px' },
      {
        type: 'select',
        key: 'paletteKey',
        label: 'Nostaljik Renk Paleti',
        options: [
          { value: 'gameboy', label: 'Game Boy Classic' },
          { value: 'gb-pocket', label: 'Game Boy Pocket' },
          { value: 'cga', label: 'CGA Mode 1' },
          { value: 'c64', label: 'Commodore 64' },
          { value: 'cyberpunk', label: 'Cyberpunk Neon' },
          { value: 'vaporwave', label: 'Vaporwave Sunset' },
        ],
      },
      {
        type: 'select',
        key: 'ditherMode',
        label: 'Gölgelendirme (Dithering)',
        options: [
          { value: 'bayer', label: 'Bayer 4×4 (Retro Konsol)' },
          { value: 'floyd-steinberg', label: 'Floyd-Steinberg (Yumuşak Geçiş)' },
          { value: 'atkinson', label: 'Atkinson (Keskin Macintosh)' },
          { value: 'none', label: 'Düz (Dithering Yok)' },
        ],
      },
    ],
  },
  {
    id: 'glitch',
    label: 'Spider Glitch',
    icon: '🌀',
    fields: [
      {
        type: 'range',
        key: 'intensity',
        label: 'Anomali Şiddeti',
        min: 5,
        max: 100,
        unit: '%',
        hint: '💡 Cihazı sallamak şiddeti anlık artırır.',
      },
      { type: 'checkbox', key: 'gyroEffect', label: 'Jiroskop Paralaks Etkisi (Cihazı Eğ)' },
    ],
  },
  {
    id: 'sensorcorrupt',
    label: 'Sensor Corrupt',
    icon: '🔌',
    fields: [
      {
        type: 'select',
        key: 'mode',
        label: 'Arıza Modu',
        options: [
          { value: 'chaos', label: 'Chaos' },
          { value: 'standard', label: 'Standard RGB' },
        ],
      },
      { type: 'range', key: 'noiseIntensity', label: 'Şiddet', min: 0, max: 140, unit: '%' },
      { type: 'action', id: 'reroll-seed', label: '🎲 Farklı Varyasyon Üret' },
    ],
  },
  {
    id: 'textglitch',
    label: 'Glitch Tipografi',
    icon: '🔤',
    fields: [
      { type: 'text', key: 'text', label: 'Damga Metni', placeholder: 'Yazı yazın...' },
      {
        type: 'select',
        key: 'style',
        label: 'Stil',
        options: [
          { value: 'rgb_shift', label: 'RGB Shift' },
          { value: 'vhs', label: 'VHS Timestamp' },
          { value: 'stamp', label: 'Punk Stamp' },
        ],
      },
      { type: 'range', key: 'fontSize', label: 'Boyut', min: 16, max: 80, unit: 'px' },
    ],
  },
  {
    id: 'crttv',
    label: 'CRT TV',
    icon: '📺',
    usesGpu: true,
    fields: [
      { type: 'range', key: 'scanlineGap', label: 'Tarama Çizgileri (Scanlines)', min: 2, max: 6, unit: 'px' },
      { type: 'checkbox', key: 'phosphorGlow', label: 'Fosfor Işıması (Bloom)' },
    ],
  },
  {
    id: 'ascii',
    label: 'ASCII Matrix',
    icon: '💻',
    fields: [
      {
        type: 'select',
        key: 'charSetKey',
        label: 'Karakter Seti',
        options: [
          { value: 'density', label: 'Standart Yoğunluk' },
          { value: 'binary', label: 'Binary (01)' },
          { value: 'hex', label: 'Hexadecimal (0-F)' },
          { value: 'custom', label: 'Özel Metin' },
        ],
      },
      {
        type: 'text',
        key: 'customText',
        label: 'Özel Metin',
        placeholder: 'Metin girin...',
        visibleWhen: { key: 'charSetKey', equals: 'custom' },
      },
      {
        type: 'select',
        key: 'colorMode',
        label: 'Renk Modu',
        options: [
          { value: 'matrix', label: 'Matrix Yeşili' },
          { value: 'amber', label: 'Amber CRT' },
          { value: 'fullcolor', label: 'Renkli ASCII' },
        ],
      },
      { type: 'range', key: 'fontSize', label: 'Font Büyüklüğü', min: 6, max: 20, unit: 'px' },
    ],
  },
  {
    id: 'thermalpaper',
    label: 'Market Fişi',
    icon: '🧾',
    fields: [
      {
        type: 'select',
        key: 'paperType',
        label: 'Kağıt Tipi',
        options: [
          { value: 'aged', label: 'Sararmış Fiş' },
          { value: 'fresh', label: 'Taze Termal' },
        ],
      },
      {
        type: 'select',
        key: 'ditherMode',
        label: 'Baskı Taraması',
        options: [
          { value: 'atkinson', label: 'Atkinson (Yüksek Netlik)' },
          { value: 'bayer', label: 'Bayer 4×4 (Klasik POS)' },
        ],
      },
      { type: 'range', key: 'wear', label: 'Yazıcı Aşınması', min: 0, max: 100, unit: '%' },
      { type: 'checkbox', key: 'tornEdge', label: 'Tırtıklı Kenarlar' },
    ],
  },
  {
    id: 'flir',
    label: 'Termal Görüş',
    icon: '🌡️',
    usesGpu: true,
    fields: [
      {
        type: 'select',
        key: 'mode',
        label: 'Gradient Mode',
        options: [
          { value: 'ironbow', label: 'Ironbow' },
          { value: 'rainbow', label: 'Rainbow' },
          { value: 'emerald', label: 'Emerald (Night Vision)' },
        ],
      },
    ],
  },
  {
    id: 'cmyk',
    label: 'CMYK Matbaa',
    icon: '🖨️',
    usesGpu: true,
    fields: [
      { type: 'range', key: 'offsetPx', label: 'Kanal Kayması', min: 1, max: 15, unit: 'px' },
      { type: 'range', key: 'dotSize', label: 'Nokta Boyutu', min: 4, max: 16, unit: 'px' },
    ],
  },
  {
    id: 'fanzine',
    label: 'Kötü Fotokopi',
    icon: '📄',
    fields: [
      { type: 'range', key: 'contrastBoost', label: 'Kontrast Sertliği', min: 1.0, max: 4.0, step: 0.1, unit: 'x' },
      { type: 'range', key: 'tonerNoise', label: 'Toner Kiri', min: 0, max: 100, unit: '%' },
    ],
  },
  {
    id: 'colorclash',
    label: 'Color Clash',
    icon: '📼',
    fields: [
      { type: 'range', key: 'blockSize', label: 'Spectrum Izgara Boyutu', min: 4, max: 24, step: 2, unit: 'px' },
    ],
  },
  {
    id: 'vangogh',
    label: 'Van Gogh',
    icon: '🎨',
    usesGpu: true,
    fields: [
      {
        type: 'select',
        key: 'mode',
        label: 'Fırça Akış Modu',
        isNumeric: true,
        options: [
          { value: '1', label: 'Mod 1: Paralel Hat Akışı' },
          { value: '2', label: 'Mod 2: Girdap & Odak Bağlantıları (Yıldızlı Gece)' },
          { value: '3', label: 'Mod 3: Merkez Dik / Kenarlar Radyal' },
        ],
      },
      { type: 'range', key: 'stepSize', label: 'Fırça Yoğunluğu / Adım', min: 6, max: 24, unit: 'px' },
      { type: 'range', key: 'brushMinLength', label: 'Min Fırça Boyu', min: 5, max: 20, unit: 'px' },
      { type: 'range', key: 'brushMaxLength', label: 'Max Fırça Boyu', min: 15, max: 50, unit: 'px' },
      { type: 'checkbox', key: 'impasto', label: '3D Boya Kabartma (Impasto Işığı)' },
    ],
  },
  {
    id: 'minecraft',
    label: 'Minecraft',
    icon: '🎮',
    fields: [
      {
        type: 'select',
        key: 'mode',
        label: 'Render Modu',
        isNumeric: true,
        options: [
          { value: '1', label: '2D Flat Map' },
          { value: '2', label: '2.5D Isometric' },
        ],
      },
      { type: 'range', key: 'blockSize', label: 'Blok Boyutu', min: 8, max: 48, step: 2, unit: 'px' },
    ],
  },
  {
    id: 'postcard',
    label: 'Kartpostal / Pul',
    icon: '📮',
    fields: [
      {
        type: 'select',
        key: 'mode',
        label: 'Doku Modu',
        options: [
          { value: 'halftone_paper', label: 'Halftone Paper' },
          { value: 'engraving', label: 'Engraving (Banknot)' },
        ],
      },
      { type: 'range', key: 'stampMargin', label: 'Pul Kenarı', min: 12, max: 60, unit: 'px' },
    ],
  },
];

export const ENGINE_METADATA_MAP: Record<EngineId, EngineMetadata> = Object.fromEntries(
  ENGINE_METADATA.map((meta) => [meta.id, meta])
) as Record<EngineId, EngineMetadata>;
