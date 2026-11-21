export async function fetchImageBlob(prompt: string, width = 768, height = 768): Promise<Blob> {
  const response = await fetch("/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, width, height }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error ?? "Image generate nahi ho paya");
  }
  return response.blob();
}

function preferredMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

/** Turns a generated still image into a short animated WebM clip (Ken Burns effect). */
export async function createVideoFromImage(
  imageBlob: Blob,
  durationMs = 4500
): Promise<Blob> {
  if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error("Is browser me video recording support nahi hai (Chrome/Edge use karein).");
  }
  const mimeType = preferredMimeType();
  if (!mimeType) throw new Error("Video codec available nahi hai.");

  const bitmap = await createImageBitmap(imageBlob);
  const size = 720;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
    recorder.onerror = () => reject(new Error("Video recording fail ho gaya"));
  });

  recorder.start();

  await new Promise<void>((resolve) => {
    const start = performance.now();
    const draw = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      const scale = 1.02 + eased * 0.14;
      const drift = Math.sin(eased * Math.PI) * size * 0.025;
      const drawWidth = size * scale;
      const drawHeight = size * scale;

      ctx.fillStyle = "#080b12";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(
        bitmap,
        (size - drawWidth) / 2 + drift,
        (size - drawHeight) / 2 - drift,
        drawWidth,
        drawHeight
      );

      // Soft cinematic fade at the start and end.
      const fade = Math.min(1, progress * 8, (1 - progress) * 8);
      ctx.fillStyle = `rgba(8, 11, 18, ${Math.max(0, 1 - fade) * 0.55})`;
      ctx.fillRect(0, 0, size, size);

      if (progress < 1) {
        requestAnimationFrame(draw);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(draw);
  });

  recorder.stop();
  bitmap.close();
  stream.getTracks().forEach((track) => track.stop());
  return done;
}
