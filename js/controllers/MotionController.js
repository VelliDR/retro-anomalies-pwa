/**
 * @file MotionController.js
 * @description DeviceMotion ve DeviceOrientation sensör yönetimi.
 */

export class MotionController {
    constructor(onShakeCallback, onTiltCallback) {
        this.onShake = onShakeCallback;
        this.onTilt = onTiltCallback;
        this.lastX = null;
        this.lastY = null;
        this.lastZ = null;
        this.threshold = 18; // Sallama hassasiyet eşiği
    }

    init() {
        if (typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
            window.addEventListener('devicemotion', (e) => this._handleMotion(e));
        }
        if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
            window.addEventListener('deviceorientation', (e) => this._handleOrientation(e));
        }
    }

    _handleMotion(e) {
        const acc = e.accelerationIncludingGravity;
        if (!acc) return;

        if (this.lastX !== null) {
            const deltaX = Math.abs(acc.x - this.lastX);
            const deltaY = Math.abs(acc.y - this.lastY);
            const deltaZ = Math.abs(acc.z - this.lastZ);

            if (deltaX + deltaY + deltaZ > this.threshold) {
                if (this.onShake) this.onShake();
            }
        }

        this.lastX = acc.x;
        this.lastY = acc.y;
        this.lastZ = acc.z;
    }

    _handleOrientation(e) {
        if (this.onTilt && e.gamma !== null && e.beta !== null) {
            // gamma: sağa/sola eğim (-90 - 90), beta: öne/arkaya eğim (-180 - 180)
            this.onTilt({ tiltX: e.gamma / 90, tiltY: e.beta / 180 });
        }
    }
}