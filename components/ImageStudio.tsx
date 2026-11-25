"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { QUICK_IMAGE_OBJECTS, type QuickImageObject } from "@/lib/chat";
import {
  ArrowLeftRight,
  Check,
  Crop,
  Download,
  Eraser,
  Film,
  FlipHorizontal,
  ImagePlus,
  MousePointer2,
  Paintbrush,
  Palette,
  PenLine,
  Redo2,
  RotateCw,
  Shapes,
  Smile,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Wand2,
  X,
} from "lucide-react";

type Tool = "select" | "text" | "brush" | "erase" | "clone" | "shape" | "sticker" | "crop";
type ShapeKind = "rect" | "ellipse" | "arrow";

interface StudioImage {
  name: string;
  url: string;
}

interface Props {
  open: boolean;
  initialImage?: StudioImage | null;
  initialText?: string;
  initialObjects?: QuickImageObject[];
  onClose: () => void;
  onInsert?: (url: string, fileName: string, text: string) => void;
  onSendToReel?: (url: string, fileName: string, text: string) => void;
}

interface Layer {
  id: string;
  type: "text" | "sticker" | "object" | "rect" | "ellipse" | "arrow" | "stroke";
  x: number;
  y: number;
  w?: number;
  h?: number;
  text?: string;
  src?: string;
  label?: string;
  color: string;
  size: number;
  points?: Array<[number, number]>;
}

interface Adjustments {
  brightness: number;
  contrast: number;
  saturate: number;
  blur: number;
  grayscale: number;
  sepia: number;
}

interface Snapshot {
  source: string;
  layers: Layer[];
  adjustments: Adjustments;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  blur: 0,
  grayscale: 0,
  sepia: 0,
};

const FILTER_PRESETS: Array<{ name: string; values: Adjustments }> = [
  { name: "Original", values: DEFAULT_ADJUSTMENTS },
  { name: "Warm", values: { brightness: 108, contrast: 112, saturate: 125, blur: 0, grayscale: 0, sepia: 18 } },
  { name: "B&W", values: { brightness: 102, contrast: 125, saturate: 100, blur: 0, grayscale: 100, sepia: 0 } },
  { name: "Vintage", values: { brightness: 105, contrast: 98, saturate: 78, blur: 0, grayscale: 10, sepia: 48 } },
  { name: "Cool", values: { brightness: 104, contrast: 110, saturate: 88, blur: 0, grayscale: 0, sepia: 0 } },
];

const STICKERS = ["⭐", "❤️", "🔥", "✨", "🎉", "😍", "👑", "💯", "🙌", "😎", "🌈", "💖"];
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
const SANS_FONT = 'Arial, "Noto Sans Devanagari", sans-serif';

const TOOLS: Array<{ id: Tool; label: string; icon: typeof MousePointer2 }> = [
  { id: "select", label: "Select / Move", icon: MousePointer2 },
  { id: "text", label: "Text", icon: Type },
  { id: "brush", label: "Brush", icon: Paintbrush },
  { id: "erase", label: "Erase", icon: Eraser },
  { id: "clone", label: "Clone", icon: PenLine },
  { id: "shape", label: "Shapes", icon: Shapes },
  { id: "sticker", label: "Sticker", icon: Smile },
  { id: "crop", label: "Crop", icon: Crop },
];

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const objectImageCache = new Map<string, HTMLImageElement>();

function readyObjectImage(src: string): HTMLImageElement | null {
  const image = objectImageCache.get(src);
  return image?.complete && image.naturalWidth > 0 ? image : null;
}

function filterString(adjustments: Adjustments): string {
  return (
    `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) ` +
    `saturate(${adjustments.saturate}%) blur(${adjustments.blur}px) ` +
    `grayscale(${adjustments.grayscale}%) sepia(${adjustments.sepia}%)`
  );
}

function layerLines(layer: Layer): string[] {
  return (layer.text ?? "").split(/\r?\n/);
}

function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer, selected: boolean) {
  ctx.save();
  ctx.globalAlpha = 1;
  if (layer.type === "text") {
    ctx.font = `900 ${layer.size}px ${SANS_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.lineWidth = Math.max(2, layer.size * 0.07);
    ctx.shadowColor = "rgba(0,0,0,0.75)";
    ctx.shadowBlur = layer.size * 0.22;
    const lines = layerLines(layer);
    lines.forEach((line, index) => {
      const y = layer.y + index * layer.size * 1.2;
      ctx.strokeText(line, layer.x, y);
      ctx.fillStyle = layer.color;
      ctx.fillText(line, layer.x, y);
    });
  } else if (layer.type === "sticker") {
    ctx.font = `${layer.size}px ${EMOJI_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(layer.text ?? "⭐", layer.x, layer.y);
  } else if (layer.type === "object") {
    const image = layer.src ? readyObjectImage(layer.src) : null;
    if (image) {
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.translate(layer.x, layer.y);
      ctx.drawImage(image, -layer.size / 2, -layer.size / 2, layer.size, layer.size);
      ctx.restore();
    }
  } else if (layer.type === "stroke") {
    const points = layer.points ?? [];
    if (points.length < 2) return ctx.restore();
    ctx.strokeStyle = layer.color;
    ctx.lineWidth = layer.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length - 1; i++) {
      const midX = (points[i][0] + points[i + 1][0]) / 2;
      const midY = (points[i][1] + points[i + 1][1]) / 2;
      ctx.quadraticCurveTo(points[i][0], points[i][1], midX, midY);
    }
    ctx.lineTo(points[points.length - 1][0], points[points.length - 1][1]);
    ctx.stroke();
  } else {
    ctx.strokeStyle = layer.color;
    ctx.lineWidth = layer.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const x = layer.x;
    const y = layer.y;
    const w = layer.w ?? 0;
    const h = layer.h ?? 0;
    if (layer.type === "rect") {
      ctx.strokeRect(x, y, w, h);
    } else if (layer.type === "ellipse") {
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const endX = x + w;
      const endY = y + h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      const angle = Math.atan2(h, w);
      const head = Math.max(14, layer.size * 3);
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - head * Math.cos(angle - Math.PI / 7), endY - head * Math.sin(angle - Math.PI / 7));
      ctx.lineTo(endX - head * Math.cos(angle + Math.PI / 7), endY - head * Math.sin(angle + Math.PI / 7));
      ctx.closePath();
      ctx.fillStyle = layer.color;
      ctx.fill();
    }
  }

  if (selected) {
    const bounds = layerBounds(layer);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 5]);
    ctx.strokeRect(bounds.x - 10, bounds.y - 10, bounds.w + 20, bounds.h + 20);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function layerBounds(layer: Layer): Rect {
  if (layer.type === "stroke") {
    const points = layer.points ?? [];
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const minX = Math.min(...xs, layer.x);
    const minY = Math.min(...ys, layer.y);
    return {
      x: minX - layer.size / 2,
      y: minY - layer.size / 2,
      w: Math.max(...xs, layer.x) - minX + layer.size,
      h: Math.max(...ys, layer.y) - minY + layer.size,
    };
  }
  if (layer.type === "text") {
    const lines = layerLines(layer);
    return {
      x: layer.x - layer.size * Math.max(...lines.map((line) => line.length)) * 0.3,
      y: layer.y - layer.size,
      w: layer.size * Math.max(...lines.map((line) => line.length)) * 0.6,
      h: lines.length * layer.size * 1.25,
    };
  }
  if (layer.type === "sticker" || layer.type === "object") {
    return { x: layer.x - layer.size / 2, y: layer.y - layer.size / 2, w: layer.size, h: layer.size };
  }
  return { x: Math.min(layer.x, layer.x + (layer.w ?? 0)), y: Math.min(layer.y, layer.y + (layer.h ?? 0)), w: Math.abs(layer.w ?? 0), h: Math.abs(layer.h ?? 0) };
}

function hitLayer(layers: Layer[], x: number, y: number): Layer | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const bounds = layerBounds(layers[i]);
    if (x >= bounds.x && x <= bounds.x + bounds.w && y >= bounds.y && y <= bounds.y + bounds.h) {
      return layers[i];
    }
  }
  return null;
}

export default function ImageStudio({
  open,
  initialImage,
  initialText,
  initialObjects,
  onClose,
  onInsert,
  onSendToReel,
}: Props) {
  const [image, setImage] = useState<StudioImage | null>(initialImage ?? null);
  const [sourceReady, setSourceReady] = useState(false);
  const [sourceVersion, setSourceVersion] = useState(0);
  const [tool, setTool] = useState<Tool>("select");
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Layer | null>(null);
  const [textValue, setTextValue] = useState(initialText ?? "");
  const [textColor, setTextColor] = useState("#ffffff");
  const [textSize, setTextSize] = useState(64);
  const [brushColor, setBrushColor] = useState("#ff5c8a");
  const [brushSize, setBrushSize] = useState(18);
  const [eraseSize, setEraseSize] = useState(46);
  const [cloneSize, setCloneSize] = useState(60);
  const [shapeKind, setShapeKind] = useState<ShapeKind>("rect");
  const [shapeColor, setShapeColor] = useState("#ffd66b");
  const [shapeWidth, setShapeWidth] = useState(8);
  const [sticker, setSticker] = useState("⭐");
  const [adjustments, setAdjustments] = useState<Adjustments>(DEFAULT_ADJUSTMENTS);
  const [cropRect, setCropRect] = useState<Rect | null>(null);
  const [pickSource, setPickSource] = useState(false);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [result, setResult] = useState<StudioImage | null>(null);
  const [error, setError] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const resultRef = useRef<StudioImage | null>(null);
  const insertedRef = useRef(false);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const drawingRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const cloneSourceRef = useRef<{ x: number; y: number } | null>(null);
  const cloneOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const [sourceSize, setSourceSize] = useState({ w: 0, h: 0 });
  const [cloneSourceSet, setCloneSourceSet] = useState(false);
  const objectLoadRef = useRef(new Set<string>());

  const bumpSource = () => {
    const canvas = sourceRef.current;
    if (canvas) setSourceSize({ w: canvas.width, h: canvas.height });
    setSourceVersion((value) => value + 1);
  };

  const addObjectLayer = (object: QuickImageObject, automatic = false) => {
    const source = sourceRef.current;
    if (!source) return;
    if (!automatic) {
      setHistory((prev) => [
        ...prev.slice(-14),
        { source: source.toDataURL("image/png"), layers, adjustments },
      ]);
      setFuture([]);
    }
    const size = Math.max(36, Math.round(Math.min(source.width, source.height) * object.sizeRatio));
    const layer: Layer =
      object.kind === "image"
        ? {
            id: uid(),
            type: "object",
            x: Math.round(source.width * object.x),
            y: Math.round(source.height * object.y),
            src: object.src,
            label: object.label,
            color: "#ffffff",
            size,
          }
        : {
            id: uid(),
            type: "sticker",
            x: Math.round(source.width * object.x),
            y: Math.round(source.height * object.y),
            text: object.emoji ?? "⭐",
            label: object.label,
            color: "#ffffff",
            size,
          };
    setLayers((items) => [...items, layer]);
    setSelectedId(layer.id);
    setTool("select");
    if (!automatic) setError("");
  };

  useEffect(() => {
    let alive = true;
    layers.forEach((layer) => {
      if (layer.type !== "object" || !layer.src) return;
      if (objectLoadRef.current.has(layer.src)) return;
      objectLoadRef.current.add(layer.src);
      const image = new Image();
      image.onload = () => {
        objectImageCache.set(layer.src as string, image);
        if (alive) setSourceVersion((value) => value + 1);
      };
      image.onerror = () => {
        if (alive) setError("Object load nahi ho paya — dobara try karein.");
      };
      image.src = layer.src;
    });
    return () => {
      alive = false;
    };
  }, [layers]);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    let cancelled = false;
    if (!image?.url) return;
    const element = new Image();
    element.onload = () => {
      if (cancelled) return;
      setSourceReady(false);
      setLayers([]);
      setSelectedId(null);
      setCropRect(null);
      setResult(null);
      setAdjustments(DEFAULT_ADJUSTMENTS);
      setHistory([]);
      setFuture([]);
      setError("");
      const maxSide = 1600;
      const scale = Math.min(1, maxSide / Math.max(element.naturalWidth, element.naturalHeight));
      const canvas = sourceRef.current ?? document.createElement("canvas");
      sourceRef.current = canvas;
      canvas.width = Math.max(1, Math.round(element.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(element.naturalHeight * scale));
      setSourceSize({ w: canvas.width, h: canvas.height });
      setCloneSourceSet(false);
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(element, 0, 0, canvas.width, canvas.height);
      setSourceReady(true);
      if (initialText?.trim()) {
        const layer: Layer = {
          id: uid(),
          type: "text",
          x: canvas.width / 2,
          y: canvas.height * 0.88,
          text: initialText.trim(),
          color: "#ffffff",
          size: Math.max(24, Math.round(canvas.height * 0.055)),
        };
        setLayers([layer]);
        setSelectedId(layer.id);
      }
      // "add gun in hand" → drop a real, movable object layer, not a text caption.
      (initialObjects ?? []).forEach((object) => addObjectLayer(object, true));
    };
    element.onerror = () => {
      if (!cancelled) setError("Image load nahi ho payi — dobara try karein.");
    };
    element.src = image.url;
    return () => {
      cancelled = true;
    };
    // Props are applied by remounting this component via its `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image?.url]);

  const paint = useCallback(() => {
    void sourceVersion; // bump after direct pixel edits to force a repaint
    const canvas = canvasRef.current;
    const source = sourceRef.current;
    if (!canvas || !source || !sourceReady) return;
    if (canvas.width !== source.width || canvas.height !== source.height) {
      canvas.width = source.width;
      canvas.height = source.height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.filter = filterString(adjustments);
    ctx.drawImage(source, 0, 0);
    ctx.filter = "none";
    layers.forEach((layer) => drawLayer(ctx, layer, layer.id === selectedId));
    if (draft) drawLayer(ctx, draft, false);
    if (cropRect) {
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 2;
      ctx.setLineDash([9, 6]);
      ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 0, canvas.width, cropRect.y);
      ctx.fillRect(0, cropRect.y + cropRect.h, canvas.width, canvas.height - cropRect.y - cropRect.h);
    }
  }, [sourceReady, sourceVersion, layers, adjustments, selectedId, draft, cropRect]);

  useEffect(() => {
    paint();
  }, [paint]);

  useEffect(() => {
    const inserted = insertedRef;
    return () => {
      const current = resultRef.current;
      if (current?.url.startsWith("blob:") && !inserted.current) URL.revokeObjectURL(current.url);
    };
  }, []);

  const snapshot = useCallback(
    (): Snapshot | null => {
      const source = sourceRef.current;
      if (!source) return null;
      return { source: source.toDataURL("image/png"), layers, adjustments };
    },
    [layers, adjustments]
  );

  const pushHistory = useCallback(() => {
    const current = snapshot();
    if (!current) return;
    setHistory((prev) => [...prev.slice(-14), current]);
    setFuture([]);
  }, [snapshot]);

  const restore = useCallback(async (snap: Snapshot) => {
    const element = new Image();
    element.src = snap.source;
    await element.decode().catch(() => undefined);
    const source = sourceRef.current;
    if (!source || !element.naturalWidth) return;
    source.width = element.naturalWidth;
    source.height = element.naturalHeight;
    source.getContext("2d", { willReadFrequently: true })?.drawImage(element, 0, 0);
    setLayers(snap.layers);
    setAdjustments(snap.adjustments);
    setSelectedId(null);
    setDraft(null);
    setCropRect(null);
    bumpSource();
  }, []);

  const undo = useCallback(async () => {
    if (!history.length) return;
    const previous = history[history.length - 1];
    const current = snapshot();
    setHistory((items) => items.slice(0, -1));
    if (current) setFuture((items) => [current, ...items].slice(0, 15));
    await restore(previous);
  }, [history, snapshot, restore]);

  const redo = useCallback(async () => {
    if (!future.length) return;
    const next = future[0];
    const current = snapshot();
    setFuture((items) => items.slice(1));
    if (current) setHistory((items) => [...items, current].slice(-15));
    await restore(next);
  }, [future, snapshot, restore]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    pushHistory();
    setLayers((items) => items.filter((item) => item.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, pushHistory]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        void (event.shiftKey ? redo() : undo());
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        void redo();
      } else if (!typing && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        deleteSelected();
      } else if (event.key === "Escape") {
        setCropRect(null);
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, undo, redo, deleteSelected]);

  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const source = sourceRef.current as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * source.width,
      y: ((event.clientY - rect.top) / rect.height) * source.height,
    };
  };

  const eraseAt = (x: number, y: number, radius: number) => {
    const source = sourceRef.current as HTMLCanvasElement;
    const ctx = source.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    let r = 0;
    let g = 0;
    let b = 0;
    let samples = 0;
    const distance = radius * 2.1;
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const sx = Math.round(x + Math.cos(angle) * distance);
      const sy = Math.round(y + Math.sin(angle) * distance);
      if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) continue;
      const pixel = ctx.getImageData(sx, sy, 1, 1).data;
      r += pixel[0];
      g += pixel[1];
      b += pixel[2];
      samples += 1;
    }
    if (!samples) return;
    ctx.fillStyle = `rgb(${Math.round(r / samples)},${Math.round(g / samples)},${Math.round(b / samples)})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    bumpSource();
  };

  const cloneAt = (x: number, y: number, size: number) => {
    const source = sourceRef.current as HTMLCanvasElement;
    const ctx = source.getContext("2d");
    const offset = cloneOffsetRef.current;
    if (!ctx || !offset) return;
    const sx = x - offset.x;
    const sy = y - offset.y;
    const half = size / 2;
    if (sx - half < 0 || sy - half < 0 || sx + half > source.width || sy + half > source.height) return;
    ctx.drawImage(source, sx - half, sy - half, size, size, x - half, y - half, size, size);
    bumpSource();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!sourceReady) return;
    const point = pointFromEvent(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    startRef.current = point;

    if (pickSource) {
      cloneSourceRef.current = point;
      setPickSource(false);
      setCloneSourceSet(true);
      return;
    }
    pushHistory();

    if (tool === "select") {
      const target = hitLayer(layers, point.x, point.y);
      setSelectedId(target?.id ?? null);
      if (target) {
        const bounds = layerBounds(target);
        dragRef.current = { id: target.id, dx: point.x - bounds.x, dy: point.y - bounds.y };
      }
      return;
    }

    if (tool === "text") {
      if (!textValue.trim()) {
        setError("Pehle text likhein.");
        return;
      }
      const layer: Layer = {
        id: uid(),
        type: "text",
        x: point.x,
        y: point.y,
        text: textValue.trim(),
        color: textColor,
        size: textSize,
      };
      setLayers((items) => [...items, layer]);
      setSelectedId(layer.id);
      setTool("select");
      setError("");
      return;
    }

    if (tool === "sticker") {
      const layer: Layer = {
        id: uid(),
        type: "sticker",
        x: point.x,
        y: point.y,
        text: sticker,
        color: "#ffffff",
        size: Math.max(32, Math.round((sourceRef.current as HTMLCanvasElement).height * 0.1)),
      };
      setLayers((items) => [...items, layer]);
      setSelectedId(layer.id);
      setTool("select");
      return;
    }

    if (tool === "brush") {
      drawingRef.current = true;
      setDraft({ id: uid(), type: "stroke", x: point.x, y: point.y, points: [[point.x, point.y]], color: brushColor, size: brushSize });
      return;
    }

    if (tool === "erase") {
      drawingRef.current = true;
      eraseAt(point.x, point.y, eraseSize / 2);
      return;
    }

    if (tool === "clone") {
      drawingRef.current = true;
      if (!cloneSourceRef.current) {
        cloneSourceRef.current = { x: point.x - 60, y: point.y - 60 };
      }
      cloneOffsetRef.current = { x: point.x - cloneSourceRef.current.x, y: point.y - cloneSourceRef.current.y };
      cloneAt(point.x, point.y, cloneSize);
      return;
    }

    if (tool === "shape" || tool === "crop") {
      drawingRef.current = true;
      setDraft({ id: uid(), type: shapeKind, x: point.x, y: point.y, w: 0, h: 0, color: shapeColor, size: shapeWidth });
      if (tool === "crop") setCropRect({ x: point.x, y: point.y, w: 0, h: 0 });
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current && !dragRef.current) return;
    const point = pointFromEvent(event);
    const start = startRef.current;

    if (dragRef.current) {
      const drag = dragRef.current;
      setLayers((items) =>
        items.map((item) => {
          if (item.id !== drag.id) return item;
          if (item.type === "stroke") {
            const dx = point.x - drag.dx - (item.points?.[0][0] ?? 0);
            const dy = point.y - drag.dy - (item.points?.[0][1] ?? 0);
            return {
              ...item,
              x: point.x - drag.dx,
              y: point.y - drag.dy,
              points: item.points?.map(([px, py]) => [px + dx, py + dy] as [number, number]),
            };
          }
          return { ...item, x: point.x - drag.dx, y: point.y - drag.dy };
        })
      );
      return;
    }

    if (tool === "brush") {
      setDraft((current) =>
        current ? { ...current, points: [...(current.points ?? []), [point.x, point.y]] } : current
      );
    } else if (tool === "erase") {
      eraseAt(point.x, point.y, eraseSize / 2);
    } else if (tool === "clone") {
      cloneAt(point.x, point.y, cloneSize);
    } else if ((tool === "shape" || tool === "crop") && start) {
      const next: Layer = {
        id: draft?.id ?? uid(),
        type: tool === "crop" ? "rect" : shapeKind,
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        w: Math.abs(point.x - start.x),
        h: Math.abs(point.y - start.y),
        color: shapeColor,
        size: shapeWidth,
      };
      if (tool === "shape") setDraft(next);
      else setCropRect({ x: next.x, y: next.y, w: next.w ?? 0, h: next.h ?? 0 });
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (tool === "brush" && draft) {
      setLayers((items) => [...items, draft]);
      setDraft(null);
    } else if (tool === "shape" && draft && (draft.w ?? 0) > 3 && (draft.h ?? 0) > 3) {
      setLayers((items) => [...items, draft]);
      setDraft(null);
      setTool("select");
    } else if (tool === "crop") {
      setDraft(null);
    }
    drawingRef.current = false;
    dragRef.current = null;
    startRef.current = null;
  };

  const addOrUpdateText = () => {
    if (!textValue.trim()) {
      setError("Text likhein.");
      return;
    }
    const source = sourceRef.current as HTMLCanvasElement;
    pushHistory();
    const selected = layers.find((item) => item.id === selectedId);
    if (selected?.type === "text") {
      setLayers((items) => items.map((item) => (item.id === selected.id ? { ...item, text: textValue.trim(), color: textColor, size: textSize } : item)));
    } else {
      const layer: Layer = {
        id: uid(),
        type: "text",
        x: source.width / 2,
        y: source.height * 0.82,
        text: textValue.trim(),
        color: textColor,
        size: textSize,
      };
      setLayers((items) => [...items, layer]);
      setSelectedId(layer.id);
    }
    setTool("select");
    setError("");
  };

  const applyCrop = () => {
    const source = sourceRef.current as HTMLCanvasElement;
    if (!cropRect || cropRect.w < 20 || cropRect.h < 20) {
      setError("Crop area chhota hai — dobara select karein.");
      return;
    }
    pushHistory();
    const ctx = source.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const data = ctx.getImageData(Math.round(cropRect.x), Math.round(cropRect.y), Math.round(cropRect.w), Math.round(cropRect.h));
    source.width = data.width;
    source.height = data.height;
    source.getContext("2d", { willReadFrequently: true })?.putImageData(data, 0, 0);
    setLayers((items) =>
      items.map((item) => ({
        ...item,
        x: item.x - cropRect.x,
        y: item.y - cropRect.y,
        points: item.points?.map(([px, py]) => [px - cropRect.x, py - cropRect.y] as [number, number]),
      }))
    );
    setCropRect(null);
    bumpSource();
    setError("");
  };

  const rotateImage = () => {
    const source = sourceRef.current as HTMLCanvasElement;
    pushHistory();
    const oldW = source.width;
    const oldH = source.height;
    const temp = document.createElement("canvas");
    temp.width = oldH;
    temp.height = oldW;
    temp.getContext("2d")?.drawImage(source, 0, 0);
    source.width = oldH;
    source.height = oldW;
    const ctx = source.getContext("2d");
    if (ctx) {
      ctx.translate(oldH, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(temp, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    setLayers((items) => items.map((item) => ({ ...item, x: oldH - item.y, y: item.x })));
    bumpSource();
  };

  const flipImage = () => {
    const source = sourceRef.current as HTMLCanvasElement;
    pushHistory();
    const temp = document.createElement("canvas");
    temp.width = source.width;
    temp.height = source.height;
    temp.getContext("2d")?.drawImage(source, 0, 0);
    const ctx = source.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, source.width, source.height);
      ctx.translate(source.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(temp, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    setLayers((items) =>
      items.map((item) => ({
        ...item,
        x: source.width - item.x,
        points: item.points?.map(([px, py]) => [source.width - px, py] as [number, number]),
      }))
    );
    bumpSource();
  };

  const updateAdjustment = (key: keyof Adjustments, value: number) => {
    setAdjustments((current) => ({ ...current, [key]: value }));
  };

  const resetAll = () => {
    const original = image?.url;
    if (!original) return;
    const element = new Image();
    element.onload = () => {
      const canvas = sourceRef.current ?? document.createElement("canvas");
      sourceRef.current = canvas;
      const maxSide = 1600;
      const scale = Math.min(1, maxSide / Math.max(element.naturalWidth, element.naturalHeight));
      canvas.width = Math.max(1, Math.round(element.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(element.naturalHeight * scale));
      canvas.getContext("2d", { willReadFrequently: true })?.drawImage(element, 0, 0, canvas.width, canvas.height);
      setSourceSize({ w: canvas.width, h: canvas.height });
      setLayers([]);
      setSelectedId(null);
      setAdjustments(DEFAULT_ADJUSTMENTS);
      setCropRect(null);
      bumpSource();
    };
    element.src = original;
  };

  const buildResult = async (): Promise<StudioImage | null> => {
    const source = sourceRef.current;
    if (!source || !sourceReady) {
      setError("Pehle ek image add karein.");
      return null;
    }
    const output = document.createElement("canvas");
    output.width = source.width;
    output.height = source.height;
    const ctx = output.getContext("2d");
    if (!ctx) return null;
    ctx.filter = filterString(adjustments);
    ctx.drawImage(source, 0, 0);
    ctx.filter = "none";
    layers.forEach((layer) => drawLayer(ctx, layer, false));
    const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, "image/png"));
    if (!blob) {
      setError("Image export nahi ho paya.");
      return null;
    }
    const name = `chat-master-edited-${(image?.name ?? "image").replace(/\.[^.]+$/, "")}.png`;
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
    const summary = layers
      .map((layer) => layer.text || layer.label)
      .filter(Boolean)
      .join(" ");
    onInsert?.(created.url, created.name, summary);
    onClose();
  };

  const sendToReel = async () => {
    const created = result ?? (await buildResult());
    if (!created) return;
    if (!result) setResult(created);
    insertedRef.current = true;
    const summary = layers
      .map((layer) => layer.text || layer.label)
      .filter(Boolean)
      .join(" ");
    onSendToReel?.(created.url, created.name, summary);
    onClose();
  };

  const pickImage = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Sirf image file chuniye.");
      return;
    }
    setImage({ name: file.name, url: URL.createObjectURL(file) });
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  if (!open) return null;

  const selectedLayer = layers.find((layer) => layer.id === selectedId);

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
          <div className="modal-title"><Wand2 size={18} /> Photo Editor — add karein, hataayein, badlein</div>
          <button className="icon-btn" onClick={onClose} aria-label="Band karein"><X size={18} /></button>
        </header>

        <div className="studio-body editor-body">
          <div className="studio-controls">
            <div className="studio-row">
              <button type="button" className="studio-btn" onClick={() => inputRef.current?.click()}>
                <ImagePlus size={15} /> {image ? "Image badlein" : "Image upload karein"}
              </button>
              {image && <span className="studio-file-chip">{image.name}</span>}
              <input ref={inputRef} type="file" accept="image/*" hidden onChange={(event) => pickImage(event.target.files)} />
            </div>

            <h3>1. Tools</h3>
            <div className="editor-tools">
              {TOOLS.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`studio-btn editor-tool ${tool === item.id ? "primary" : ""}`}
                    onClick={() => { setTool(item.id); setCropRect(null); }}
                    title={item.label}
                  >
                    <Icon size={14} /> {item.label}
                  </button>
                );
              })}
            </div>

            <div className="editor-panel">
              <p className="modal-note">
                🧠 Quick add — click karke object image par rakhein, phir drag karke adjust karein.
              </p>
              <div className="studio-row">
                {QUICK_IMAGE_OBJECTS.slice(0, 6).map((object) => (
                  <button
                    key={object.id}
                    type="button"
                    className="studio-btn"
                    onClick={() => addObjectLayer(object)}
                    aria-label={`Quick add ${object.label}`}
                  >
                    + {object.kind === "image" ? "🔫" : object.emoji} {object.label}
                  </button>
                ))}
              </div>
            </div>

            {tool === "select" && (
              <div className="editor-panel">
                <p className="modal-note">Layer par click karke select karein, phir drag karke move. Delete ya Backspace se hataayein.</p>
                {selectedLayer && (
                  <div className="editor-layer-selected">
                    <span>
                      Selected: {selectedLayer.label ?? selectedLayer.type}{" "}
                      {selectedLayer.text ? `“${selectedLayer.text.slice(0, 24)}”` : ""}
                    </span>
                    <button type="button" className="studio-btn" onClick={deleteSelected}><Trash2 size={13} /> Hataayein</button>
                  </div>
                )}
              </div>
            )}

            {tool === "text" && (
              <div className="editor-panel">
                <textarea
                  className="modal-textarea"
                  rows={3}
                  value={textValue}
                  onChange={(event) => setTextValue(event.target.value.slice(0, 400))}
                  placeholder="Jo likhna hai…"
                  aria-label="Image par likhne ke liye script"
                />
                <div className="studio-settings">
                  <label><span>Size</span><input type="range" min={16} max={180} value={textSize} onChange={(e) => setTextSize(Number(e.target.value))} /></label>
                  <label><span>Colour</span><input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} /></label>
                </div>
                <div className="studio-row">
                  <button type="button" className="studio-btn accent" onClick={addOrUpdateText}><Type size={14} /> {selectedLayer?.type === "text" ? "Text update karein" : "Text add karein"}</button>
                </div>
                <p className="modal-note">Ya directly image par click karke text place karein.</p>
              </div>
            )}

            {tool === "brush" && (
              <div className="editor-panel studio-settings">
                <label><span>Brush size</span><input type="range" min={2} max={80} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} /></label>
                <label><span>Colour</span><input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} /></label>
              </div>
            )}

            {tool === "erase" && (
              <div className="editor-panel">
                <label className="editor-range"><span>Erase size</span><input type="range" min={8} max={160} value={eraseSize} onChange={(e) => setEraseSize(Number(e.target.value))} /></label>
                <p className="modal-note">Brush se object/color hatayein — aas-paas ke colours se fill hota hai. Complex background ke liye Clone use karein.</p>
              </div>
            )}

            {tool === "clone" && (
              <div className="editor-panel">
                <div className="studio-row">
                  <button type="button" className={`studio-btn ${pickSource ? "primary" : ""}`} onClick={() => setPickSource(true)}>
                    <MousePointer2 size={14} /> {pickSource ? "Source click karein…" : "Source pick karein"}
                  </button>
                  {cloneSourceSet && <span className="studio-file-chip">Source set ✓</span>}
                </div>
                <label className="editor-range"><span>Clone size</span><input type="range" min={10} max={180} value={cloneSize} onChange={(e) => setCloneSize(Number(e.target.value))} /></label>
                <p className="modal-note">Source pick karein, phir jahan copy karna hai wahan drag karein.</p>
              </div>
            )}

            {tool === "shape" && (
              <div className="editor-panel">
                <div className="studio-row">
                  {(["rect", "ellipse", "arrow"] as ShapeKind[]).map((kind) => (
                    <button key={kind} type="button" className={`studio-btn ${shapeKind === kind ? "primary" : ""}`} onClick={() => setShapeKind(kind)}>
                      {kind === "rect" ? "▭ Rectangle" : kind === "ellipse" ? "◯ Circle" : "↗ Arrow"}
                    </button>
                  ))}
                </div>
                <div className="studio-settings">
                  <label><span>Stroke</span><input type="range" min={2} max={40} value={shapeWidth} onChange={(e) => setShapeWidth(Number(e.target.value))} /></label>
                  <label><span>Colour</span><input type="color" value={shapeColor} onChange={(e) => setShapeColor(e.target.value)} /></label>
                </div>
                <p className="modal-note">Image par drag karke shape banayein.</p>
              </div>
            )}

            {tool === "sticker" && (
              <div className="editor-panel">
                <div className="editor-stickers">
                  {STICKERS.map((item) => (
                    <button key={item} type="button" className={`sticker-btn ${sticker === item ? "active" : ""}`} onClick={() => setSticker(item)} aria-label={`Sticker ${item}`}>
                      {item}
                    </button>
                  ))}
                </div>
                <p className="modal-note">Sticker chunke image par click karein.</p>
              </div>
            )}

            {tool === "crop" && (
              <div className="editor-panel">
                <p className="modal-note">Image par drag karke area chunein, phir Apply crop dabayein.</p>
                <button type="button" className="studio-btn primary" onClick={applyCrop}><Crop size={14} /> Apply crop</button>
              </div>
            )}

            <h3>2. Filters</h3>
            <div className="studio-row">
              {FILTER_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  className={`studio-btn ${JSON.stringify(preset.values) === JSON.stringify(adjustments) ? "primary" : ""}`}
                  onClick={() => { pushHistory(); setAdjustments(preset.values); }}
                >
                  {preset.name}
                </button>
              ))}
            </div>
            <div className="editor-sliders">
              {([
                ["brightness", "Brightness", 50, 160],
                ["contrast", "Contrast", 50, 160],
                ["saturate", "Saturation", 0, 200],
                ["blur", "Blur", 0, 10],
                ["grayscale", "B&W", 0, 100],
                ["sepia", "Sepia", 0, 100],
              ] as Array<[keyof Adjustments, string, number, number]>).map(([key, label, min, max]) => (
                <label key={key} className="editor-range">
                  <span>{label}</span>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    value={adjustments[key]}
                    onPointerDown={() => pushHistory()}
                    onChange={(event) => updateAdjustment(key, Number(event.target.value))}
                  />
                </label>
              ))}
            </div>

            <h3>3. Actions</h3>
            <div className="studio-row">
              <button type="button" className="studio-btn" onClick={() => void undo()} disabled={!history.length}><Undo2 size={14} /> Undo</button>
              <button type="button" className="studio-btn" onClick={() => void redo()} disabled={!future.length}><Redo2 size={14} /> Redo</button>
              <button type="button" className="studio-btn" onClick={rotateImage}><RotateCw size={14} /> Rotate</button>
              <button type="button" className="studio-btn" onClick={flipImage}><FlipHorizontal size={14} /> Flip</button>
              <button type="button" className="studio-btn" onClick={resetAll}><ArrowLeftRight size={14} /> Reset</button>
            </div>

            {error && <p className="studio-error">{error}</p>}

            <div className="studio-actions">
              <button type="button" className="studio-btn primary" onClick={() => void createImage()} disabled={!sourceReady}>
                <Sparkles size={15} /> Image banaayein
              </button>
              {result && (
                <>
                  <a className="studio-btn" href={result.url} download={result.name}><Download size={15} /> Download</a>
                  <button type="button" className="studio-btn accent" onClick={() => void insert()}><Check size={15} /> Chat me daalein</button>
                  <button type="button" className="studio-btn" onClick={() => void sendToReel()}><Film size={15} /> Reel banayein</button>
                </>
              )}
            </div>
          </div>

          <div className="studio-preview">
            <div className="preview-frame editor-canvas-frame" style={{ cursor: tool === "select" ? "default" : "crosshair" }}>
              {sourceReady ? (
                <canvas
                  ref={canvasRef}
                  aria-label="Photo editor canvas"
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                />
              ) : (
                <div className="studio-empty"><Palette size={28} /><span>Koi image upload karein ya chat se photo bhejein</span></div>
              )}
            </div>
            {sourceSize.w > 0 && <p className="modal-note">{sourceSize.w} × {sourceSize.h}px · {layers.length} layers · sab edits browser me</p>}
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
