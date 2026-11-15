/**
 * Güvenli, deterministik ve GPU durum sızıntısından arındırılmış WebGL2 Pipeline katmanı.
 *
 * Geçmişte GPU hızlandırmasının motor davranışlarını bozmasının başlıca nedenleri:
 *  1) Safari/iOS'ta tutarsız Canvas2D `ctx.filter` davranışı
 *  2) `preserveDrawingBuffer: false` nedeniyle PNG export sırasında siyah çıktı
 *  3) `premultipliedAlpha` ve `UNPACK_FLIP_Y_WEBGL` durum sızıntısı
 *  4) Mobil GPU'larda `mediump` varsayılanı yüzünden bantlaşma ve tensör hataları
 *  5) `MAX_TEXTURE_SIZE` aşımı ve `EXT_color_buffer_float` kontrolsüz FBO hataları
 *
 * Bu sınıf tüm bu koşulları baştan doğrular; donanım desteklemiyorsa veya context kaybolursa
 * motorların CPU yoluna temiz geri dönüş (graceful fallback) yapabilmesini sağlar.
 */

export interface WebGL2Capabilities {
  available: boolean;
  maxTextureSize: number;
  maxRenderbufferSize: number;
  floatFboSupported: boolean;
  floatLinearSupported: boolean;
}

export interface FloatFbo {
  fbo: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

export interface MrtFbo {
  fbo: WebGLFramebuffer;
  textures: [WebGLTexture, WebGLTexture];
  width: number;
  height: number;
}

const FULLSCREEN_QUAD_VS = `#version 300 es
precision highp float;

const vec2 POS[4] = vec2[4](
  vec2(-1.0, -1.0),
  vec2( 1.0, -1.0),
  vec2(-1.0,  1.0),
  vec2( 1.0,  1.0)
);

uniform float uFlipY;
out vec2 vUv;

void main() {
  vec2 p = POS[gl_VertexID];
  gl_Position = vec4(p, 0.0, 1.0);
  float uvY = uFlipY > 0.5 ? (0.5 - p.y * 0.5) : (0.5 + p.y * 0.5);
  vUv = vec2(p.x * 0.5 + 0.5, uvY);
}
`;

export class WebGL2Pipeline {
  private canvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private capabilities: WebGL2Capabilities | null = null;
  private contextLost = false;
  private contextEpoch = 0;
  private programCache = new Map<string, WebGLProgram>();
  private dummyVao: WebGLVertexArrayObject | null = null;

  private ensureInitialized(): WebGL2Capabilities {
    if (this.capabilities) return this.capabilities;

    const fallback: WebGL2Capabilities = {
      available: false,
      maxTextureSize: 0,
      maxRenderbufferSize: 0,
      floatFboSupported: false,
      floatLinearSupported: false,
    };

    if (typeof document !== 'undefined') {
      const el = document.createElement('canvas');
      el.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.contextLost = true;
        this.contextEpoch++;
        this.invalidateCaches();
      });
      el.addEventListener('webglcontextrestored', () => {
        this.contextLost = false;
        this.capabilities = null;
        this.initContext();
      });
      this.canvas = el;
    } else if (typeof OffscreenCanvas !== 'undefined') {
      this.canvas = new OffscreenCanvas(1, 1);
    } else {
      this.capabilities = fallback;
      return fallback;
    }

    return this.initContext();
  }

  getContextEpoch(): number {
    return this.contextEpoch;
  }

  private initContext(): WebGL2Capabilities {
    const fallback: WebGL2Capabilities = {
      available: false,
      maxTextureSize: 0,
      maxRenderbufferSize: 0,
      floatFboSupported: false,
      floatLinearSupported: false,
    };

    if (!this.canvas) {
      this.capabilities = fallback;
      return fallback;
    }

    try {
      const gl = this.canvas.getContext('webgl2', {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      }) as WebGL2RenderingContext | null;

      if (!gl) {
        this.gl = null;
        this.capabilities = fallback;
        return fallback;
      }

      this.gl = gl;
      this.contextEpoch++;
      this.dummyVao = gl.createVertexArray();

      // Sabit pixel store bayrakları: Y eksenini shader'da kontrollü çeviriyoruz.
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

      const floatColorExt = gl.getExtension('EXT_color_buffer_float');
      const floatLinearExt = gl.getExtension('OES_texture_float_linear');

      this.capabilities = {
        available: true,
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
        maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number,
        floatFboSupported: Boolean(floatColorExt),
        floatLinearSupported: Boolean(floatLinearExt),
      };
      return this.capabilities;
    } catch {
      this.gl = null;
      this.capabilities = fallback;
      return fallback;
    }
  }

  private invalidateCaches(): void {
    this.programCache.clear();
    this.dummyVao = null;
  }

  getCapabilities(): WebGL2Capabilities {
    return this.ensureInitialized();
  }

  canProcess(width: number, height: number): boolean {
    const caps = this.ensureInitialized();
    if (!this.gl || this.contextLost || !caps.available) return false;
    const limit = Math.min(caps.maxTextureSize, caps.maxRenderbufferSize);
    return width > 0 && height > 0 && width <= limit && height <= limit;
  }

  getContext(): WebGL2RenderingContext | null {
    this.ensureInitialized();
    if (!this.gl || this.contextLost) return null;
    return this.gl;
  }

  compileQuadProgram(key: string, fragmentSource: string): WebGLProgram | null {
    return this.compileProgram(key, FULLSCREEN_QUAD_VS, fragmentSource);
  }

  compileProgram(
    key: string,
    vertexSource: string,
    fragmentSource: string
  ): WebGLProgram | null {
    const gl = this.getContext();
    if (!gl) return null;

    const cached = this.programCache.get(key);
    if (cached) return cached;

    const vs = this.compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    if (!vs || !fs) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      return null;
    }

    const prog = gl.createProgram();
    if (!prog) return null;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn(`WebGL2 link hatası (${key}):`, gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      return null;
    }

    this.programCache.set(key, prog);
    return prog;
  }

  private compileShader(
    gl: WebGL2RenderingContext,
    type: number,
    source: string
  ): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('WebGL2 shader derleme hatası:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  uploadCanvasTexture(source: HTMLCanvasElement, linear = true): WebGLTexture | null {
    const gl = this.getContext();
    if (!gl) return null;

    const tex = gl.createTexture();
    if (!tex) return null;

    const filter = linear ? gl.LINEAR : gl.NEAREST;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  createTextureFbo(width: number, height: number, useFloat = false): FloatFbo | null {
    const gl = this.getContext();
    const caps = this.ensureInitialized();
    if (!gl) return null;
    if (useFloat && !caps.floatFboSupported) return null;

    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    if (!tex || !fbo) {
      if (tex) gl.deleteTexture(tex);
      if (fbo) gl.deleteFramebuffer(fbo);
      return null;
    }

    const linear = !useFloat || caps.floatLinearSupported;
    const filter = linear ? gl.LINEAR : gl.NEAREST;
    const internalFormat = useFloat ? gl.RGBA16F : gl.RGBA8;
    const type = useFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, type, null);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(tex);
      return null;
    }

    return { fbo, texture: tex, width, height };
  }

  deleteFbo(target: FloatFbo): void {
    const gl = this.getContext();
    if (!gl) return;
    gl.deleteFramebuffer(target.fbo);
    gl.deleteTexture(target.texture);
  }

  createMrtFbo(width: number, height: number): MrtFbo | null {
    const gl = this.getContext();
    if (!gl) return null;

    const fbo = gl.createFramebuffer();
    const tex0 = gl.createTexture();
    const tex1 = gl.createTexture();
    if (!fbo || !tex0 || !tex1) {
      if (fbo) gl.deleteFramebuffer(fbo);
      if (tex0) gl.deleteTexture(tex0);
      if (tex1) gl.deleteTexture(tex1);
      return null;
    }

    const setupTex = (tex: WebGLTexture) => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    };

    setupTex(tex0);
    setupTex(tex1);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex0, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, tex1, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(tex0);
      gl.deleteTexture(tex1);
      return null;
    }

    return { fbo, textures: [tex0, tex1], width, height };
  }

  deleteMrtFbo(target: MrtFbo): void {
    const gl = this.getContext();
    if (!gl) return;
    gl.deleteFramebuffer(target.fbo);
    gl.deleteTexture(target.textures[0]);
    gl.deleteTexture(target.textures[1]);
  }

  drawQuad(
    program: WebGLProgram,
    width: number,
    height: number,
    flipY: boolean,
    targetFbo: FloatFbo | null = null
  ): void {
    const gl = this.getContext();
    if (!gl || !this.canvas) return;

    if (!targetFbo && (this.canvas.width !== width || this.canvas.height !== height)) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFbo ? targetFbo.fbo : null);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.useProgram(program);

    const flipLoc = gl.getUniformLocation(program, 'uFlipY');
    if (flipLoc !== null) {
      gl.uniform1f(flipLoc, flipY ? 1.0 : 0.0);
    }

    gl.bindVertexArray(this.dummyVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  /**
   * GPU çıktısını güvenli şekilde hedef 2D canvas'a kopyalar.
   */
  copyToCanvas(targetCanvas: HTMLCanvasElement): boolean {
    if (!this.gl || !this.canvas || this.contextLost) return false;
    const ctx = targetCanvas.getContext('2d');
    if (!ctx) return false;
    ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
    ctx.drawImage(this.canvas, 0, 0, targetCanvas.width, targetCanvas.height);
    return true;
  }
}

export const webgl2Pipeline = new WebGL2Pipeline();
