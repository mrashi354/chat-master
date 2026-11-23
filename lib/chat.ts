import type { ToolResult } from "@/lib/tools";

export type Role = "user" | "assistant";

export interface Attachment {
  name: string;
  type: string;
  size: number;
  text?: string;
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

export function saveState(state: StoredState): void {
  if (typeof window === "undefined") return;
  try {
    // Blob URLs are only valid for this tab session — never persist broken links.
    const safe: StoredState = {
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
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
  } catch {
    // Storage full or blocked (private mode) — chat still works in memory.
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
          content += `\n\n[Attached image: ${file.name} — no image understanding available in free mode]`;
        } else {
          content += `\n\n[Attached file: ${file.name}]`;
        }
      }
      return { role: m.role, content: content.slice(0, 30000) };
    });
}

const VIDEO_WORDS = ["video", "vedio", "clip", "animation", "animated", "वीडियो", "विडियो"];
const IMAGE_WORDS = [
  "image", "photo", "picture", "draw", "drawing", "poster", "art",
  "banwao", "banao", "tasveer", "taswir", "chitra", "चित्र", "तस्वीर", "फोटो", "इमेज",
];

export function looksLikeVideoRequest(text: string): boolean {
  const lower = text.toLowerCase();
  // "video player ka code likho" should stay a coding request.
  if (/\b(code|program|script|function|api|html|css|player)\b/.test(lower)) return false;
  return VIDEO_WORDS.some((word) => lower.includes(word));
}

export function looksLikeImageRequest(text: string): boolean {
  const lower = text.toLowerCase();
  // "image ke liye code likho" should stay a coding request.
  if (/\b(code|program|script|function|api|html|css)\b/.test(lower)) return false;
  return IMAGE_WORDS.some((word) => lower.includes(word));
}

export function revokeMessageMedia(chat: Chat): void {
  if (typeof window === "undefined") return;
  chat.messages.forEach((message) => {
    if (message.media?.url.startsWith("blob:")) {
      URL.revokeObjectURL(message.media.url);
    }
    message.attachments?.forEach((file) => {
      if (file.url?.startsWith("blob:")) URL.revokeObjectURL(file.url);
    });
  });
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
