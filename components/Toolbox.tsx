"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Braces,
  CaseSensitive,
  Check,
  Clipboard,
  Clock3,
  Copy,
  Download,
  FileText,
  Hash,
  KeyRound,
  Link2,
  ListOrdered,
  Palette,
  Percent,
  Regex,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import Markdown from "@/components/Markdown";

export type ToolId =
  | "json"
  | "base64"
  | "hash"
  | "uuid"
  | "password"
  | "regex"
  | "count"
  | "case"
  | "url"
  | "color"
  | "percent"
  | "date"
  | "slug"
  | "lorem"
  | "bases"
  | "markdown";

interface ToolDef {
  id: ToolId;
  label: string;
  hint: string;
  icon: typeof Braces;
  placeholder: string;
  lines?: number;
}

const TOOLS: ToolDef[] = [
  { id: "json", label: "JSON Format", hint: "Validate + pretty print", icon: Braces, placeholder: '{"naam":"Chat-Master","count":42}', lines: 8 },
  { id: "base64", label: "Base64", hint: "Encode / decode Unicode", icon: ShieldCheck, placeholder: "Yahan text ya base64 daalein…", lines: 6 },
  { id: "hash", label: "Hash", hint: "SHA-256 / SHA-1", icon: Hash, placeholder: "Hash karne ka text…", lines: 5 },
  { id: "uuid", label: "UUID", hint: "Random IDs generate karein", icon: KeyRound, placeholder: "Kitne UUID chahiye? (1–100)", lines: 2 },
  { id: "password", label: "Password", hint: "Strong random password", icon: KeyRound, placeholder: "Length, e.g. 20", lines: 2 },
  { id: "regex", label: "Regex Tester", hint: "Pattern + flags se match", icon: Regex, placeholder: "Test karne ka text…", lines: 6 },
  { id: "count", label: "Word Counter", hint: "Words, chars, lines, read time", icon: ListOrdered, placeholder: "Text paste karein…", lines: 8 },
  { id: "case", label: "Case Converter", hint: "upper / title / camel / snake", icon: CaseSensitive, placeholder: "Hello duniya chat master", lines: 5 },
  { id: "url", label: "URL Encode", hint: "Encode / decode", icon: Link2, placeholder: "https://example.com/a b?q=hi there", lines: 4 },
  { id: "color", label: "Color Converter", hint: "HEX ↔ RGB ↔ HSL", icon: Palette, placeholder: "#7c8cff ya rgb(124,140,255)", lines: 2 },
  { id: "percent", label: "Percentage", hint: "20% of 150 ya 50 → 60", icon: Percent, placeholder: "20% of 150", lines: 2 },
  { id: "date", label: "Date Calc", hint: "Date add / difference", icon: Clock3, placeholder: "2026-01-01 +45 days  ya  2026-01-01 to 2026-11-23", lines: 2 },
  { id: "slug", label: "Slug Generator", hint: "URL-friendly text", icon: Link2, placeholder: "Mera Naya Blog! Post #1", lines: 3 },
  { id: "lorem", label: "Lorem Ipsum", hint: "Placeholder text", icon: FileText, placeholder: "Paragraph count, e.g. 3", lines: 2 },
  { id: "bases", label: "Number Bases", hint: "decimal / binary / hex / octal", icon: Hash, placeholder: "255", lines: 2 },
  { id: "markdown", label: "Markdown Preview", hint: "Live render dekhein", icon: FileText, placeholder: "## Heading\n\n**Bold** aur `code`", lines: 8 },
];

const LOREM =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.";

function encodeBase64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(text: string) {
  const binary = atob(text.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function digest(text: string, algorithm: "SHA-256" | "SHA-1") {
  if (!globalThis.crypto?.subtle) throw new Error("Is browser me Web Crypto available nahi hai.");
  const buffer = await crypto.subtle.digest(algorithm, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function toTitle(text: string) {
  return text.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function toCamel(text: string) {
  const words = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  return words.map((word, i) => (i ? word.charAt(0).toUpperCase() + word.slice(1) : word)).join("");
}

function toSnake(text: string, separator = "_") {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, `$1${separator}$2`)
    .replace(/[^a-z0-9]+/g, separator)
    .replace(new RegExp(`^${separator}|${separator}$`, "g"), "");
}

function parseColor(input: string): { hex: string; rgb: string; hsl: string } | null {
  const raw = input.trim();
  let r = 0;
  let g = 0;
  let b = 0;
  const hex = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  const rgb = raw.match(/^rgb\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*\)$/i);
  const hsl = raw.match(/^hsl\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})%\s*[, ]\s*(\d{1,3})%\s*\)$/i);

  if (hex) {
    const value = hex[1].length === 3 ? hex[1].split("").map((c) => c + c).join("") : hex[1];
    r = parseInt(value.slice(0, 2), 16);
    g = parseInt(value.slice(2, 4), 16);
    b = parseInt(value.slice(4, 6), 16);
  } else if (rgb) {
    [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  } else if (hsl) {
    const h = Number(hsl[1]) / 360;
    const s = Number(hsl[2]) / 100;
    const l = Number(hsl[3]) / 100;
    const hue = (p: number, q: number, t: number) => {
      let value = t;
      if (value < 0) value += 1;
      if (value > 1) value -= 1;
      if (value < 1 / 6) return p + (q - p) * 6 * value;
      if (value < 1 / 2) return q;
      if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = Math.round(hue(p, q, h + 1 / 3) * 255);
    g = Math.round(hue(p, q, h) * 255);
    b = Math.round(hue(p, q, h - 1 / 3) * 255);
  } else {
    return null;
  }
  if ([r, g, b].some((value) => !Number.isFinite(value) || value < 0 || value > 255)) return null;

  const toHex = (value: number) => Math.round(value).toString(16).padStart(2, "0");
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === rn) hue = ((gn - bn) / delta) % 6;
    else if (max === gn) hue = (bn - rn) / delta + 2;
    else hue = (rn - gn) / delta + 4;
  }
  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;
  const light = (max + min) / 2;
  const sat = delta === 0 ? 0 : delta / (1 - Math.abs(2 * light - 1));

  return {
    hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`,
    rgb: `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`,
    hsl: `hsl(${hue}, ${Math.round(sat * 100)}%, ${Math.round(light * 100)}%)`,
  };
}

function computeResult(
  tool: ToolId,
  input: string,
  mode: string,
  flags: string
): { output: string; isMarkdown?: boolean; color?: string } {
  const value = input.trim();
  if (!value) return { output: "" };

  switch (tool) {
    case "json": {
      try {
        const parsed = JSON.parse(input);
        return { output: JSON.stringify(parsed, null, 2) };
      } catch (error) {
        return { output: `❌ Invalid JSON: ${(error as Error).message}` };
      }
    }
    case "base64": {
      try {
        return { output: mode === "decode" ? decodeBase64(value) : encodeBase64(input) };
      } catch {
        return { output: "❌ Base64 decode fail — input sahi hai ya nahi check karein." };
      }
    }
    case "hash": {
      return { output: "…" };
    }
    case "uuid": {
      const count = Math.min(100, Math.max(1, Number(value) || 1));
      if (!globalThis.crypto?.randomUUID) return { output: "Is browser me crypto.randomUUID available nahi hai." };
      return { output: Array.from({ length: count }, () => crypto.randomUUID()).join("\n") };
    }
    case "password": {
      const length = Math.min(128, Math.max(6, Number(value) || 16));
      const sets: Record<string, string> = {
        lower: "abcdefghijkmnopqrstuvwxyz",
        upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
        digits: "23456789",
        symbols: "!@#$%^&*()-_=+[]{}",
      };
      const bank = Object.entries(sets)
        .filter(([key]) => mode === "all" || mode === key)
        .map(([, chars]) => chars)
        .join("");
      const chars = bank || sets.lower + sets.upper + sets.digits;
      const bytes = new Uint32Array(length);
      crypto.getRandomValues(bytes);
      const password = Array.from(bytes, (byte) => chars[byte % chars.length]).join("");
      return { output: password };
    }
    case "regex": {
      const source = mode.trim() || value;
      const text = mode.trim() ? input : "";
      try {
        const expression = new RegExp(source, flags.includes("g") ? flags : `${flags}g`);
        const matches = Array.from(text.matchAll(expression));
        if (!matches.length) return { output: "Koi match nahi mila." };
        return {
          output: matches
            .slice(0, 100)
            .map((match, index) => `${index + 1}. "${match[0]}" @ ${match.index}`)
            .join("\n"),
        };
      } catch (error) {
        return { output: `❌ Invalid regex: ${(error as Error).message}` };
      }
    }
    case "count": {
      const words = input.trim().split(/\s+/).filter(Boolean).length;
      const chars = Array.from(input).length;
      const lines = input.split(/\r?\n/).length;
      const paragraphs = input.split(/\n\s*\n/).filter((part) => part.trim()).length;
      const minutes = Math.max(1, Math.ceil(words / 220));
      return {
        output: [
          `Words       : ${words}`,
          `Characters  : ${chars}`,
          `Chars (no spaces): ${Array.from(input.replace(/\s/g, "")).length}`,
          `Lines       : ${lines}`,
          `Paragraphs  : ${paragraphs}`,
          `Read time   : ~${minutes} min`,
        ].join("\n"),
      };
    }
    case "case": {
      const outputs: Record<string, string> = {
        upper: input.toUpperCase(),
        lower: input.toLowerCase(),
        title: toTitle(input),
        camel: toCamel(input),
        snake: toSnake(input),
        kebab: toSnake(input, "-"),
      };
      return { output: outputs[mode] ?? outputs.title };
    }
    case "url": {
      try {
        return { output: mode === "decode" ? decodeURIComponent(value) : encodeURIComponent(input) };
      } catch {
        return { output: "❌ Invalid percent-encoded input." };
      }
    }
    case "color": {
      const color = parseColor(value);
      if (!color) return { output: "❌ Color parse nahi hua. Example: #7c8cff ya rgb(124,140,255)" };
      return {
        output: `HEX : ${color.hex}\nRGB : ${color.rgb}\nHSL : ${color.hsl}`,
        color: color.hex,
      };
    }
    case "percent": {
      const ofMatch = value.match(/^([\d.]+)\s*%\s*(?:of|ka)\s*([\d.,-]+)$/i);
      if (ofMatch) {
        const result = (Number(ofMatch[1]) / 100) * Number(ofMatch[2].replace(/,/g, ""));
        return { output: `${ofMatch[1]}% of ${ofMatch[2]} = **${Number(result.toFixed(4))}**` };
      }
      const changeMatch = value.match(/^(-?[\d.,]+)\s*(?:to|se|→)\s*(-?[\d.,]+)$/i);
      if (changeMatch) {
        const from = Number(changeMatch[1].replace(/,/g, ""));
        const to = Number(changeMatch[2].replace(/,/g, ""));
        const change = ((to - from) / Math.abs(from || 1)) * 100;
        return { output: `${from} → ${to} = **${change >= 0 ? "+" : ""}${change.toFixed(2)}%**` };
      }
      return { output: "Format: `20% of 150` ya `50 to 60`" };
    }
    case "date": {
      const addMatch = value.match(/^(\d{4}-\d{2}-\d{2})\s*([+-])\s*(\d+)\s*(day|days|week|weeks|month|months)$/i);
      if (addMatch) {
        const date = new Date(`${addMatch[1]}T00:00:00Z`);
        const amount = Number(addMatch[3]) * (addMatch[4].toLowerCase().startsWith("week") ? 7 : 1) * (addMatch[2] === "-" ? -1 : 1);
        if (addMatch[4].toLowerCase().startsWith("month")) date.setUTCMonth(date.getUTCMonth() + amount);
        else date.setUTCDate(date.getUTCDate() + amount);
        return { output: date.toISOString().slice(0, 10) };
      }
      const diffMatch = value.match(/^(\d{4}-\d{2}-\d{2})\s*(?:to|se|→|-)\s*(\d{4}-\d{2}-\d{2})$/i);
      if (diffMatch) {
        const first = new Date(`${diffMatch[1]}T00:00:00Z`).getTime();
        const second = new Date(`${diffMatch[2]}T00:00:00Z`).getTime();
        if (Number.isNaN(first) || Number.isNaN(second)) return { output: "❌ Date invalid." };
        const days = Math.round(Math.abs(second - first) / 86_400_000);
        return { output: `${days} din (${(days / 7).toFixed(1)} hafte, ~${(days / 30.44).toFixed(1)} mahine)` };
      }
      return { output: "Format: `2026-01-01 +45 days` ya `2026-01-01 to 2026-11-23`" };
    }
    case "slug":
      return { output: toSnake(input, "-") };
    case "lorem": {
      const count = Math.min(20, Math.max(1, Number(value) || 1));
      return { output: Array.from({ length: count }, () => LOREM).join("\n\n") };
    }
    case "bases": {
      const number = Number(value.replace(/,/g, ""));
      if (!Number.isFinite(number) || !Number.isInteger(number)) return { output: "❌ Poora number daalein." };
      return {
        output: [
          `Decimal : ${number}`,
          `Binary  : ${number.toString(2)}`,
          `Hex     : 0x${number.toString(16).toUpperCase()}`,
          `Octal   : 0o${number.toString(8)}`,
        ].join("\n"),
      };
    }
    case "markdown":
      return { output: input, isMarkdown: true };
    default:
      return { output: "" };
  }
}

interface Props {
  open: boolean;
  initialTool?: ToolId;
  onClose: () => void;
  onInsert?: (name: string, output: string) => void;
}

export default function Toolbox({ open, initialTool = "json", onClose, onInsert }: Props) {
  const [active, setActive] = useState<ToolId>(initialTool);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState(initialTool === "regex" ? "" : "encode");
  const [flags, setFlags] = useState("gi");
  const [copied, setCopied] = useState(false);
  const [hashOutput, setHashOutput] = useState("");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tool = TOOLS.find((item) => item.id === active) ?? TOOLS[0];

  // Synchronous tools are derived directly — no state syncing in effects.
  const syncResult = useMemo(
    () => (active === "hash" ? { output: "" } : computeResult(active, input, mode, flags)),
    [active, input, mode, flags]
  );

  // Hashing is the only async tool; state is updated inside the promise callback.
  useEffect(() => {
    if (!open || active !== "hash" || !input.trim()) return;
    let cancelled = false;
    digest(input, mode === "sha1" ? "SHA-1" : "SHA-256")
      .then((output) => {
        if (!cancelled) setHashOutput(output);
      })
      .catch((error: Error) => {
        if (!cancelled) setHashOutput(`❌ ${error.message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [active, input, mode, open]);

  const result =
    active === "hash"
      ? { output: input.trim() ? hashOutput || "…" : "" }
      : syncResult;

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const showMode = useMemo(
    () => ["base64", "hash", "case", "url", "password"].includes(active),
    [active]
  );

  const copyResult = async () => {
    if (!result.output || result.output === "…") return;
    try {
      await navigator.clipboard.writeText(result.output);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const downloadResult = () => {
    if (!result.output) return;
    const url = URL.createObjectURL(new Blob([result.output], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `chat-master-${active}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="toolbox-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Toolbox"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div className="modal-title"><Sparkles size={18} /> Toolbox — 16 free tools</div>
          <button className="icon-btn" onClick={onClose} aria-label="Band karein"><X size={18} /></button>
        </header>

        <div className="toolbox-body">
          <nav className="toolbox-nav" aria-label="Tools">
            {TOOLS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === active ? "active" : ""}
                  onClick={() => {
                    setActive(item.id);
                    setInput("");
                    setMode(item.id === "regex" ? "" : "encode");
                    setCopied(false);
                  }}
                  title={item.hint}
                >
                  <Icon size={15} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="toolbox-panel">
            <div className="toolbox-panel-head">
              <div>
                <h3>{tool.label}</h3>
                <p className="modal-note">{tool.hint}</p>
              </div>
              {showMode && (
                <div className="toolbox-modes">
                  {active === "hash" ? (
                    <>
                      <button type="button" className={mode !== "sha1" ? "active" : ""} onClick={() => setMode("sha256")}>SHA-256</button>
                      <button type="button" className={mode === "sha1" ? "active" : ""} onClick={() => setMode("sha1")}>SHA-1</button>
                    </>
                  ) : active === "password" ? (
                    <>
                      {["all", "lower", "upper", "digits", "symbols"].map((option) => (
                        <button key={option} type="button" className={mode === option ? "active" : ""} onClick={() => setMode(option)}>
                          {option === "all" ? "All" : option}
                        </button>
                      ))}
                    </>
                  ) : active === "case" ? (
                    <>
                      {["upper", "lower", "title", "camel", "snake", "kebab"].map((option) => (
                        <button key={option} type="button" className={mode === option ? "active" : ""} onClick={() => setMode(option)}>
                          {option}
                        </button>
                      ))}
                    </>
                  ) : (
                    <>
                      <button type="button" className={mode === "encode" ? "active" : ""} onClick={() => setMode("encode")}>
                        {active === "base64" ? "Encode" : "Encode"}
                      </button>
                      <button type="button" className={mode === "decode" ? "active" : ""} onClick={() => setMode("decode")}>Decode</button>
                    </>
                  )}
                </div>
              )}
            </div>

            {active === "regex" && (
              <div className="toolbox-regex">
                <input
                  className="studio-input"
                  value={mode}
                  onChange={(event) => setMode(event.target.value)}
                  placeholder="Pattern, e.g. \\b\\w+@\\w+\\.com\\b"
                  aria-label="Regex pattern"
                />
                <input
                  className="studio-input"
                  value={flags}
                  onChange={(event) => setFlags(event.target.value.replace(/[^gimsuy]/g, ""))}
                  placeholder="flags"
                  aria-label="Regex flags"
                />
              </div>
            )}

            {active === "markdown" ? (
              <div className="toolbox-markdown">
                <textarea
                  className="modal-textarea"
                  rows={10}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={tool.placeholder}
                  aria-label="Markdown input"
                />
                <div className="toolbox-output markdown-body">
                  {result.output ? <Markdown content={result.output} /> : <span className="toolbox-empty">Preview yahan dikhega…</span>}
                </div>
              </div>
            ) : (
              <>
                <textarea
                  className="modal-textarea"
                  rows={tool.lines ?? 6}
                  value={input}
                  onChange={(event) => {
                    setInput(event.target.value);
                    if (active === "hash") setHashOutput("");
                  }}
                  placeholder={tool.placeholder}
                  aria-label={`${tool.label} input`}
                />
                <div className="toolbox-output-wrap">
                  {result.color && <span className="toolbox-color" style={{ background: result.color }} />}
                  <pre className="toolbox-output">{result.output || <span className="toolbox-empty">Result yahan dikhega…</span>}</pre>
                </div>
              </>
            )}

            <div className="toolbox-actions">
              <button type="button" className="studio-btn primary" onClick={() => void copyResult()} disabled={!result.output}>
                {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied!" : "Copy"}
              </button>
              <button type="button" className="studio-btn" onClick={downloadResult} disabled={!result.output}>
                <Download size={15} /> Download .txt
              </button>
              {onInsert && (
                <button
                  type="button"
                  className="studio-btn accent"
                  disabled={!result.output || result.output === "…"}
                  onClick={() => {
                    onInsert(tool.label, result.output);
                    onClose();
                  }}
                >
                  <Send size={15} /> Chat me daalein
                </button>
              )}
              <button type="button" className="studio-btn" onClick={() => setInput("")} disabled={!input}>
                <Trash2 size={15} /> Clear
              </button>
              <span className="toolbox-tip"><Clipboard size={13} /> Sab kuch browser me hota hai — koi data upload nahi.</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
