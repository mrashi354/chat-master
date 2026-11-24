"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Download,
  Film,
  ImagePlus,
  Loader2,
  Music,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { fetchImageBlob } from "@/lib/media";
import fixWebmDuration from "fix-webm-duration";

type Aspect = "9:16" | "1:1" | "16:9";
type Transition = "fade" | "slide" | "zoom" | "wipe" | "none";
type Motion = "cinematic" | "soft" | "dramatic" | "static";

interface SceneImage {
  id: string;
  name: string;
  url: string;
}

interface Props {
  open: boolean;
  initialScript?: string;
  initialPrompt?: string;
  initialImages?: Array<{ name: string; url: string }>;
  onClose: () => void;
  onInsert?: (url: string, fileName: string, script: string) => void;
}

const SIZES: Record<Aspect, { width: number; height: number }> = {
  "9:16": { width: 540, height: 960 },
  "1:1": { width: 720, height: 720 },
  "16:9": { width: 960, height: 540 },
};

const SAMPLE_SCRIPT = [
  "Subah ka suraj nikla, sheher jag utha",
  "Chai ki pyali me garam yaadon ki bhap",
  "Har naya din ek nayi kahani likhta hai",
].join("\n");

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

/** Deterministic camera path so the same scene always moves the same way. */
function cameraFor(motion: Motion, progress: number, index: number) {
  const p = clamp01(progress);
  const e = easeInOutCubic(p);
  const dir = index % 2 === 0 ? 1 : -1;
  switch (motion) {
    case "static":
      return { zoom: 1.04, panX: 0, panY: 0 };
    case "soft":
      return {
        zoom: 1.02 + e * 0.06,
        panX: Math.sin(e * Math.PI) * dir * 0.18,
        panY: -Math.sin(e * Math.PI) * 0.08,
      };
    case "dramatic":
      return {
        zoom: 1.2 - e * 0.13 + Math.sin(e * Math.PI) * 0.03,
        panX: dir * (0.85 - e * 1.7),
        panY: dir * 0.22 * (1 - e),
      };
    case "cinematic":
    default:
      return {
        zoom: 1.06 + e * 0.1,
        panX: dir * (0.5 - e),
        panY: (index % 3 === 0 ? -1 : 1) * 0.14 * (1 - e),
      };
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function parseScenes(script: string): string[] {
  const raw = script
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:\d+[.)-]|[-*•])\s*/, "").trim())
    .filter(Boolean);
  if (raw.length === 1 && raw[0].length > 140) {
    const sentences = raw[0].split(/(?<=[.!?।])\s+/).filter(Boolean);
    return sentences.slice(0, 12);
  }
  return raw.slice(0, 12);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3): string[] {
  if (typeof text !== "string" || !text.trim()) return [""];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    } else {
      current = candidate;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    if (words.join(" ").length > last.length + 3) {
      lines[maxLines - 1] = `${last.slice(0, Math.max(0, last.length - 2))}…`;
    }
  }
  return lines;
}

/** Cover-fit with pan values expressed as a fraction of the available overflow. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  zoom: number,
  panX = 0,
  panY = 0
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * zoom;
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  const maxX = Math.max(0, (w - width) / 2);
  const maxY = Math.max(0, (h - height) / 2);
  const x = (width - w) / 2 + Math.max(-1, Math.min(1, panX)) * maxX;
  const y = (height - h) / 2 + Math.max(-1, Math.min(1, panY)) * maxY;
  ctx.drawImage(image, x, y, w, h);
}

interface DrawOptions {
  canvas: HTMLCanvasElement;
  images: HTMLImageElement[];
  scenes: string[];
  theme: string;
  elapsed: number;
  sceneDuration: number;
  showCaption: boolean;
  transition: Transition;
  motion: Motion;
  background: string;
}

function drawFrame(options: DrawOptions) {
  const { canvas, images, scenes, theme, elapsed, sceneDuration, showCaption, transition, motion, background } = options;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const safeScenes = scenes?.length ? scenes : ["Aapki kahani yahaan dikhegi"];
  const duration = sceneDuration > 0 ? sceneDuration : 3;
  const rawIndex = Math.floor(elapsed / duration);
  const index = Math.max(0, Math.min(safeScenes.length - 1, Number.isFinite(rawIndex) ? rawIndex : 0));
  const local = Math.max(0, Math.min(duration, elapsed - index * duration));
  const progress = clamp01(local / duration);
  const image = images.length ? images[index % images.length] : null;
  const previous = images.length > 1 ? images[(index - 1 + images.length) % images.length] : null;
  const unit = w / 540;

  // Backdrop — visible behind images during transitions and for image-less reels.
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, background);
  gradient.addColorStop(1, "#05070d");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  if (image?.complete && image.naturalWidth) {
    const cam = cameraFor(motion, progress, index);
    const t = clamp01(local / 0.55);
    const eased = easeInOutCubic(t);
    const hasPrev = index > 0 && transition !== "none" && Boolean(previous?.complete && previous?.naturalWidth);

    if (hasPrev && previous) {
      ctx.save();
      if (transition === "fade" || transition === "zoom") ctx.globalAlpha = 1 - eased;
      const prevCam = cameraFor(motion, 1, index - 1);
      drawCover(ctx, previous, w, h, prevCam.zoom, prevCam.panX, prevCam.panY);
      ctx.restore();
    }

    ctx.save();
    if (transition === "fade" && hasPrev) ctx.globalAlpha = eased;
    if (transition === "zoom") {
      drawCover(ctx, image, w, h, cam.zoom + (1 - eased) * 0.14, cam.panX * eased, cam.panY * eased);
    } else if (transition === "slide" && hasPrev) {
      ctx.beginPath();
      ctx.rect(w * eased, 0, w * (1 - eased), h);
      ctx.clip();
      drawCover(ctx, image, w, h, cam.zoom, cam.panX, cam.panY);
    } else if (transition === "wipe" && hasPrev) {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, Math.hypot(w, h) * 0.55 * eased, 0, Math.PI * 2);
      ctx.clip();
      drawCover(ctx, image, w, h, cam.zoom, cam.panX, cam.panY);
    } else {
      drawCover(ctx, image, w, h, cam.zoom, cam.panX, cam.panY);
    }
    ctx.restore();
  } else if (!images.length) {
    const drift = Math.sin(progress * Math.PI * 2) * w * 0.04;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      const r = (w * (0.12 + i * 0.05)) / 2;
      ctx.arc(
        w * (0.2 + (i % 3) * 0.3) + drift * (i % 2 ? -1 : 1),
        h * (0.25 + Math.floor(i / 3) * 0.45),
        r,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  // Cinematic overlays: vignette + top/bottom gradients.
  const vignette = ctx.createRadialGradient(w / 2, h * 0.42, w * 0.18, w / 2, h * 0.42, Math.hypot(w, h) * 0.62);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  const topShade = ctx.createLinearGradient(0, 0, 0, h * 0.25);
  topShade.addColorStop(0, "rgba(0,0,0,0.42)");
  topShade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topShade;
  ctx.fillRect(0, 0, w, h * 0.25);

  const shade = ctx.createLinearGradient(0, h * 0.45, 0, h);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.82)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, h * 0.4, w, h * 0.6);

  // Header + per-scene progress line.
  const headerWidth = w - 48 * unit;
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = `600 ${Math.round(15 * unit)}px Arial, sans-serif`;
  ctx.fillText("✦ Chat-Master Reel", 24 * unit, 40 * unit);
  ctx.textAlign = "right";
  ctx.fillText(`${index + 1}/${safeScenes.length}`, w - 24 * unit, 40 * unit);
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(24 * unit, 52 * unit, headerWidth, 2 * unit);
  ctx.fillStyle = "#7c8cff";
  ctx.fillRect(24 * unit, 52 * unit, headerWidth * progress, 2 * unit);

  // Instagram-style karaoke caption: active word is highlighted as the scene plays.
  if (showCaption && safeScenes[index]?.trim()) {
    const fadeIn = easeOutCubic(local / 0.42);
    const fadeOut = 1 - easeInOutCubic(clamp01((local - (duration - 0.4)) / 0.4));
    const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
    if (alpha > 0.01) {
      const fontSize = 34 * unit;
      ctx.textAlign = "center";
      ctx.font = `700 ${Math.round(fontSize)}px Arial, "Noto Sans Devanagari", sans-serif`;
      const lines = wrapText(ctx, safeScenes[index], w - 72 * unit);
      const lineHeight = 44 * unit;
      const startY = h - (96 + (lines.length - 1) * 22) * unit;
      const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
      const padX = 18 * unit;
      const padY = 12 * unit;
      const boxW = Math.min(w - 40 * unit, widest + padX * 2);
      const boxY = startY - fontSize - padY;
      const boxH = lines.length * lineHeight + padY * 2 - (lineHeight - fontSize);

      const wordLines = lines.map((line) => line.split(/\s+/).filter(Boolean));
      const flatWords = wordLines.flat();
      const activeWord = Math.min(
        Math.max(0, flatWords.length - 1),
        Math.floor(clamp01((local - 0.25) / Math.max(0.5, duration - 1)) * flatWords.length)
      );

      ctx.save();
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = "rgba(6,8,18,0.46)";
      roundedRect(ctx, (w - boxW) / 2, boxY, boxW, boxH, 14 * unit);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = Math.max(1, unit);
      ctx.stroke();

      ctx.textAlign = "left";
      const spaceW = ctx.measureText(" ").width;
      let flatIndex = 0;
      wordLines.forEach((words, li) => {
        const lineAlpha = clamp01(fadeIn * 1.8 - li * 0.28) * fadeOut;
        ctx.globalAlpha = alpha * lineAlpha;
        const widths = words.map((word) => ctx.measureText(word).width);
        const totalW = widths.reduce((sum, value) => sum + value, 0) + spaceW * Math.max(0, words.length - 1);
        let x = (w - totalW) / 2 + (1 - lineAlpha) * 8 * unit * (li % 2 ? -1 : 1);
        const baseline = startY + li * lineHeight + (1 - lineAlpha) * 8 * unit;
        words.forEach((word, wi) => {
          const isActive = flatIndex === activeWord;
          ctx.fillStyle = isActive ? "#ffd66b" : "#ffffff";
          ctx.shadowColor = isActive ? "rgba(255,190,70,0.9)" : "rgba(0,0,0,0.9)";
          ctx.shadowBlur = (isActive ? 18 : 10) * unit;
          ctx.fillText(word, x, baseline);
          if (isActive) {
            ctx.shadowBlur = 0;
            ctx.fillStyle = "#ffd66b";
            roundedRect(ctx, x, baseline + 5 * unit, widths[wi], 3 * unit, 1.5 * unit);
            ctx.fill();
          }
          x += widths[wi] + spaceW;
          flatIndex += 1;
        });
      });
      ctx.restore();
    }
  }

  if (theme.trim()) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.font = `500 ${Math.round(16 * unit)}px Arial, sans-serif`;
    ctx.fillText(theme.trim().slice(0, 60), w / 2, h - 34 * unit);
    ctx.restore();
  }

  const totalDuration = Math.max(0.001, duration * safeScenes.length);
  const overall = clamp01(elapsed / totalDuration);
  ctx.fillStyle = "rgba(255,255,255,0.16)";
  roundedRect(ctx, 0, h - 6 * unit, w, 6 * unit, 3 * unit);
  ctx.fill();
  ctx.save();
  ctx.shadowColor = "#7c8cff";
  ctx.shadowBlur = 12 * unit;
  ctx.fillStyle = "#7c8cff";
  roundedRect(ctx, 0, h - 6 * unit, Math.max(1, w * overall), 6 * unit, 3 * unit);
  ctx.fill();
  ctx.restore();
}

export default function VideoStudio({
  open,
  initialScript = "",
  initialPrompt = "",
  initialImages = [],
  onClose,
  onInsert,
}: Props) {
  const [script, setScript] = useState(initialScript || SAMPLE_SCRIPT);
  const [theme, setTheme] = useState(initialPrompt);
  const [images, setImages] = useState<SceneImage[]>(() =>
    initialImages.map((item) => ({ id: `preset-${Date.now()}-${Math.random()}`, name: item.name, url: item.url }))
  );
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioName, setAudioName] = useState("");
  const [aspect, setAspect] = useState<Aspect>("9:16");
  const [sceneDuration, setSceneDuration] = useState(3);
  const [transition, setTransition] = useState<Transition>("fade");
  const [motion, setMotion] = useState<Motion>("cinematic");
  const [showCaption, setShowCaption] = useState(true);
  const [background, setBackground] = useState("#1b2350");
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState("chat-master-reel.webm");
  const [error, setError] = useState("");

  const previewRef = useRef<HTMLCanvasElement>(null);
  const previewFrameRef = useRef<number | null>(null);
  const renderRef = useRef<HTMLCanvasElement | null>(null);
  const imageElsRef = useRef<HTMLImageElement[]>([]);
  const cancelRef = useRef<(() => void) | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const presetUrlsRef = useRef(new Set(initialImages.map((item) => item.url)));
  const imagesRef = useRef(images);
  const audioUrlRef = useRef(audioUrl);
  const resultUrlRef = useRef(resultUrl);
  const scenes = useMemo(() => parseScenes(script), [script]);
  const size = SIZES[aspect];

  useEffect(() => {
    imagesRef.current = images;
    audioUrlRef.current = audioUrl;
    resultUrlRef.current = resultUrl;
  }, [images, audioUrl, resultUrl]);

  // Live preview loops through the same motion/transition code used by the renderer.
  useEffect(() => {
    let cancelled = false;
    const elements = images.map((item) => {
      const image = new Image();
      image.src = item.url;
      return image;
    });
    Promise.all(elements.map((image) => image.decode().catch(() => undefined))).then(() => {
      if (cancelled) return;
      imageElsRef.current = elements;
      const canvas = previewRef.current;
      if (!canvas) return;
      canvas.width = size.width;
      canvas.height = size.height;
      if (previewFrameRef.current !== null) cancelAnimationFrame(previewFrameRef.current);

      const started = performance.now();
      const total = Math.max(1, scenes.length * sceneDuration);
      const loop = (now: number) => {
        if (cancelled) return;
        const elapsed = ((now - started) / 1000) % total;
        drawFrame({
          canvas,
          images: elements,
          scenes,
          theme,
          elapsed,
          sceneDuration,
          showCaption,
          transition,
          motion,
          background,
        });
        previewFrameRef.current = requestAnimationFrame(loop);
      };
      loop(started);
    });
    return () => {
      cancelled = true;
      if (previewFrameRef.current !== null) {
        cancelAnimationFrame(previewFrameRef.current);
        previewFrameRef.current = null;
      }
    };
  }, [images, scenes, theme, size.width, size.height, sceneDuration, showCaption, transition, motion, background]);

  useEffect(() => {
    const presetUrls = presetUrlsRef.current;
    return () => {
      cancelRef.current?.();
      imagesRef.current.forEach((item) => {
        if (!presetUrls.has(item.url)) URL.revokeObjectURL(item.url);
      });
      if (audioUrlRef.current?.startsWith("blob:")) URL.revokeObjectURL(audioUrlRef.current);
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    };
    // Cleanup only on unmount — refs hold the latest values.
  }, []);

  const addImages = (files: FileList | null) => {
    if (!files?.length) return;
    const picked = Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, 12 - images.length)
      .map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        url: URL.createObjectURL(file),
      }));
    if (!picked.length) {
      setError("Sirf image files select karein.");
      return;
    }
    setImages((prev) => [...prev, ...picked]);
    setError("");
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target && !presetUrlsRef.current.has(target.url)) URL.revokeObjectURL(target.url);
      return prev.filter((item) => item.id !== id);
    });
  };

  const moveImage = (index: number, direction: -1 | 1) => {
    setImages((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const pickAudio = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setError("Sirf audio file select karein.");
      return;
    }
    if (audioUrl?.startsWith("blob:")) URL.revokeObjectURL(audioUrl);
    setAudioUrl(URL.createObjectURL(file));
    setAudioName(file.name);
    setError("");
    if (audioInputRef.current) audioInputRef.current.value = "";
  };

  const generateImages = async (onlyMissing = false) => {
    if (!scenes.length) {
      setError("Pehle script likhein.");
      return;
    }
    const start = onlyMissing ? images.length : 0;
    if (start >= scenes.length) {
      setError("Sab scenes ke liye images already hain.");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const created: SceneImage[] = [];
      for (let i = start; i < scenes.length; i++) {
        const prompt = `${theme.trim() || "cinematic photorealistic reel"} — scene ${i + 1}: ${scenes[i]}`;
        const blob = await fetchImageBlob(prompt, 768, 768);
        created.push({
          id: `gen-${Date.now()}-${i}`,
          name: `scene-${i + 1}.jpg`,
          url: URL.createObjectURL(blob),
        });
        setProgress(Math.round(((i - start + 1) / (scenes.length - start)) * 100));
      }
      setImages((prev) => [...prev, ...created].slice(0, 12));
    } catch (err) {
      setError(
        `Auto image generate nahi ho paya: ${(err as Error).message}. Free image API rate-limited ho sakti hai — 45 sec baad try karein ya apni photos upload karein.`
      );
    } finally {
      setGenerating(false);
      setProgress(0);
    }
  };

  const renderVideo = async () => {
    if (rendering) return;
    if (!scenes.length) {
      setError("Reel banane ke liye script likhein (ek line = ek scene).");
      return;
    }
    if (typeof MediaRecorder === "undefined" || !HTMLCanvasElement.prototype.captureStream) {
      setError("Ye browser video recording support nahi karta. Chrome ya Edge use karein.");
      return;
    }

    setError("");
    setRendering(true);
    setProgress(0);
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
    }

    const mime = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm;codecs=vp9",
      "video/webm",
    ].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mime) {
      setError("Is browser me supported WebM encoder nahi mila.");
      setRendering(false);
      return;
    }

    const canvas = renderRef.current ?? document.createElement("canvas");
    renderRef.current = canvas;
    canvas.width = size.width;
    canvas.height = size.height;

    let audioElement: HTMLAudioElement | null = null;
    let audioContext: AudioContext | null = null;
    const tracks: MediaStreamTrack[] = canvas.captureStream(30).getVideoTracks();

    if (audioUrl) {
      try {
        audioContext = new AudioContext();
        audioElement = new Audio(audioUrl);
        audioElement.loop = true;
        const source = audioContext.createMediaElementSource(audioElement);
        const destination = audioContext.createMediaStreamDestination();
        source.connect(destination);
        await audioContext.resume();
        await audioElement.play();
        tracks.push(...destination.stream.getAudioTracks());
      } catch {
        audioElement?.pause();
        void audioContext?.close();
        audioContext = null;
        setError("Background audio chal nahi paya — video bina audio ke banega.");
      }
    }

    const total = scenes.length * sceneDuration;
    let cancelledRender = false;

    const recorder = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: 4_000_000 });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onstop = async () => {
      audioElement?.pause();
      void audioContext?.close();
      if (cancelledRender) {
        cancelRef.current = null;
        setRendering(false);
        return;
      }
      const raw = new Blob(chunks, { type: "video/webm" });
      let blob = raw;
      try {
        // MediaRecorder omits duration — patch it so players show a real timeline.
        blob = await fixWebmDuration(raw, total * 1000, { logger: false });
      } catch {
        // Raw WebM still plays; some browsers just show an unknown duration.
      }
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultName(`chat-master-reel-${aspect.replace(":", "x")}.webm`);
      setRendering(false);
      setProgress(100);
      cancelRef.current = null;
    };

    let frame = 0;
    const started = performance.now();

    const cleanup = () => {
      cancelAnimationFrame(frame);
      if (recorder.state !== "inactive") recorder.stop();
      audioElement?.pause();
      void audioContext?.close();
      cancelRef.current = null;
      setRendering(false);
    };
    cancelRef.current = () => {
      cancelledRender = true;
      cleanup();
    };

    const tick = (now: number) => {
      const elapsed = (now - started) / 1000;
      drawFrame({
        canvas,
        images: imageElsRef.current,
        scenes,
        theme,
        elapsed,
        sceneDuration,
        showCaption,
        transition,
        motion,
        background,
      });
      setProgress(Math.min(99, Math.round((elapsed / total) * 100)));
      if (elapsed >= total) {
        cleanup();
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    drawFrame({
      canvas,
      images: imageElsRef.current,
      scenes,
      theme,
      elapsed: 0,
      sceneDuration,
      showCaption,
      transition,
      motion,
      background,
    });
    recorder.start(250);
    frame = requestAnimationFrame(tick);
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="studio-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Video Studio"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div className="modal-title"><Film size={18} /> Reel / Video Studio</div>
          <button className="icon-btn" onClick={onClose} aria-label="Band karein"><X size={18} /></button>
        </header>

        <div className="studio-body">
          <div className="studio-controls">
            <h3>1. Script (ek line = ek scene)</h3>
            <textarea
              className="modal-textarea"
              rows={6}
              value={script}
              onChange={(event) => setScript(event.target.value.slice(0, 6000))}
              placeholder={"Subah ka suraj nikla…\nChai ki pyali me…\nHar naya din…"}
            />
            <p className="modal-note">{scenes.length} scenes · {Math.round(scenes.length * sceneDuration)} sec video</p>

            <h3>2. Photos (optional)</h3>
            <div className="studio-row">
              <button type="button" className="studio-btn" onClick={() => imageInputRef.current?.click()}>
                <ImagePlus size={15} /> Photos add karein
              </button>
              <button
                type="button"
                className="studio-btn accent"
                onClick={() => void generateImages()}
                disabled={generating || rendering}
              >
                {generating ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
                {generating ? "Images ban rahi hain…" : "Script se auto images"}
              </button>
              {images.length > 0 && images.length < scenes.length && (
                <button
                  type="button"
                  className="studio-btn"
                  onClick={() => void generateImages(true)}
                  disabled={generating || rendering}
                >
                  <ImagePlus size={15} /> +{scenes.length - images.length} scene image
                </button>
              )}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => addImages(event.target.files)}
              />
            </div>
            <p className="modal-note">Auto images free API se aati hain aur rate-limited hoti hain — apni photos fast hain.</p>

            {images.length > 0 && (
              <div className="studio-thumbs">
                {images.map((image, index) => (
                  <div key={image.id} className="studio-thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.url} alt={image.name} />
                    <span>{index + 1}</span>
                    <div>
                      <button type="button" onClick={() => moveImage(index, -1)} aria-label="Left"><ArrowUp size={12} /></button>
                      <button type="button" onClick={() => moveImage(index, 1)} aria-label="Right"><ArrowDown size={12} /></button>
                      <button type="button" onClick={() => removeImage(image.id)} aria-label="Delete"><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h3>3. Theme / caption</h3>
            <input
              className="studio-input"
              value={theme}
              onChange={(event) => setTheme(event.target.value.slice(0, 80))}
              placeholder="Jaise: Cinematic chai reel, warm colors"
            />

            <h3>4. Background music (optional)</h3>
            <div className="studio-row">
              <button type="button" className="studio-btn" onClick={() => audioInputRef.current?.click()}>
                <Music size={15} /> {audioName || "Audio choose karein"}
              </button>
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                hidden
                onChange={(event) => pickAudio(event.target.files?.[0])}
              />
              {audioUrl && (
                <button type="button" className="studio-btn" onClick={() => {
                  if (audioUrl.startsWith("blob:")) URL.revokeObjectURL(audioUrl);
                  setAudioUrl(null);
                  setAudioName("");
                }}>
                  <Trash2 size={14} /> Hataayein
                </button>
              )}
            </div>

            <h3>5. Settings</h3>
            <div className="studio-row">
              <button
                type="button"
                className="studio-btn accent"
                onClick={() => {
                  setAspect("9:16");
                  setSceneDuration(3);
                  setMotion("dramatic");
                  setTransition("zoom");
                  setShowCaption(true);
                  setError("");
                }}
              >
                <Sparkles size={15} /> Instagram-style preset
              </button>
            </div>
            <div className="studio-settings">
              <label>
                <span>Format</span>
                <select value={aspect} onChange={(event) => setAspect(event.target.value as Aspect)}>
                  <option value="9:16">9:16 — Reel / Shorts</option>
                  <option value="1:1">1:1 — Square</option>
                  <option value="16:9">16:9 — Landscape</option>
                </select>
              </label>
              <label>
                <span>Scene time</span>
                <select value={sceneDuration} onChange={(event) => setSceneDuration(Number(event.target.value))}>
                  {[2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} sec</option>)}
                </select>
              </label>
              <label>
                <span>Camera motion</span>
                <select value={motion} onChange={(event) => setMotion(event.target.value as Motion)}>
                  <option value="cinematic">Cinematic pan</option>
                  <option value="soft">Soft zoom</option>
                  <option value="dramatic">Dramatic push</option>
                  <option value="static">Static</option>
                </select>
              </label>
              <label>
                <span>Transition</span>
                <select value={transition} onChange={(event) => setTransition(event.target.value as Transition)}>
                  <option value="fade">Fade</option>
                  <option value="slide">Slide</option>
                  <option value="zoom">Zoom</option>
                  <option value="wipe">Circle wipe</option>
                  <option value="none">None</option>
                </select>
              </label>
              <label>
                <span>Background</span>
                <input type="color" value={background} onChange={(event) => setBackground(event.target.value)} />
              </label>
              <label className="studio-check">
                <input type="checkbox" checked={showCaption} onChange={(event) => setShowCaption(event.target.checked)} />
                Captions dikhaayein
              </label>
            </div>

            <div className="studio-actions">
              <button
                type="button"
                className="studio-btn primary"
                onClick={() => void renderVideo()}
                disabled={rendering || generating}
              >
                {rendering ? <Loader2 size={16} className="spin" /> : <Film size={16} />}
                {rendering ? `Video ban raha hai… ${progress}%` : "Reel banaayein"}
              </button>
              {rendering && (
                <button type="button" className="studio-btn" onClick={() => cancelRef.current?.()}>
                  Rokein
                </button>
              )}
            </div>
            {(rendering || generating) && <div className="studio-progress"><span style={{ width: `${progress}%` }} /></div>}
            {error && <p className="modal-error">{error}</p>}
          </div>

          <div className="studio-preview">
            <div className="preview-frame" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
              <canvas ref={previewRef} width={size.width} height={size.height} />
            </div>
            {resultUrl ? (
              <div className="studio-result">
                <video src={resultUrl} controls playsInline />
                <div className="studio-actions">
                  <a className="studio-btn primary" href={resultUrl} download={resultName}>
                    <Download size={15} /> Download
                  </a>
                  {onInsert && (
                    <button
                      type="button"
                      className="studio-btn"
                      onClick={() => {
                        onInsert(resultUrl, resultName, script);
                        onClose();
                      }}
                    >
                      <Check size={15} /> Chat me daalein
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="modal-note">Preview ab live animate hota hai — motion/transition badalte hi dikhega. Photos + script set karke “Reel banaayein” dabayein.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
