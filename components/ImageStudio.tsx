"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Download, Film, ImagePlus, Palette, Sparkles, Type, Wand2, X } from "lucide-react";

type Preset = "reel" | "quote" | "bold" | "clean";
type Position = "top" | "center" | "bottom";
type Align = "left" | "center" | "right";

interface StudioImage {
  name: string;
  url: string;
}

interface Props {
  open: boolean;
  initialImage?: StudioImage | null;
  initialText?: string;
  onClose: () => void;
  onInsert?: (url: string, fileName: string, text: string) => void;
  onSendToReel?: (url: string, fileName: string, text: string) => void;
}

interface DrawOptions {
  text: string;
  preset: Preset;
  position: Position;
  align: Align;
  size: number;
  box: number;
  color: string;
  accent: string;
}

const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: "reel", label: "Reel caption" },
  { id: "quote", label: "Quote" },
  { id: "bold", label: "Bold poster" },
  { id: "clean", label: "Clean" },
];

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
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

function drawImage(canvas: HTMLCanvasElement, image: HTMLImageElement, options: DrawOptions) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const w = Math.max(1, Math.round(image.naturalWidth * scale));
  const h = Math.max(1, Math.round(image.naturalHeight * scale));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(image, 0, 0, w, h);

  const text = options.text.trim();
  if (!text) return;

  const fontPx = Math.max(16, Math.round((options.size / 100) * h));
  const family =
    options.preset === "quote"
      ? 'Georgia, "Noto Serif Devanagari", serif'
      : 'Arial, "Noto Sans Devanagari", sans-serif';
  const weight = options.preset === "clean" ? 600 : 900;
  const italic = options.preset === "quote";
  ctx.font = `${italic ? "italic " : ""}${weight} ${fontPx}px ${family}`;
  ctx.textBaseline = "alphabetic";

  const lines = wrapLines(ctx, text, w * 0.86);
  const lineHeight = fontPx * (options.preset === "quote" ? 1.32 : 1.2);
  const blockHeight = Math.max(1, lines.length * lineHeight);
  let firstBaseline: number;
  if (options.position === "top") firstBaseline = h * 0.1 + fontPx;
  else if (options.position === "center") firstBaseline = (h - blockHeight) / 2 + fontPx;
  else firstBaseline = h * 0.92 - (lines.length - 1) * lineHeight;

  const scrimHeight = Math.min(h * 0.62, blockHeight + fontPx * 5);
  const dark = options.preset === "clean" ? 0.3 : 0.72;
  const gradient =
    options.position === "top"
      ? ctx.createLinearGradient(0, 0, 0, scrimHeight)
      : options.position === "center"
        ? ctx.createLinearGradient(0, h / 2 - scrimHeight / 2, 0, h / 2 + scrimHeight / 2)
        : ctx.createLinearGradient(0, h, 0, Math.max(0, h - scrimHeight));
  const stops: Array<[number, string]> =
    options.position === "top"
      ? [[0, `rgba(0,0,0,${dark})`], [1, "rgba(0,0,0,0)"]]
      : options.position === "center"
        ? [[0, "rgba(0,0,0,0)"], [0.5, `rgba(0,0,0,${dark * 0.82})`], [1, "rgba(0,0,0,0)"]]
        : [[0, "rgba(0,0,0,0)"], [1, `rgba(0,0,0,${dark})`]];
  stops.forEach(([stop, color]) => gradient.addColorStop(stop, color));
  ctx.fillStyle = gradient;
  ctx.fillRect(
    0,
    options.position === "top" ? 0 : options.position === "bottom" ? h - scrimHeight : Math.max(0, h / 2 - scrimHeight / 2),
    w,
    scrimHeight
  );

  if (options.box > 0) {
    const padY = fontPx * 0.42;
    const boxY = firstBaseline - fontPx - padY;
    const boxHeight = blockHeight + padY * 2;
    ctx.fillStyle = `rgba(4,6,14,${(options.box / 100) * 0.62})`;
    roundedRect(ctx, w * 0.05, boxY, w * 0.9, boxHeight, fontPx * 0.32);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.13)";
    ctx.lineWidth = Math.max(1, fontPx * 0.018);
    ctx.stroke();
  }

  ctx.textAlign = options.align;
  const anchorX = options.align === "left" ? w * 0.09 : options.align === "right" ? w * 0.91 : w / 2;
  ctx.fillStyle = options.color;
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = fontPx * 0.32;
  ctx.shadowOffsetY = fontPx * 0.06;
  if (options.preset === "reel" || options.preset === "bold") {
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.lineWidth = Math.max(1, fontPx * 0.05);
    ctx.lineJoin = "round";
  }

  lines.forEach((line, index) => {
    const baseline = firstBaseline + index * lineHeight;
    if (options.preset === "reel" || options.preset === "bold") ctx.strokeText(line, anchorX, baseline);
    ctx.fillText(line, anchorX, baseline);
  });

  if (options.preset === "reel" && lines.length) {
    const last = lines[lines.length - 1];
    const lastBaseline = firstBaseline + (lines.length - 1) * lineHeight;
    const width = ctx.measureText(last).width;
    const x = options.align === "left" ? anchorX : options.align === "right" ? anchorX - width : anchorX - width / 2;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = options.accent;
    ctx.lineWidth = Math.max(2, fontPx * 0.08);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, lastBaseline + fontPx * 0.22);
    ctx.lineTo(x + width, lastBaseline + fontPx * 0.22);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

export default function ImageStudio({
  open,
  initialImage,
  initialText,
  onClose,
  onInsert,
  onSendToReel,
}: Props) {
  const [image, setImage] = useState<StudioImage | null>(initialImage ?? null);
  const [text, setText] = useState(initialText ?? "");
  const [preset, setPreset] = useState<Preset>("reel");
  const [position, setPosition] = useState<Position>("bottom");
  const [align, setAlign] = useState<Align>("center");
  const [size, setSize] = useState(7);
  const [box, setBox] = useState(45);
  const [color, setColor] = useState("#ffffff");
  const [accent, setAccent] = useState("#ffd66b");
  const [result, setResult] = useState<StudioImage | null>(null);
  const [error, setError] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loadedRef = useRef<HTMLImageElement | null>(null);
  const resultRef = useRef<StudioImage | null>(null);
  const insertedRef = useRef(false);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  // Props are applied via the component `key` in page.tsx — no state sync needed here.
  useEffect(() => {
    if (!open || !image?.url) {
      loadedRef.current = null;
      return;
    }
    let cancelled = false;
    const element = new Image();
    element.onload = () => {
      if (cancelled) return;
      loadedRef.current = element;
      const canvas = canvasRef.current;
      if (canvas) {
        drawImage(canvas, element, { text, preset, position, align, size, box, color, accent });
      }
    };
    element.onerror = () => {
      if (!cancelled) setError("Image load nahi ho payi — dobara try karein.");
    };
    element.src = image.url;
    return () => {
      cancelled = true;
    };
    // Settings are handled by the redraw effect below; only the source matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, image?.url]);

  useEffect(() => {
    if (!open || !loadedRef.current || !canvasRef.current) return;
    drawImage(canvasRef.current, loadedRef.current, { text, preset, position, align, size, box, color, accent });
  }, [open, text, preset, position, align, size, box, color, accent]);

  useEffect(() => {
    const inserted = insertedRef;
    return () => {
      const current = resultRef.current;
      if (current?.url.startsWith("blob:") && !inserted.current) URL.revokeObjectURL(current.url);
    };
  }, []);

  const pickImage = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Sirf image file chuniye.");
      return;
    }
    setImage({ name: file.name, url: URL.createObjectURL(file) });
    setResult(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const buildResult = async (): Promise<StudioImage | null> => {
    if (!loadedRef.current || !canvasRef.current) {
      setError("Pehle ek image add karein.");
      return null;
    }
    if (!text.trim()) {
      setError("Image par likhne ke liye script/text daalein.");
      return null;
    }
    drawImage(canvasRef.current, loadedRef.current, { text, preset, position, align, size, box, color, accent });
    const name = `chat-master-edited-${(image?.name ?? "image").replace(/\.[^.]+$/, "")}.png`;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvasRef.current?.toBlob(resolve, "image/png")
    );
    if (!blob) {
      setError("Image export nahi ho paya.");
      return null;
    }
    return { name, url: URL.createObjectURL(blob) };
  };

  const createImage = async () => {
    const created = await buildResult();
    if (!created) return;
    if (result?.url.startsWith("blob:")) URL.revokeObjectURL(result.url);
    setResult(created);
    setError("");
  };

  const insert = async () => {
    const created = result ?? (await buildResult());
    if (!created) return;
    if (!result) setResult(created);
    insertedRef.current = true;
    onInsert?.(created.url, created.name, text.trim());
    onClose();
  };

  const sendToReel = async () => {
    const created = result ?? (await buildResult());
    if (!created) return;
    if (!result) setResult(created);
    insertedRef.current = true;
    onSendToReel?.(created.url, created.name, text.trim());
    onClose();
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="studio-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Image Studio"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div className="modal-title"><Wand2 size={18} /> Image Studio — photo par script likhein</div>
          <button className="icon-btn" onClick={onClose} aria-label="Band karein"><X size={18} /></button>
        </header>

        <div className="studio-body">
          <div className="studio-controls">
            <h3>1. Image</h3>
            <div className="studio-row">
              <button type="button" className="studio-btn" onClick={() => inputRef.current?.click()}>
                <ImagePlus size={15} /> {image ? "Image badlein" : "Image upload karein"}
              </button>
              {image && <span className="studio-file-chip">{image.name}</span>}
              <input ref={inputRef} type="file" accept="image/*" hidden onChange={(event) => pickImage(event.target.files)} />
            </div>

            <h3>2. Script / caption</h3>
            <textarea
              className="modal-textarea"
              rows={4}
              value={text}
              onChange={(event) => setText(event.target.value.slice(0, 1200))}
              placeholder={"Jaise: Har naya din ek nayi kahani\nApni kahani yahin se shuru hoti hai"}
              aria-label="Image par likhne ke liye script"
            />
            <p className="modal-note">Enter dabakar nayi line. Preview turant update hota hai.</p>

            <h3>3. Style preset</h3>
            <div className="studio-row">
              {PRESETS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`studio-btn ${preset === item.id ? "primary" : ""}`}
                  onClick={() => setPreset(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <h3>4. Settings</h3>
            <div className="studio-settings">
              <label>
                <span>Text size (%)</span>
                <input type="range" min={3} max={16} step={0.5} value={size} onChange={(e) => setSize(Number(e.target.value))} />
              </label>
              <label>
                <span>Position</span>
                <select value={position} onChange={(e) => setPosition(e.target.value as Position)}>
                  <option value="bottom">Bottom</option>
                  <option value="center">Center</option>
                  <option value="top">Top</option>
                </select>
              </label>
              <label>
                <span>Align</span>
                <select value={align} onChange={(e) => setAlign(e.target.value as Align)}>
                  <option value="center">Center</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <label>
                <span>Box</span>
                <input type="range" min={0} max={100} step={5} value={box} onChange={(e) => setBox(Number(e.target.value))} />
              </label>
              <label>
                <span>Text colour</span>
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
              </label>
              <label>
                <span>Accent</span>
                <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} />
              </label>
            </div>

            {error && <p className="studio-error">{error}</p>}

            <div className="studio-actions">
              <button type="button" className="studio-btn primary" onClick={() => void createImage()} disabled={!image || !text.trim()}>
                <Sparkles size={15} /> Image banaayein
              </button>
              {result && (
                <>
                  <a className="studio-btn" href={result.url} download={result.name}>
                    <Download size={15} /> Download
                  </a>
                  <button type="button" className="studio-btn accent" onClick={() => void insert()}>
                    <Check size={15} /> Chat me daalein
                  </button>
                  <button type="button" className="studio-btn" onClick={() => void sendToReel()}>
                    <Film size={15} /> Reel banayein
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="studio-preview">
            <div className="preview-frame">
              {image ? (
                <canvas ref={canvasRef} aria-label="Edited image preview" />
              ) : (
                <div className="studio-empty">
                  <Palette size={28} />
                  <span>Koi image upload karein ya chat se photo bhejein</span>
                </div>
              )}
            </div>
            <p className="modal-note">
              <Type size={13} /> Live preview · output PNG · 1600px tak
            </p>
            {result && (
              <div className="studio-result">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={result.url} alt="Edited result" />
                <small>{result.name}</small>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
