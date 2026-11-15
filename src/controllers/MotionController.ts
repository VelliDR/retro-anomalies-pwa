import { clamp } from '../core/ColorSpace.ts';
import type { TiltState } from '../core/types.ts';

interface DeviceSensorConstructorWithPermission {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

export class MotionController {
  private readonly onShake: () => void;
  private readonly onTilt: (tilt: TiltState) => void;
  private lastX: number | null = null;
  private lastY: number | null = null;
  private lastZ: number | null = null;
  private lastTiltX = 0;
  private lastTiltY = 0;
  private lastTiltEmitMs = 0;
  private readonly threshold = 18;
  private readonly minTiltIntervalMs = 33;
  private readonly tiltDeadzone = 0.015;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  private readonly boundMotion = (e: DeviceMotionEvent) => this.handleMotion(e);
  private readonly boundOrientation = (e: DeviceOrientationEvent) => this.handleOrientation(e);

  constructor(onShakeCallback: () => void, onTiltCallback: (tilt: TiltState) => void) {
    this.onShake = onShakeCallback;
    this.onTilt = onTiltCallback;
  }

  async init(): Promise<void> {
    if (this.initialized || typeof window === 'undefined') return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const dm = (window.DeviceMotionEvent as unknown) as
        | DeviceSensorConstructorWithPermission
        | undefined;
      if (dm && typeof dm.requestPermission === 'function') {
        try {
          const res = await dm.requestPermission();
          if (res !== 'granted') return;
        } catch {
          return;
        }
      }

      const dor = (window.DeviceOrientationEvent as unknown) as
        | DeviceSensorConstructorWithPermission
        | undefined;
      if (dor && typeof dor.requestPermission === 'function') {
        try {
          await dor.requestPermission();
        } catch {
          // Oryantasyon izni reddedilse bile hareket dinleyicisi bağlanabilir
        }
      }

      if ('DeviceMotionEvent' in window) {
        window.addEventListener('devicemotion', this.boundMotion);
      }
      if ('DeviceOrientationEvent' in window) {
        window.addEventListener('deviceorientation', this.boundOrientation);
      }
      this.initialized = true;
    })().finally(() => {
      this.initPromise = null;
    });

    return this.initPromise;
  }

  destroy(): void {
    if (!this.initialized || typeof window === 'undefined') return;
    window.removeEventListener('devicemotion', this.boundMotion);
    window.removeEventListener('deviceorientation', this.boundOrientation);
    this.lastX = null;
    this.lastY = null;
    this.lastZ = null;
    this.initialized = false;
  }

  private handleMotion(e: DeviceMotionEvent): void {
    const acc = e.accelerationIncludingGravity;
    if (!acc || acc.x === null || acc.y === null || acc.z === null) return;

    if (this.lastX !== null && this.lastY !== null && this.lastZ !== null) {
      const delta =
        Math.abs(acc.x - this.lastX) +
        Math.abs(acc.y - this.lastY) +
        Math.abs(acc.z - this.lastZ);

      if (delta > this.threshold) {
        this.onShake();
      }
    }

    this.lastX = acc.x;
    this.lastY = acc.y;
    this.lastZ = acc.z;
  }

  private handleOrientation(e: DeviceOrientationEvent): void {
    if (e.gamma === null || e.beta === null) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.lastTiltEmitMs < this.minTiltIntervalMs) return;

    const tiltX = clamp(e.gamma / 90, -1, 1);
    const tiltY = clamp(e.beta / 180, -1, 1);
    if (
      Math.abs(tiltX - this.lastTiltX) < this.tiltDeadzone &&
      Math.abs(tiltY - this.lastTiltY) < this.tiltDeadzone
    ) {
      return;
    }

    this.lastTiltX = tiltX;
    this.lastTiltY = tiltY;
    this.lastTiltEmitMs = now;
    this.onTilt({ tiltX, tiltY });
  }
}
