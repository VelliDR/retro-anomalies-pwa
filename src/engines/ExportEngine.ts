export class ExportEngine {
  static async recordWebM(
    canvas: HTMLCanvasElement,
    renderFrameFn: (elapsedSeconds: number) => void,
    durationMs = 3000,
    fps = 30
  ): Promise<string> {
    if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
      throw new Error('Tarayıcınız WebM video kaydını desteklemiyor.');
    }

    const stream = canvas.captureStream(fps);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    return new Promise<string>((resolve, reject) => {
      let intervalId = 0;
      let timeoutId = 0;
      const cleanup = () => {
        if (intervalId) window.clearInterval(intervalId);
        if (timeoutId) window.clearTimeout(timeoutId);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.onstop = () => {
        cleanup();
        const blob = new Blob(chunks, { type: 'video/webm' });
        resolve(URL.createObjectURL(blob));
      };
      recorder.onerror = (err) => {
        cleanup();
        reject(err);
      };

      const startTime = performance.now();
      recorder.start();
      renderFrameFn(0);

      intervalId = window.setInterval(() => {
        const elapsedSeconds = (performance.now() - startTime) / 1000;
        renderFrameFn(elapsedSeconds);
      }, 1000 / fps);

      timeoutId = window.setTimeout(() => {
        window.clearInterval(intervalId);
        intervalId = 0;
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      }, durationMs);
    });
  }
}
