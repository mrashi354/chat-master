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

type Aspect = "9:16" | "1:1" | "16:9";
type Transition = "fade" | "slide" | "none";

interface SceneImage {
  id: string;
  name: string;
  url: string;
}

interface Props {
  open: boolean;
  initialScript?: string;
  initialPrompt?: string;
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

function drawCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  zoom: number,
  offsetX = 0
) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight) * zoom;
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  ctx.drawImage(image, (width - w) / 2 + offsetX, (height - h) / 2, w, h);
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
  background: string;
}

function drawFrame(options: DrawOptions) {
  const { canvas, images, scenes, theme, elapsed, sceneDuration, showCaption, transition, background } = options;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const safeScenes = scenes.length ? scenes : ["Aapki kahani yahaan dikhegi"];
  const index = Math.min(safeScenes.length - 1, Math.floor(elapsed / sceneDuration));
  const local = Math.max(0, elapsed - index * sceneDuration);
  const image = images.length ? images[index % images.length] : null;

  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, background);
  gradient.addColorStop(1, "#05070d");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  if (image?.complete && image.naturalWidth) {
    const zoom = 1.03 + Math.min(0.09, local / Math.max(sceneDuration, 1) * 0.09);
    if (transition !== "none" && local < 0.45 && index > 0) {
      const previous = images[(index - 1) % images.length];
      if (previous?.complete && previous.naturalWidth) {
        ctx.save();
        ctx.globalAlpha = 1 - local / 0.45;
        drawCover(ctx, previous, w, h, 1.08);
        ctx.restore();
      }
    }
    ctx.save();
    if (transition === "fade" && local < 0.45) ctx.globalAlpha = Math.min(1, local / 0.45);
    const offset = transition === "slide" && local < 0.45 ? (1 - local / 0.45) * w * 0.18 : 0;
    drawCover(ctx, image, w, h, zoom, offset);
    ctx.restore();
  } else if (!images.length) {
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      const r = (w * (0.12 + i * 0.05)) / 2;
      ctx.arc(w * (0.2 + (i % 3) * 0.3), h * (0.25 + Math.floor(i / 3) * 0.45), r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const shade = ctx.createLinearGradient(0, h * 0.45, 0, h);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(0,0,0,0.82)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, h * 0.4, w, h * 0.6);

  const unit = w / 540;
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = `600 ${Math.round(15 * unit)}px Arial, sans-serif`;
  ctx.fillText("✦ Chat-Master Reel", 24 * unit, 40 * unit);
  ctx.textAlign = "right";
  ctx.fillText(`${index + 1}/${safeScenes.length}`, w - 24 * unit, 40 * unit);

  if (showCaption) {
    ctx.textAlign = "center";
    ctx.font = `700 ${Math.round(34 * unit)}px Arial, "Noto Sans Devanagari", sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 12 * unit;
    const lines = wrapText(ctx, safeScenes[index], w - 72 * unit);
    const lineHeight = 44 * unit;
    const startY = h - (96 + (lines.length - 1) * 22) * unit;
    lines.forEach((line, i) => ctx.fillText(line, w / 2, startY + i * lineHeight));
    ctx.shadowBlur = 0;
  }

  if (theme.trim()) {
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.font = `500 ${Math.round(16 * unit)}px Arial, sans-serif`;
    ctx.fillText(theme.trim().slice(0, 60), w / 2, h - 34 * unit);
  }

  const progress = Math.min(1, elapsed / (sceneDuration * safeScenes.length));
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(0, h - 6 * unit, w, 6 * unit);
  ctx.fillStyle = "#7c8cff";
  ctx.fillRect(0, h - 6 * unit, w * progress, 6 * unit);
}

export default function VideoStudio({
  open,
  initialScript = "",
  initialPrompt = "",
  onClose,
  onInsert,
}: Props) {
  const [script, setScript] = useState(initialScript || SAMPLE_SCRIPT);
  const [theme, setTheme] = useState(initialPrompt);
  const [images, setImages] = useState<SceneImage[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioName, setAudioName] = useState("");
  const [aspect, setAspect] = useState<Aspect>("9:16");
  const [sceneDuration, setSceneDuration] = useState(3);
  const [transition, setTransition] = useState<Transition>("fade");
  const [showCaption, setShowCaption] = useState(true);
  const [background, setBackground] = useState("#1b2350");
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultName, setResultName] = useState("chat-master-reel.webm");
  const [error, setError] = useState("");

  const previewRef = useRef<HTMLCanvasElement>(null);
  const renderRef = useRef<HTMLCanvasElement | null>(null);
  const imageElsRef = useRef<HTMLImageElement[]>([]);
  const cancelRef = useRef<(() => void) | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
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
      if (canvas) {
        canvas.width = size.width;
        canvas.height = size.height;
        drawFrame({
          canvas,
          images: elements,
          scenes,
          theme,
          elapsed: 0,
          sceneDuration,
          showCaption,
          transition,
          background,
        });
      }
    });
    return () => { cancelled = true; };
  }, [images, scenes, theme, size.width, size.height, sceneDuration, showCaption, transition, background]);

  useEffect(() => {
    return () => {
      cancelRef.current?.();
      imagesRef.current.forEach((item) => URL.revokeObjectURL(item.url));
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
      if (target) URL.revokeObjectURL(target.url);
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

  const generateImages = async () => {
    if (!scenes.length) {
      setError("Pehle script likhein.");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const created: SceneImage[] = [];
      for (let i = 0; i < scenes.length; i++) {
        const prompt = `${theme.trim() || "cinematic photorealistic reel"} — scene ${i + 1}: ${scenes[i]}`;
        const blob = await fetchImageBlob(prompt, 768, 768);
        created.push({
          id: `gen-${Date.now()}-${i}`,
          name: `scene-${i + 1}.jpg`,
          url: URL.createObjectURL(blob),
        });
        setProgress(Math.round(((i + 1) / scenes.length) * 100));
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

    const recorder = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: 4_000_000 });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      setResultName(`chat-master-reel-${aspect.replace(":", "x")}.webm`);
      audioElement?.pause();
      void audioContext?.close();
      setRendering(false);
      setProgress(100);
      cancelRef.current = null;
    };

    let frame = 0;
    const started = performance.now();
    const total = scenes.length * sceneDuration;

    const cleanup = () => {
      cancelAnimationFrame(frame);
      if (recorder.state !== "inactive") recorder.stop();
      audioElement?.pause();
      void audioContext?.close();
      cancelRef.current = null;
      setRendering(false);
    };
    cancelRef.current = cleanup;

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
                <span>Transition</span>
                <select value={transition} onChange={(event) => setTransition(event.target.value as Transition)}>
                  <option value="fade">Fade</option>
                  <option value="slide">Slide</option>
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
              <p className="modal-note">Preview upar dikhega. Photos + script set karke “Reel banaayein” dabayein.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
