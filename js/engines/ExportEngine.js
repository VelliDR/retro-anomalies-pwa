/**
 * @file ExportEngine.js
 * @description HTML5 Canvas animasyonlarını .webm videosu olarak kaydeder.
 */

export class ExportEngine {
    /**
     * @param {HTMLCanvasElement} canvas - Kaydedilecek ana tuval
     * @param {Function} renderFrameFn - Her karede (time) alarak çizim yapan fonksiyon
     * @param {number} durationMs - Video süresi (ms)
     * @param {number} fps - Saniye başı kare sayısı
     */
    static async recordWebM(canvas, renderFrameFn, durationMs = 3000, fps = 30) {
        const stream = canvas.captureStream(fps);
        
        // Tarayıcı uyumlu WebM MIME tipi
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : 'video/webm';

        const recorder = new MediaRecorder(stream, { mimeType });
        const chunks = [];

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        return new Promise((resolve, reject) => {
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: 'video/webm' });
                const videoUrl = URL.createObjectURL(blob);
                resolve(videoUrl);
            };

            recorder.onerror = (err) => reject(err);

            let startTime = performance.now();
            recorder.start();

            // Animasyon Döngüsü
            const interval = setInterval(() => {
                const elapsedSeconds = (performance.now() - startTime) / 1000;
                renderFrameFn(elapsedSeconds); // time parametresini gönder
            }, 1000 / fps);

            setTimeout(() => {
                clearInterval(interval);
                recorder.stop();
            }, durationMs);
        });
    }
}