export class ExportEngine {
  static async recordWebM(
    canvas: HTMLCanvasElement,
    renderFrameFn: (elapsedSeconds: number) => void,
    durationMs = 3000,
    fps = 30
  ): Promise<string> {
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
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        resolve(URL.createObjectURL(blob));
      };
      recorder.onerror = (err) => reject(err);

      const startTime = performance.now();
      recorder.start();

      const interval = window.setInterval(() => {
        const elapsedSeconds = (performance.now() - startTime) / 1000;
        renderFrameFn(elapsedSeconds);
      }, 1000 / fps);

      window.setTimeout(() => {
        window.clearInterval(interval);
        recorder.stop();
      }, durationMs);
    });
  }
}
