import type { ToolResult } from "@/lib/tools";

export type Role = "user" | "assistant";

export interface Attachment {
  name: string;
  type: string;
  size: number;
  text?: string;
  analysis?: string;
  url?: string;
  pages?: number;
}

export interface Source {
  title: string;
  url: string;
}

export interface MediaAsset {
  type: "image" | "video";
  url: string;
  prompt: string;
  fileName?: string;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  searched?: boolean;
  sources?: Source[];
  media?: MediaAsset;
  attachments?: Attachment[];
  tools?: ToolResult[];
  edited?: boolean;
  feedback?: "up" | "down";
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
}

export interface FeatureStatus {
  chat: boolean;
  search: boolean;
  image: boolean;
  video: boolean;
  voiceInput: boolean;
  voiceOutput: boolean;
  tools: boolean;
  files: boolean;
}

export interface StoredState {
  chats: Chat[];
  activeId: string | null;
}

const STORAGE_KEY = "chat-master:chats:v1";

export const EMPTY_STATUS: FeatureStatus = {
  chat: true,
  search: true,
  image: true,
  video: true,
  voiceInput: false,
  voiceOutput: false,
  tools: true,
  files: true,
};

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createChat(): Chat {
  const now = Date.now();
  return { id: newId(), title: "New chat", messages: [], createdAt: now, updatedAt: now };
}

export function makeMessage(role: Role, content: string, extra?: Partial<Message>): Message {
  return { id: newId(), role, content, createdAt: Date.now(), ...extra };
}

export function titleFromMessage(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
  return clean.length > 42 ? `${clean.slice(0, 42).trimEnd()}…` : clean;
}

function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<Message>;
  return (
    typeof m.id === "string" &&
    (m.role === "user" || m.role === "assistant") &&
    typeof m.content === "string" &&
    typeof m.createdAt === "number"
  );
}

function isChat(value: unknown): value is Chat {
  if (!value || typeof value !== "object") return false;
  const c = value as Partial<Chat>;
  return (
    typeof c.id === "string" &&
    typeof c.title === "string" &&
    Array.isArray(c.messages) &&
    c.messages.every(isMessage) &&
    typeof c.createdAt === "number" &&
    typeof c.updatedAt === "number"
  );
}

export function loadState(): StoredState {
  if (typeof window === "undefined") return { chats: [], activeId: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { chats: [], activeId: null };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { chats: [], activeId: null };
    const data = parsed as Partial<StoredState>;
    const chats = Array.isArray(data.chats) ? data.chats.filter(isChat) : [];
    const activeId =
      typeof data.activeId === "string" && chats.some((c) => c.id === data.activeId)
        ? data.activeId
        : (chats[0]?.id ?? null);
    return { chats, activeId };
  } catch {
    return { chats: [], activeId: null };
  }
}

function stripBlobUrls(state: StoredState): StoredState {
  return {
    ...state,
    chats: state.chats.map((chat) => ({
      ...chat,
      messages: chat.messages.map((m) => {
        const attachments = m.attachments?.map((file) => ({
          ...file,
          url: file.url?.startsWith("blob:") ? undefined : file.url,
          text: file.text?.slice(0, 20000),
        }));
        return {
          ...m,
          media: m.media?.url.startsWith("blob:") ? undefined : m.media,
          attachments: attachments?.length ? attachments : undefined,
        };
      }),
    })),
  };
}

export function saveState(state: StoredState): void {
  if (typeof window === "undefined") return;
  try {
    // Blob URLs are only valid for this tab session — never persist broken links.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stripBlobUrls(state)));
  } catch {
    // Storage full or blocked (private mode) — chat still works in memory.
  }
}

/** Normalize an imported backup: validate messages, dedupe IDs, drop blob URLs. */
export function sanitizeImportedChats(input: unknown): Chat[] {
  const raw = Array.isArray(input)
    ? input
    : input && typeof input === "object" && Array.isArray((input as { chats?: unknown }).chats)
      ? (input as { chats: unknown[] }).chats
      : [];
  const seen = new Set<string>();
  const now = Date.now();
  const chats: Chat[] = [];

  for (const item of raw.slice(0, 200)) {
    if (!isChat(item)) continue;
    const chat = item as Chat;
    let id = chat.id.slice(0, 120);
    if (seen.has(id)) id = newId();
    seen.add(id);
    const messageIds = new Set<string>();
    chats.push({
      id,
      title: chat.title.slice(0, 160) || "Imported chat",
      createdAt: Number.isFinite(chat.createdAt) ? chat.createdAt : now,
      updatedAt: Number.isFinite(chat.updatedAt) ? chat.updatedAt : now,
      pinned: Boolean(chat.pinned),
      messages: chat.messages.slice(0, 500).map((message) => {
        let messageId = String(message.id).slice(0, 120);
        if (messageIds.has(messageId)) messageId = newId();
        messageIds.add(messageId);
        return {
          ...message,
          id: messageId,
          content: String(message.content).slice(0, 30000),
          feedback: message.feedback === "up" || message.feedback === "down" ? message.feedback : undefined,
          media: message.media?.url.startsWith("blob:") ? undefined : message.media,
          attachments: message.attachments
            ?.map((file) => ({
              ...file,
              url: file.url?.startsWith("blob:") ? undefined : file.url,
              text: file.text?.slice(0, 20000),
            }))
            .filter((file) => file.text || file.url || file.name),
          sources: Array.isArray(message.sources) ? message.sources.slice(0, 10) : undefined,
          tools: Array.isArray(message.tools) ? message.tools.slice(0, 10) : undefined,
        };
      }),
    });
  }
  return chats;
}

export function chatsToMarkdown(chats: Chat[]): string {
  const sections = chats.map((chat) => {
    const header = `# ${chat.title}\n\n_Created: ${new Date(chat.createdAt).toLocaleString()} · ${chat.messages.length} messages_\n`;
    const body = chat.messages
      .map((message) => {
        const who = message.role === "user" ? "**You**" : "**Chat-Master**";
        const time = new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const files = message.attachments?.length
          ? `\n\n📎 ${message.attachments.map((file) => file.name).join(", ")}`
          : "";
        const tools = message.tools?.length
          ? `\n\n🧰 ${message.tools.map((tool) => `${tool.name}: ${tool.output.replace(/[*#`\n]+/g, " ")}`).join(" · ")}`
          : "";
        return `### ${who} · ${time}\n\n${message.content}${files}${tools}`;
      })
      .join("\n\n---\n\n");
    return `${header}\n${body || "_No messages yet._"}`;
  });
  return `# Chat-Master — Transcript\n\n_Exported: ${new Date().toLocaleString()} · ${chats.length} chats_\n\n---\n\n${sections.join("\n\n---\n\n")}\n`;
}

const DRAFT_PREFIX = "chat-master:draft:";

export function readDraft(chatId: string | null): string {
  if (typeof window === "undefined" || !chatId) return "";
  try {
    return window.localStorage.getItem(`${DRAFT_PREFIX}${chatId}`) ?? "";
  } catch {
    return "";
  }
}

export function writeDraft(chatId: string | null, text: string): void {
  if (typeof window === "undefined" || !chatId) return;
  try {
    const key = `${DRAFT_PREFIX}${chatId}`;
    if (text) window.localStorage.setItem(key, text);
    else window.localStorage.removeItem(key);
  } catch {
    // Storage blocked — draft stays in memory only.
  }
}

const SEARCH_WORDS = [
  "latest", "today", "news", "current", "search", "2026",
  "abhi", "aaj", "khabar", "mausam", "weather", "price", "score",
];

export function looksLikeSearch(text: string): boolean {
  const lower = text.toLowerCase();
  return SEARCH_WORDS.some((word) => lower.includes(word));
}

export function toApiMessages(messages: Message[]) {
  return messages
    .filter((m) => m.content.trim().length > 0 || m.attachments?.length)
    .slice(-40)
    .map((m) => {
      let content = m.content.slice(0, 12000);
      for (const file of m.attachments ?? []) {
        if (file.text) {
          content += `\n\n[Attached file: ${file.name}${file.pages ? `, ${file.pages} pages` : ""}]\n${file.text.slice(0, 12000)}`;
        } else if (file.type.startsWith("image/")) {
          content += `\n\n[Attached image: ${file.name}]\n${file.analysis ?? "No programmatic visual summary is available for this image."}`;
        } else {
          content += `\n\n[Attached file: ${file.name}]`;
        }
      }
      return { role: m.role, content: content.slice(0, 30000) };
    });
}

const VIDEO_WORDS = ["video", "vedio", "clip", "animation", "animated", "वीडियो", "विडियो"];
const IMAGE_WORDS = [
  "image", "photo", "picture", "poster", "wallpaper", "draw", "drawing", "art",
  "img", "dp", "bna", "bnao", "bana", "banao", "banwao", "banaye", "banayi", "kdi",
  "tasveer", "taswir", "chitra", "चित्र", "तस्वीर", "फोटो", "इमेज", "चित्र",
  "تصویر", "عکس",
];
const IMAGE_CREATION_PATTERN =
  /(?:\b(?:generate|create|make|draw|banao|banwao|banaye|bana|bna|bnao)\b.{0,60}\b(?:image|photo|picture|poster|img|wallpaper|tasveer|taswir|chitra|चित्र|तस्वीर|फोटो|इमेज)\b)|(?:\b(?:image|photo|picture|poster|img|wallpaper|tasveer|taswir|chitra|चित्र|तस्वीर|फोटो|इमेज)\b.{0,60}\b(?:banao|banwao|banaye|bana|bna|bnao|kdi|kar\s*do|do)\b)/i;

export function looksLikeVideoRequest(text: string): boolean {
  const lower = text.toLowerCase();
  // "video player ka code likho" should stay a coding request.
  if (/\b(code|program|script|function|api|html|css|player)\b/.test(lower)) return false;
  return VIDEO_WORDS.some((word) => lower.includes(word));
}

export function looksLikeImageRequest(text: string): boolean {
  const lower = text.toLowerCase().replace(/\s+/g, " ");
  // "image ke liye code likho" should stay a coding request.
  if (/\b(code|program|script|function|api|html|css)\b/.test(lower)) return false;
  if (IMAGE_WORDS.some((word) => lower.includes(word))) return true;
  return IMAGE_CREATION_PATTERN.test(lower);
}

const EDIT_WORDS =
  /(?:add|jo\s*de|jod|daal|lagao|lagaao|likh|write|put|overlay|caption|script|scripe?teo|text|title|heading|shayari|quote|poem|kavita|slogan|लिख|जोड़|डाल|शायरी|कैप्शन|स्क्रिप्ट)/i;

/** Image attached + "is pic me script add karo" → open the editor, don't chat about it. */
export function looksLikeImageEditRequest(text: string): boolean {
  return EDIT_WORDS.test(text);
}

/** Pull the actual words to draw out of a Hinglish editing instruction. */
export function scriptFromImageRequest(text: string): string {
  const quoted = /["“']([^"”']{3,})["”']/.exec(text)?.[1];
  if (quoted) return quoted.trim();

  const cleaned = text
    .replace(/\b(?:is|ye|this|us)\s+(?:pic|photo|image|picture|tasveer|तस्वीर)\s+(?:ma|me|men|main|mein|par|pe|on|में| पर)\b/gi, " ")
    .replace(/\b(?:is|ye|this)\s+(?:pic|photo|image|picture)\b/gi, " ")
    .replace(/\b(?:add|daal\s*do|daal|lagao|laga\s*do|likh\s*do|likho|write|put|जोड़ो|डालो|लिखो)\b/gi, " ")
    .replace(/\b(?:a|ak|ek|one|the|some|एक)\s+(?:script|scripteo|scripeo|caption|text|shayari|quote|title|heading|line|poem|kavita|slogan)\b/gi, " ")
    .replace(/\b(?:script|scripteo|scripeo|caption|text|shayari|quote|title|heading|poem|kavita|slogan|overlay|स्क्रिप्ट|शायरी|कैप्शन)\b/gi, " ")
    .replace(/\b(?:kr\s*do|kar\s*do|kar\s*diya|do|de|diya|diye|chahiye|please|pls|hai|hain)\b/gi, " ")
    .replace(/[,:;!\-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length < 3 || /^(?:ak|ek|a|an|the|is|ye|photo|pic|image)$/i.test(cleaned)) {
    return "Apni kahani yahin se shuru hoti hai ✨";
  }
  return cleaned.slice(0, 300);
}

export interface QuickImageObject {
  id: string;
  label: string;
  kind: "image" | "sticker";
  src?: string;
  emoji?: string;
  /** Normalised canvas position (0–1). */
  x: number;
  y: number;
  /** Fraction of the image's shorter side. */
  sizeRatio: number;
}

/** Objects the editor can drop onto a photo straight from a Hinglish command. */
export const QUICK_IMAGE_OBJECTS: QuickImageObject[] = [
  { id: "gun", label: "Gun", kind: "image", src: "/objects/pistol.svg", x: 0.72, y: 0.58, sizeRatio: 0.34 },
  { id: "crown", label: "Crown", kind: "sticker", emoji: "👑", x: 0.5, y: 0.2, sizeRatio: 0.18 },
  { id: "flower", label: "Flower", kind: "sticker", emoji: "🌸", x: 0.76, y: 0.67, sizeRatio: 0.16 },
  { id: "glasses", label: "Sunglasses", kind: "sticker", emoji: "🕶️", x: 0.5, y: 0.37, sizeRatio: 0.2 },
  { id: "hat", label: "Hat", kind: "sticker", emoji: "🎩", x: 0.5, y: 0.2, sizeRatio: 0.2 },
  { id: "heart", label: "Heart", kind: "sticker", emoji: "❤️", x: 0.78, y: 0.3, sizeRatio: 0.14 },
  { id: "fire", label: "Fire", kind: "sticker", emoji: "🔥", x: 0.25, y: 0.68, sizeRatio: 0.16 },
  { id: "star", label: "Sparkle", kind: "sticker", emoji: "✨", x: 0.24, y: 0.26, sizeRatio: 0.14 },
];

const OBJECT_PATTERNS: Array<{ id: string; patterns: RegExp[] }> = [
  { id: "gun", patterns: [/\bguns?\b/i, /\bpistols?\b/i, /\brevolvers?\b/i, /बंदूक|गन/i, /bandook/i] },
  { id: "crown", patterns: [/\bcrowns?\b/i, /ताज/i, /taaj/i] },
  { id: "flower", patterns: [/\bflowers?\b/i, /फूल/i, /phool/i] },
  { id: "glasses", patterns: [/\b(?:sun)?glasses\b/i, /चश्मे|चश्मा/i, /chashme/i] },
  { id: "hat", patterns: [/\b(?:hat|cap|topi)\b/i, /टोपी/i] },
  { id: "heart", patterns: [/\bhearts?\b/i, /दिल/i, /dil/i] },
  { id: "fire", patterns: [/\bfire\b/i, /आग/i, /aag/i] },
  { id: "star", patterns: [/\b(?:star|sparkle|glitter)\b/i, /सितार/i, /chamak/i] },
];

/** Detect things like "add gun in hand" / "iska haat ma gun add kro". */
export function imageEditObjectsFromText(text: string): QuickImageObject[] {
  if (/\b(?:remove|delete|hatao|hata|hatana|hatayein|mitao|मिटा|हटा)\b/i.test(text)) return [];
  const found = OBJECT_PATTERNS.filter((item) => item.patterns.some((pattern) => pattern.test(text)))
    .map((item) => QUICK_IMAGE_OBJECTS.find((object) => object.id === item.id))
    .filter((object): object is QuickImageObject => Boolean(object));

  return found.map((object) => {
    if (object.id === "gun" && /\b(?:hand|hath|haat)\b|हाथ/i.test(text)) {
      return { ...object, x: 0.72, y: 0.58 };
    }
    return object;
  });
}

/** Object edits should not also dump the raw command onto the photo as text. */
export function imageEditPlan(text: string): { objects: QuickImageObject[]; text: string } {
  const objects = imageEditObjectsFromText(text);
  return { objects, text: objects.length ? "" : scriptFromImageRequest(text) };
}

export function revokeMessageMediaItem(message: Message): void {
  if (typeof window === "undefined") return;
  if (message.media?.url.startsWith("blob:")) URL.revokeObjectURL(message.media.url);
  message.attachments?.forEach((file) => {
    if (file.url?.startsWith("blob:")) URL.revokeObjectURL(file.url);
  });
}

export function revokeMessageMedia(chat: Chat): void {
  chat.messages.forEach(revokeMessageMediaItem);
}

/** Removes command words so the remaining text becomes a clean image/video prompt. */
export function mediaPromptFromText(text: string): string {
  return text
    .replace(
      /^\s*(?:please\s+|pls\s+|kindly\s+)?(?:generate|create|make|draw|generate\s+an?|create\s+an?|make\s+an?|banao|banwao|banaye|do)\s+(?:an?\s+|the\s+)?(?:new\s+)?(?:image|photo|picture|poster|art|drawing|video|vedio|clip|animation|tasveer|taswir|chitra)?\s*(?:of\s+|about\s+|:|-)?\s*/i,
      ""
    )
    .replace(/^(?:ek|a|an)\s+/i, "")
    .trim() || text.trim();
}

/** Short confirmation in the same script as the user's request. */
export function mediaStatusText(text: string, video: boolean): string {
  if (/[\u0600-\u06FF]/.test(text)) {
    return video ? "✅ ویڈیو تیار ہے:" : "✅ تصویر تیار ہے:";
  }
  if (/[\u0900-\u097F]/.test(text)) {
    return video ? "✅ वीडियो तैयार है:" : "✅ तस्वीर तैयार है:";
  }
  return video ? "✅ Video ready:" : "✅ Image ready:";
}
