/**
 * @file CanvasPool.js
 * @description Bellek sızıntılarını ve tarayıcı çökmelerini önleyen sabit tuval havuzu.
 */

export class CanvasPool {
    constructor() {
        this.pool = new Map();
    }

    /**
     * Belirtilen ID ile önceden ayrılmış veya yeni bir geçici tuval döndürür.
     * Genişlik ve yükseklik atandığında tuval içeriği otomatik temizlenir.
     * @param {string} id - Tuval kimliği ('temp1', 'temp2', 'effect_cache' vb.)
     * @param {number} width - Genişlik
     * @param {number} height - Yükseklik
     * @returns {HTMLCanvasElement}
     */
    getCanvas(id, width, height) {
        if (!this.pool.has(id)) {
            const canvas = document.createElement('canvas');
            this.pool.set(id, canvas);
        }

        const canvas = this.pool.get(id);
        
        // Boyut değişimi veya aynı boyut ataması tuval context'ini sıfırlar
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        } else {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, width, height);
        }

        return canvas;
    }

    /**
     * Havuzdaki bellek kullanan tüm geçici tuvalleri sıfırlar
     */
    releaseAll() {
        this.pool.forEach(canvas => {
            canvas.width = 0;
            canvas.height = 0;
        });
        this.pool.clear();
    }
}

// Global olarak tek bir instance (Singleton) paylaşıyoruz
export const canvasPool = new CanvasPool();