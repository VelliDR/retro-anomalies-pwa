import type { TiltState } from '../core/types.ts';

interface DeviceMotionConstructorWithPermission {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

export class MotionController {
  private readonly onShake: () => void;
  private readonly onTilt: (tilt: TiltState) => void;
  private lastX: number | null = null;
  private lastY: number | null = null;
  private lastZ: number | null = null;
  private readonly threshold = 18;
  private initialized = false;

  private readonly boundMotion = (e: DeviceMotionEvent) => this.handleMotion(e);
  private readonly boundOrientation = (e: DeviceOrientationEvent) => this.handleOrientation(e);

  constructor(onShakeCallback: () => void, onTiltCallback: (tilt: TiltState) => void) {
    this.onShake = onShakeCallback;
    this.onTilt = onTiltCallback;
  }

  async init(): Promise<void> {
    if (this.initialized || typeof window === 'undefined') return;

    const dm = (window.DeviceMotionEvent as unknown) as
      | DeviceMotionConstructorWithPermission
      | undefined;
    if (dm && typeof dm.requestPermission === 'function') {
      try {
        const res = await dm.requestPermission();
        if (res !== 'granted') return;
      } catch {
        return;
      }
    }

    if ('DeviceMotionEvent' in window) {
      window.addEventListener('devicemotion', this.boundMotion);
    }
    if ('DeviceOrientationEvent' in window) {
      window.addEventListener('deviceorientation', this.boundOrientation);
    }
    this.initialized = true;
  }

  destroy(): void {
    if (!this.initialized || typeof window === 'undefined') return;
    window.removeEventListener('devicemotion', this.boundMotion);
    window.removeEventListener('deviceorientation', this.boundOrientation);
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
    if (e.gamma !== null && e.beta !== null) {
      this.onTilt({
        tiltX: e.gamma / 90,
        tiltY: e.beta / 180,
      });
    }
  }
}
