export type EngineId =
  | 'pixelart'
  | 'glitch'
  | 'sensorcorrupt'
  | 'textglitch'
  | 'crttv'
  | 'ascii'
  | 'thermalpaper'
  | 'flir'
  | 'cmyk'
  | 'fanzine'
  | 'colorclash'
  | 'vangogh'
  | 'minecraft'
  | 'postcard';

export type PixelPaletteKey =
  | 'gameboy'
  | 'gb-pocket'
  | 'cga'
  | 'c64'
  | 'cyberpunk'
  | 'vaporwave';

export type PixelDitherMode = 'bayer' | 'floyd-steinberg' | 'atkinson' | 'none';

export interface PixelArtParams {
  pixelSize: number;
  paletteKey: PixelPaletteKey;
  ditherMode: PixelDitherMode;
}

export interface ThermalPaperParams {
  paperType: 'aged' | 'fresh';
  wear: number;
  tornEdge: boolean;
  ditherMode: 'atkinson' | 'bayer';
}

export interface AsciiMatrixParams {
  charSetKey: 'density' | 'binary' | 'hex' | 'custom';
  colorMode: 'matrix' | 'amber' | 'fullcolor';
  fontSize: number;
  customText: string;
}

export interface CrtTvParams {
  scanlineGap: number;
  phosphorGlow: boolean;
}

export interface FlirThermalParams {
  mode: 'ironbow' | 'rainbow' | 'emerald';
}

export interface CmykOffsetParams {
  offsetPx: number;
  dotSize: number;
}

export interface PunkFanzineParams {
  contrastBoost: number;
  tonerNoise: number;
}

export interface ColorClashParams {
  blockSize: number;
}

export interface GlitchParams {
  intensity: number;
  gyroEffect: boolean;
}

export interface TextGlitchParams {
  text: string;
  style: 'rgb_shift' | 'vhs' | 'stamp';
  fontSize: number;
}

export interface VanGoghParams {
  mode: 1 | 2 | 3;
  stepSize: number;
  brushMinLength: number;
  brushMaxLength: number;
  impasto: boolean;
}

export interface MinecraftParams {
  mode: 1 | 2;
  blockSize: number;
  paletteKey: 'classic' | 'colorful';
}

export interface PostcardParams {
  mode: 'halftone_paper' | 'engraving';
  stampMargin: number;
  engraveDensity: number;
}

export interface SensorCorruptParams {
  mode: 'chaos' | 'standard';
  noiseIntensity: number;
  chaosLevel: number;
  lineJitter: boolean;
  bitShift: boolean;
  seed: number;
}

export interface TextOverlayParams {
  enabled: boolean;
  text: string;
  color: string;
  scale: number;
  comicFrame: boolean;
}

export interface EngineParamsMap {
  pixelart: PixelArtParams;
  thermalpaper: ThermalPaperParams;
  ascii: AsciiMatrixParams;
  crttv: CrtTvParams;
  flir: FlirThermalParams;
  cmyk: CmykOffsetParams;
  fanzine: PunkFanzineParams;
  colorclash: ColorClashParams;
  glitch: GlitchParams;
  textglitch: TextGlitchParams;
  vangogh: VanGoghParams;
  minecraft: MinecraftParams;
  postcard: PostcardParams;
  sensorcorrupt: SensorCorruptParams;
}

export interface TiltState {
  tiltX: number;
  tiltY: number;
}

export interface RenderContext {
  /** 1200px referansına göre çözünürlük oranı: Math.max(width, height) / 1200 */
  referenceScale: number;
  tilt: TiltState;
  preferGpu: boolean;
}

export interface IImageEngine<TParams> {
  readonly id: EngineId;
  readonly supportsWebGL2?: boolean;
  render(
    sourceCanvas: HTMLCanvasElement,
    params: TParams,
    context: RenderContext
  ): HTMLCanvasElement;
  renderAsync?(
    sourceCanvas: HTMLCanvasElement,
    params: TParams,
    context: RenderContext,
    signal?: AbortSignal
  ): Promise<HTMLCanvasElement>;
}

export interface SelectOption {
  value: string;
  label: string;
}

export type ParamFieldSchema<K extends string = string> =
  | {
      type: 'range';
      key: K;
      label: string;
      min: number;
      max: number;
      step?: number;
      unit?: string;
      hint?: string;
    }
  | {
      type: 'select';
      key: K;
      label: string;
      options: SelectOption[];
      isNumeric?: boolean;
    }
  | {
      type: 'checkbox';
      key: K;
      label: string;
    }
  | {
      type: 'text';
      key: K;
      label: string;
      placeholder?: string;
      visibleWhen?: { key: string; equals: string };
    }
  | {
      type: 'action';
      id: string;
      label: string;
    };

export interface EngineMetadata<K extends EngineId = EngineId> {
  id: K;
  label: string;
  icon: string;
  usesGpu?: boolean;
  fields: ParamFieldSchema[];
}
