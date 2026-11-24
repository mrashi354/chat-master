"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Boxes,
  CloudSun,
  Code2,
  FileText,
  Film,
  Globe,
  Image as ImageIcon,
  Menu,
  Mic,
  Moon,
  Paperclip,
  Plus,
  Settings2,
  Sparkles,
  Square,
  Sun,
  Video,
  Volume2,
  VolumeX,
  Wand2,
  Wrench,
} from "lucide-react";
import MessageBubble from "@/components/MessageBubble";
import ImageStudio from "@/components/ImageStudio";
import SettingsModal, { type Tab } from "@/components/SettingsModal";
import Toolbox, { type ToolId } from "@/components/Toolbox";
import VideoStudio from "@/components/VideoStudio";
import Sidebar from "@/components/Sidebar";
import {
  createChat,
  EMPTY_STATUS,
  loadState,
  looksLikeImageEditRequest,
  looksLikeImageRequest,
  looksLikeSearch,
  mediaPromptFromText,
  scriptFromImageRequest,
  mediaStatusText,
  looksLikeVideoRequest,
  makeMessage,
  newId,
  readDraft,
  revokeMessageMedia,
  revokeMessageMediaItem,
  sanitizeImportedChats,
  saveState,
  writeDraft,
  titleFromMessage,
  toApiMessages,
  type Attachment,
  type Chat,
  type FeatureStatus,
  type MediaAsset,
  type Message,
  type Source,
} from "@/lib/chat";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  systemAddition,
  type Preferences,
} from "@/lib/preferences";
import { analyzeImage } from "@/lib/image-analysis";
import { createVideoFromImage, fetchImageBlob } from "@/lib/media";
import {
  detectTool,
  parseCommand,
  TOOL_COMMANDS,
  type ToolName,
  type ToolResult,
} from "@/lib/tools";

const SUGGESTIONS = [
  { text: "Aaj ka mausam kaisa hai?", icon: CloudSun },
  { text: "Python me ek chota example likho", icon: Code2 },
  { text: "Mujhe ek short story sunao", icon: BookOpen },
  { text: "Ek cute cat ki image banao", icon: ImageIcon },
  { text: "/calc (12*8)+sqrt(81)", icon: Wrench },
  { text: "16 tools ka toolbox kholo", icon: Boxes },
  { text: "3 scene ki reel banao", icon: Film },
  { text: "Newton ke laws samjhao", icon: Sparkles },
] as const;

const COMMANDS = [
  ...TOOL_COMMANDS.map((item) => ({
    command: item.command,
    label: item.title,
    hint: item.hint,
  })),
  { command: "/toolbox", label: "Toolbox", hint: "16 instant tools — JSON, hash, regex, color aur zyada" },
  { command: "/edit", label: "Image Studio", hint: "Photo par script/caption likhein aur PNG export karein" },
  { command: "/reel", label: "Reel Studio", hint: "Script + photos se reel/video banayein" },
  { command: "/image", label: "Image banana", hint: "AI se image generate karein" },
  { command: "/video", label: "Video banana", hint: "Image se animated clip (khali chhodkar studio kholein)" },
  { command: "/search", label: "Web search", hint: "Live web results ke saath jawab" },
  { command: "/clear", label: "Nayi chat", hint: "Current chat clear karein" },
  { command: "/help", label: "Madad", hint: "Commands aur shortcuts" },
];

const TEXT_FILE = /\.(txt|md|markdown|csv|json|log|xml|ya?ml|js|jsx|ts|tsx|py|java|css|html|sql|sh|env|ini|toml)$/i;
const MAX_ATTACHMENTS = 5;
const MAX_FILE_BYTES = 12 * 1024 * 1024;

type Toast = { id: string; text: string; tone: "info" | "error" };
type Theme = "dark" | "light";
type BrowserCaps = { speech: boolean; tts: boolean };

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

const THEME_KEY = "chat-master:theme";

function timezoneHint(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    return zone.split("/").pop()?.replace(/_/g, " ") ?? "";
  } catch {
    return "";
  }
}

function followUpPrompts(content: string): string[] {
  const text = content.toLowerCase();
  if (/```|function |class |import |const |def /.test(text)) {
    return ["Code samjhao", "Comments add karo", "Python me badlo"];
  }
  if (/[?？]\s*$/.test(content.trim())) {
    return ["Haan, detail se batao", "Example do", "Simple shabdon me"];
  }
  if (/[\u0900-\u097F]/.test(content)) {
    return ["Aur example do", "Chhota sa summary do", "English me bhi batao"];
  }
  return ["Explain simpler", "Give an example", "Summarize in 3 points"];
}

export default function ChatMaster() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [imageMode, setImageMode] = useState(false);
  const [videoMode, setVideoMode] = useState(false);
  const [status, setStatus] = useState<FeatureStatus>(EMPTY_STATUS);
  const [browserCaps, setBrowserCaps] = useState<BrowserCaps>({ speech: false, tts: false });
  const [theme, setTheme] = useState<Theme>("dark");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<Tab>("assistant");
  const [toolboxOpen, setToolboxOpen] = useState(false);
  const [toolboxTool, setToolboxTool] = useState<ToolId>("json");
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioScript, setStudioScript] = useState("");
  const [studioPrompt, setStudioPrompt] = useState("");
  const [studioImages, setStudioImages] = useState<Array<{ name: string; url: string }>>([]);
  const [imageStudioOpen, setImageStudioOpen] = useState(false);
  const [imageStudioImage, setImageStudioImage] = useState<{ name: string; url: string } | null>(null);
  const [imageStudioText, setImageStudioText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [showTools, setShowTools] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [dragging, setDragging] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stickToBottom = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const audioAbortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const speechRef = useRef<SpeechRecognitionLike | null>(null);
  const speechModeRef = useRef<"server" | "browser" | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeChat = chats.find((chat) => chat.id === activeId) ?? null;
  const messageCount = activeChat?.messages.length ?? 0;
  const lastMessageContent = activeChat?.messages.at(-1)?.content;
  const voiceInputReady = status.voiceInput || browserCaps.speech;
  const voiceOutputReady = status.voiceOutput || browserCaps.tts;
  const effectiveStatus: FeatureStatus = {
    ...status,
    voiceInput: voiceInputReady,
    voiceOutput: voiceOutputReady,
  };
  const slashMatches = useMemo(() => {
    const match = input.match(/^\/([a-z]*)$/i);
    if (!match) return [];
    const term = match[1].toLowerCase();
    return COMMANDS.filter((item) => item.command.slice(1).startsWith(term)).slice(0, 7);
  }, [input]);

  const showToast = useCallback((text: string, tone: Toast["tone"] = "info") => {
    setToast({ id: newId(), text, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3600);
  }, []);

  const newChat = useCallback(() => {
    writeDraft(activeId, input);
    abortRef.current?.abort();
    const chat = createChat();
    setChats((prev) => [chat, ...prev]);
    setActiveId(chat.id);
    setInput("");
    setAttachments([]);
    setShowTools(false);
    setSidebarOpen(false);
    stickToBottom.current = true;
    textareaRef.current?.focus();
  }, [activeId, input]);

  // Load saved chats + feature availability on first mount.
  useEffect(() => {
    const timer = setTimeout(() => {
      const saved = loadState();
      setChats(saved.chats);
      setActiveId(saved.activeId);
      setInput(readDraft(saved.activeId));
      const prefs = loadPreferences();
      setPreferences(prefs);
      setVoiceOn(prefs.autoSpeak);
      setHydrated(true);
      const savedTheme = window.localStorage.getItem(THEME_KEY);
      if (savedTheme === "dark" || savedTheme === "light") setTheme(savedTheme);
      const speechWindow = window as SpeechWindow;
      setBrowserCaps({
        speech: Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition),
        tts: "speechSynthesis" in window,
      });
    }, 0);

    fetch("/api/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: FeatureStatus | null) => {
        if (!data) return;
        setStatus(data);
      })
      .catch(() => {
        // Offline — chat still works if the server is up.
      });

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hydrated) saveState({ chats, activeId });
  }, [chats, activeId, hydrated]);

  useEffect(() => {
    if (hydrated) savePreferences(preferences);
  }, [preferences, hydrated]);

  // Autosave the composer draft so a reload never loses a half-typed message.
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => writeDraft(activeId, input), 350);
    return () => clearTimeout(timer);
  }, [input, activeId, hydrated]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Storage blocked — theme still applies for this session.
    }
  }, [theme]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (stickToBottom.current) el.scrollTop = el.scrollHeight;
    else setShowScrollDown(true);
  }, [activeId, messageCount, lastMessageContent]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        newChat();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && key === ".") {
        event.preventDefault();
        setToolboxOpen(true);
        return;
      }
      if (event.key === "Escape") {
        if (toolboxOpen) setToolboxOpen(false);
        else if (studioOpen) setStudioOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (showTools) setShowTools(false);
        else if (slashMatches.length) setInput("");
        else if (isLoading) abortRef.current?.abort();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isLoading, settingsOpen, studioOpen, toolboxOpen, showTools, slashMatches.length, newChat]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      audioAbortRef.current?.abort();
      if (audioRef.current) audioRef.current.pause();
      speechRef.current?.abort();
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const deleteChat = (id: string) => {
    const target = chats.find((chat) => chat.id === id);
    if (target) revokeMessageMedia(target);
    writeDraft(id, "");
    setChats((prev) => {
      const next = prev.filter((chat) => chat.id !== id);
      if (id === activeId) {
        setActiveId(next[0]?.id ?? null);
        setInput(readDraft(next[0]?.id ?? null));
      }
      return next;
    });
  };

  const renameChat = (id: string, title: string) => {
    setChats((prev) => prev.map((chat) => (chat.id === id ? { ...chat, title } : chat)));
  };

  const togglePin = (id: string) => {
    setChats((prev) => prev.map((chat) => (chat.id === id ? { ...chat, pinned: !chat.pinned } : chat)));
  };

  const clearAllChats = () => {
    chats.forEach(revokeMessageMedia);
    setChats([]);
    setActiveId(null);
    showToast("Saari chats delete ho gayiin.");
  };

  const importChats = (list: Chat[]) => {
    const valid = sanitizeImportedChats(list);
    if (!valid.length) {
      showToast("Import ke liye valid chats nahi mile.", "error");
      return;
    }
    const existing = new Set(chats.map((chat) => chat.id));
    const clean = valid.map((chat) => {
      if (!existing.has(chat.id)) {
        existing.add(chat.id);
        return chat;
      }
      const fresh = { ...chat, id: newId() };
      existing.add(fresh.id);
      return fresh;
    });
    setChats((prev) => [...clean, ...prev]);
    setActiveId(clean[0].id);
    setInput(readDraft(clean[0].id));
    showToast(`${clean.length} chats import ho gayiin.`);
  };

  const stopSpeaking = useCallback(() => {
    audioAbortRef.current?.abort();
    audioAbortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  const speakText = async (text: string) => {
    stopSpeaking();
    const clean = text.replace(/[*_`#|>]/g, " ").slice(0, 1000);

    if (!status.voiceOutput && browserCaps.tts && "speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = /[\u0900-\u097F]/.test(clean)
        ? "hi-IN"
        : navigator.language || "en-US";
      utterance.rate = 1;
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
      return;
    }

    if (!status.voiceOutput) {
      showToast("Is browser mein voice output available nahi hai.", "error");
      return;
    }
    const controller = new AbortController();
    audioAbortRef.current = controller;
    setIsSpeaking(true);
    try {
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Voice service fail");
      }
      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (audioRef.current === audio) audioRef.current = null;
        setIsSpeaking(false);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setIsSpeaking(false);
      };
      await audio.play();
    } catch (error) {
      if (!controller.signal.aborted) {
        setIsSpeaking(false);
        showToast((error as Error).message || "Voice nahi chal paya.", "error");
      }
    }
  };

  const updateAssistant = (
    chatId: string,
    messageId: string,
    content: string,
    extra?: Partial<Message>
  ) => {
    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id !== chatId) return chat;
        const existing = chat.messages.find((m) => m.id === messageId);
        if (
          extra?.media?.url.startsWith("blob:") &&
          existing?.media?.url.startsWith("blob:") &&
          existing.media.url !== extra.media.url
        ) {
          URL.revokeObjectURL(existing.media.url);
        }
        return {
          ...chat,
          updatedAt: Date.now(),
          messages: chat.messages.map((m) =>
            m.id === messageId ? { ...m, ...extra, content } : m
          ),
        };
      })
    );
  };

  const runTool = async (tool: ToolName, args: string): Promise<ToolResult | null> => {
    try {
      const response = await fetch("/api/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool,
          input: args,
          hint: tool === "weather" && !args ? timezoneHint() : "",
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { output?: string; error?: string }
        | null;
      if (!response.ok || !data?.output) {
        throw new Error(data?.error ?? "Tool fail ho gaya");
      }
      return { name: tool, output: data.output };
    } catch (error) {
      showToast((error as Error).message || "Tool fail ho gaya.", "error");
      return null;
    }
  };

  const openStudio = (
    script = "",
    prompt = "",
    images: Array<{ name: string; url: string }> = []
  ) => {
    setStudioScript(script);
    setStudioPrompt(prompt);
    setStudioImages(images);
    setStudioOpen(true);
  };

  const openImageStudio = (image: { name: string; url: string } | null, text = "") => {
    setImageStudioImage(image);
    setImageStudioText(text);
    setImageStudioOpen(true);
  };

  const insertReel = (url: string, fileName: string, script: string) => {
    let targetId = activeId;
    if (!targetId) {
      const chat = createChat();
      targetId = chat.id;
      setChats((prev) => [chat, ...prev]);
      setActiveId(chat.id);
    }
    const label = script.split(/\r?\n/).find((line) => line.trim())?.trim() ?? "Nayi reel";
    const userMessage = makeMessage("user", `🎬 Reel: ${titleFromMessage(label)}`);
    const assistant = makeMessage("assistant", "🎬 Reel tayyar hai. Download ya dobara banane ke liye Video Studio kholein.", {
      media: { type: "video", url, prompt: label, fileName },
    });
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === targetId
          ? { ...chat, messages: [...chat.messages, userMessage, assistant], updatedAt: Date.now() }
          : chat
      )
    );
    showToast("Reel chat me add ho gayi.");
  };

  const insertEditedImage = (url: string, fileName: string, text: string) => {
    let targetId = activeId;
    if (!targetId) {
      const chat = createChat();
      targetId = chat.id;
      setChats((prev) => [chat, ...prev]);
      setActiveId(chat.id);
    }
    const label = text.trim() || "Edited image";
    const userMessage = makeMessage("user", `🖼️ Photo me script: ${titleFromMessage(label)}`);
    const assistant = makeMessage("assistant", "✅ Script photo par add kar di gayi. Download ya edit karne ke liye Image Studio kholein.", {
      media: { type: "image", url, prompt: label, fileName },
    });
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === targetId
          ? { ...chat, messages: [...chat.messages, userMessage, assistant], updatedAt: Date.now() }
          : chat
      )
    );
    showToast("Edited image chat me add ho gayi.");
  };

  const sendEditedToReel = (url: string, fileName: string, text: string) => {
    openStudio(text || "Ek cinematic reel", `Edited photo: ${fileName}`, [{ name: fileName, url }]);
    showToast("Edited image Reel Studio me open ho gayi.");
  };

  const openToolbox = (tool: ToolId = "json") => {
    setToolboxTool(tool);
    setToolboxOpen(true);
  };

  const insertToolResult = (name: string, output: string) => {
    let targetId = activeId;
    if (!targetId) {
      const chat = createChat();
      targetId = chat.id;
      setChats((prev) => [chat, ...prev]);
      setActiveId(chat.id);
    }
    const userMessage = makeMessage("user", `🧰 ${name}`);
    const assistant = makeMessage("assistant", `🧰 **${name}**\n\n\`\`\`text\n${output.slice(0, 20000)}\n\`\`\``, {
      tools: [{ name, output }],
    });
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === targetId
          ? { ...chat, messages: [...chat.messages, userMessage, assistant], updatedAt: Date.now() }
          : chat
      )
    );
    showToast("Tool result chat me add ho gaya.");
  };

  const giveFeedback = (messageId: string, value: "up" | "down") => {
    setChats((prev) =>
      prev.map((chat) =>
        chat.id === activeId
          ? {
              ...chat,
              messages: chat.messages.map((message) =>
                message.id === messageId
                  ? { ...message, feedback: message.feedback === value ? undefined : value }
                  : message
              ),
            }
          : chat
      )
    );
    if (value === "down") showToast("Note kar liya — Regenerate se dobara try karein.");
  };

  const sendMessage = async (
    raw?: string,
    options?: { regenerate?: boolean; chatId?: string; base?: Message[] }
  ) => {
    if (isLoading) return;

    let chatId = options?.chatId ?? activeId;
    let chat = chats.find((item) => item.id === chatId) ?? null;
    const regenerate = options?.regenerate === true;
    let userText = (raw ?? input).trim();
    let pendingFiles = attachments;
    let forceSearch = false;
    let forceMedia: "image" | "video" | null = null;

    // Image attached + "is pic me script add karo" → actually edit the photo.
    const attachedImage = pendingFiles.find((file) => file.type.startsWith("image/") && file.url);
    if (!options?.base && !regenerate && attachedImage?.url && looksLikeImageEditRequest(userText)) {
      let targetId = activeId;
      if (!targetId) {
        const fresh = createChat();
        targetId = fresh.id;
        setChats((prev) => [fresh, ...prev]);
        setActiveId(fresh.id);
      }
      const userMessage = makeMessage("user", userText, { attachments: pendingFiles });
      setChats((prev) =>
        prev.map((item) =>
          item.id === targetId
            ? { ...item, messages: [...item.messages, userMessage], updatedAt: Date.now() }
            : item
        )
      );
      setInput("");
      setAttachments([]);
      openImageStudio(
        { name: attachedImage.name, url: attachedImage.url },
        scriptFromImageRequest(userText)
      );
      return;
    }

    // No photo? Let them open the editor directly.
    if (
      !options?.base &&
      !regenerate &&
      !attachedImage &&
      /\b(image|photo|photo-?)\s*(editor|studio|edit)\b|\bedit\s+(an?\s+)?(image|photo)\b/i.test(userText) &&
      !/\b(banao|banwao|generate|create)\b/i.test(userText)
    ) {
      setInput("");
      openImageStudio(null, "");
      return;
    }

    // Reel Studio — script + photos se multi-scene video.
    if (
      !options?.base &&
      !regenerate &&
      /\breel\b/i.test(userText) &&
      /\b(bana|banayein|banau|banaye|create|make|generate|chahiye|video|scene)\b/i.test(userText)
    ) {
      openStudio("", userText);
      return;
    }

    // Natural-language shortcuts for the two studios.
    if (!options?.base && !regenerate && /\b(toolbox|tools?\s+kholo|toolbox\s+kholo)\b/i.test(userText)) {
      openToolbox();
      return;
    }

    // Slash commands that change the request before it is sent.
    const command = parseCommand(userText);
    if (!command && userText.startsWith("/")) {
      const name = userText.split(/\s+/)[0].toLowerCase();
      if (name === "/clear") {
        newChat();
        return;
      }
      if (name === "/help") {
        setSettingsTab("shortcuts");
        setSettingsOpen(true);
        return;
      }
      if (name === "/toolbox") {
        openToolbox();
        return;
      }
      if (name === "/edit") {
        const firstImage = pendingFiles.find((file) => file.type.startsWith("image/") && file.url);
        openImageStudio(
          firstImage?.url ? { name: firstImage.name, url: firstImage.url } : null,
          userText.slice(name.length).trim()
        );
        setInput("");
        setAttachments([]);
        return;
      }
      if (name === "/reel" || name === "/studio") {
        openStudio(userText.slice(name.length).trim());
        return;
      }
      if (name === "/image" || name === "/video") {
        const description = userText.slice(name.length).trim();
        if (name === "/video" && !description) {
          openStudio();
          return;
        }
        forceMedia = name === "/image" ? "image" : "video";
        userText = description;
        if (!userText) {
          showToast(`${name} ke baad description likhein.`, "error");
          return;
        }
      }
      if (name === "/search") {
        forceSearch = true;
        userText = userText.slice(name.length).trim();
        if (!userText) {
          showToast("Search query likhein.", "error");
          return;
        }
      }
    }

    if (!chat) {
      chat = createChat();
      chatId = chat.id;
      setChats((prev) => [chat as Chat, ...prev]);
      setActiveId(chat.id);
    }

    let base: Message[];
    if (options?.base) {
      base = options.base;
      const lastUser = [...base].reverse().find((m) => m.role === "user");
      if (!lastUser) return;
      userText = lastUser.content;
      pendingFiles = lastUser.attachments ?? [];
    } else if (regenerate) {
      let assistantIndex = -1;
      for (let i = chat.messages.length - 1; i >= 0; i--) {
        if (chat.messages[i].role === "assistant") {
          assistantIndex = i;
          break;
        }
      }
      if (assistantIndex === -1) return;
      const previous = chat.messages[assistantIndex];
      revokeMessageMediaItem(previous);
      base = chat.messages.slice(0, assistantIndex);
      const lastUser = [...base].reverse().find((m) => m.role === "user");
      if (!lastUser) return;
      userText = lastUser.content;
      pendingFiles = lastUser.attachments ?? [];
    } else {
      if (!userText && !pendingFiles.length) return;
      const userMessage = makeMessage("user", userText || "📎 File attached", {
        attachments: pendingFiles.length ? pendingFiles : undefined,
      });
      base = [...chat.messages, userMessage];
    }

    // Re-detect after base assembly: edit/regenerate replace `userText` with the
    // original user message, so tool context must be derived from the final text.
    const effectiveTool = command ?? detectTool(userText);

    const lastUserId = [...base].reverse().find((m) => m.role === "user")?.id;
    const assistantMessage = makeMessage("assistant", "");
    const nextMessages = [...base, assistantMessage];
    const isFirstMessage = !regenerate && !options?.base && chat.messages.length === 0;

    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? {
              ...c,
              title: isFirstMessage ? titleFromMessage(userText || "📎 File") : c.title,
              messages: nextMessages,
              updatedAt: Date.now(),
            }
          : c
      )
    );
    setInput("");
    setAttachments([]);
    setShowTools(false);
    setSidebarOpen(false);
    stickToBottom.current = true;
    setIsLoading(true);
    setStreamingId(assistantMessage.id);
    stopSpeaking();

    const controller = new AbortController();
    abortRef.current = controller;
    const finish = () => {
      abortRef.current = null;
      setStreamingId(null);
      setIsLoading(false);
    };

    // Image / video requests use free generators — no keys needed.
    const wantsVideo =
      forceMedia === "video" || (!forceMedia && !imageMode && looksLikeVideoRequest(userText));
    const wantsImage =
      forceMedia === "image" ||
      (!forceMedia && !wantsVideo && (imageMode || looksLikeImageRequest(userText)));

    // Tool + web search run in parallel so the chat request can start sooner.
    let toolResults: ToolResult[] = [];
    let searchContext = "";
    const shouldSearch =
      !wantsVideo &&
      !wantsImage &&
      status.search &&
      (forceSearch || webSearch || (preferences.autoSearch && looksLikeSearch(userText)));

    const searchTask = shouldSearch
      ? (async () => {
          try {
            const searchRes = await fetch("/api/search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query: userText }),
              signal: controller.signal,
            });
            const data = await searchRes.json().catch(() => null);
            if (!searchRes.ok) {
              showToast(data?.error ?? "Search fail ho gaya.", "error");
              return null;
            }
            const context = typeof data?.context === "string" ? data.context : "";
            const found: Source[] = Array.isArray(data?.sources) ? data.sources : [];
            setChats((prev) =>
              prev.map((c) =>
                c.id === chatId
                  ? {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === assistantMessage.id
                          ? { ...m, searched: true, sources: found }
                          : m.id === lastUserId
                            ? { ...m, searched: true }
                            : m
                      ),
                    }
                  : c
              )
            );
            return { context, sources: found };
          } catch {
            if (!controller.signal.aborted) showToast("Search available nahi hai.", "error");
            return null;
          }
        })()
      : Promise.resolve(null);

    const [toolResult, searchData] = await Promise.all([
      effectiveTool ? runTool(effectiveTool.tool, effectiveTool.args) : Promise.resolve(null),
      searchTask,
    ]);
    if (toolResult) {
      toolResults = [toolResult];
      updateAssistant(chatId as string, assistantMessage.id, "", { tools: toolResults });
    }
    if (searchData) searchContext = searchData.context;
    if (wantsVideo || wantsImage) {
      let createdUrl: string | null = null;
      try {
        const cleanPrompt = mediaPromptFromText(userText);
        updateAssistant(
          chatId as string,
          assistantMessage.id,
          wantsVideo ? "🎬 Pehle ek realistic image ban rahi hai…" : "🎨 Realistic image ban rahi hai…",
          { tools: toolResults.length ? toolResults : undefined }
        );

        const blob = await fetchImageBlob(cleanPrompt, 768, 768);
        if (controller.signal.aborted) throw new Error("Aborted");

        const imageExt = blob.type.includes("webp")
          ? "webp"
          : blob.type.includes("png")
            ? "png"
            : "jpg";
        let media: MediaAsset = {
          type: wantsVideo ? "video" : "image",
          url: URL.createObjectURL(blob),
          prompt: cleanPrompt,
          fileName: wantsVideo ? "chat-master-video.webm" : `chat-master-image.${imageExt}`,
        };
        createdUrl = media.url;

        if (wantsVideo) {
          updateAssistant(chatId as string, assistantMessage.id, "🎬 Image ko video clip me badal raha hoon…");
          const videoBlob = await createVideoFromImage(blob, 4500);
          if (controller.signal.aborted) throw new Error("Aborted");
          URL.revokeObjectURL(createdUrl);
          createdUrl = URL.createObjectURL(videoBlob);
          media = { ...media, url: createdUrl };
        }

        const label = mediaStatusText(userText, wantsVideo);
        updateAssistant(chatId as string, assistantMessage.id, label, { media });
        if (voiceOn) speakText(label);
        setImageMode(false);
        setVideoMode(false);
      } catch (error) {
        if (createdUrl) URL.revokeObjectURL(createdUrl);
        setImageMode(false);
        setVideoMode(false);
        if (controller.signal.aborted) {
          setChats((prev) =>
            prev.map((c) =>
              c.id === chatId
                ? { ...c, messages: c.messages.filter((m) => m.id !== assistantMessage.id) }
                : c
            )
          );
          showToast("Generation rok di gayi.");
        } else {
          const message = (error as Error).message || "Media generate nahi ho paya.";
          updateAssistant(chatId as string, assistantMessage.id, `⚠️ ${message}`);
          showToast(message, "error");
        }
      } finally {
        finish();
      }
      return;
    }

    try {
      const payload = toApiMessages(base);
      const contexts: string[] = [];
      if (searchContext) contexts.push(`[Web search results — use these facts if relevant]\n${searchContext}`);
      for (const result of toolResults) {
        contexts.push(`[Tool result: ${result.name}]\n${result.output}`);
      }
      if (contexts.length) {
        const extra = contexts.join("\n\n");
        const last = payload[payload.length - 1];
        if (last?.role === "user") last.content += `\n\n${extra}`;
        else payload.push({ role: "user", content: extra });
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: payload,
          system: systemAddition(preferences),
          temperature: preferences.temperature,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error ?? `Server error (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";

      const handleBlock = (block: string) => {
        const line = block.split("\n").find((part) => part.trim().startsWith("data: "));
        if (!line) return;
        const frame = line.trim().slice(6);
        if (frame === "[DONE]") return;
        try {
          const data = JSON.parse(frame) as { text?: string; error?: string };
          if (typeof data.text === "string") {
            full += data.text;
            updateAssistant(chatId as string, assistantMessage.id, full);
          } else if (typeof data.error === "string") {
            full += `${full ? "\n\n" : ""}⚠️ ${data.error}`;
            updateAssistant(chatId as string, assistantMessage.id, full);
          }
        } catch {
          // Ignore incomplete JSON blocks.
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";
        blocks.forEach(handleBlock);
      }
      if (buffer.trim()) handleBlock(buffer);

      if (!full.trim() && !toolResults.length) {
        updateAssistant(chatId as string, assistantMessage.id, "⚠️ Jawab nahi mila. Dobara try karein.");
      } else if (voiceOn && voiceOutputReady) {
        speakText(full || toolResults.map((item) => item.output).join("\n"));
      }
    } catch (error) {
      const aborted = controller.signal.aborted;
      if (aborted) {
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? { ...c, messages: c.messages.filter((m) => m.id !== assistantMessage.id) }
              : c
          )
        );
        showToast("Generation rok di gayi.");
      } else {
        const message = (error as Error).message || "Network error";
        updateAssistant(chatId as string, assistantMessage.id, `⚠️ ${message}`);
        showToast(message, "error");
      }
    } finally {
      finish();
    }
  };

  const stopGeneration = () => abortRef.current?.abort();

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const incoming = Array.from(files);
    setUploading(true);
    const added: Attachment[] = [];
    for (const file of incoming) {
      if (attachments.length + added.length >= MAX_ATTACHMENTS) {
        showToast(`Maximum ${MAX_ATTACHMENTS} files allow hain.`, "error");
        break;
      }
      if (file.size > MAX_FILE_BYTES) {
        showToast(`${file.name} bahut bada hai (max 12 MB).`, "error");
        continue;
      }
      try {
        if (file.type.startsWith("image/")) {
          const imageAttachment: Attachment = {
            name: file.name,
            type: file.type,
            size: file.size,
            url: URL.createObjectURL(file),
          };
          added.push(imageAttachment);
          // Offline visual summary becomes chat context — no "I can't see images" reply.
          void analyzeImage(imageAttachment.url as string).then((analysis) => {
            if (!analysis) return;
            setAttachments((prev) =>
              prev.map((item) => (item.url === imageAttachment.url ? { ...item, analysis } : item))
            );
          });
        } else if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
          const form = new FormData();
          form.append("file", file);
          const response = await fetch("/api/files", { method: "POST", body: form });
          const data = (await response.json().catch(() => null)) as {
            text?: string;
            pages?: number;
            error?: string;
          } | null;
          if (!response.ok || !data?.text) throw new Error(data?.error ?? "PDF read nahi ho payi");
          added.push({
            name: file.name,
            type: file.type || "application/pdf",
            size: file.size,
            text: data.text,
            pages: data.pages,
          });
        } else if (file.type.startsWith("text/") || TEXT_FILE.test(file.name)) {
          added.push({
            name: file.name,
            type: file.type || "text/plain",
            size: file.size,
            text: (await file.text()).slice(0, 60000),
          });
        } else {
          added.push({ name: file.name, type: file.type || "application/octet-stream", size: file.size });
        }
      } catch (error) {
        showToast(`${file.name}: ${(error as Error).message}`, "error");
      }
    }
    if (added.length) setAttachments((prev) => [...prev, ...added]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    textareaRef.current?.focus();
  };

  const deleteMessage = (messageId: string) => {
    setChats((prev) =>
      prev.map((chat) => {
        if (chat.id !== activeId) return chat;
        const target = chat.messages.find((m) => m.id === messageId);
        if (target) revokeMessageMediaItem(target);
        return { ...chat, messages: chat.messages.filter((m) => m.id !== messageId) };
      })
    );
  };

  const editMessage = (index: number, content: string) => {
    const chat = activeChat;
    if (!chat) return;
    const target = chat.messages[index];
    if (!target || target.role !== "user") return;
    // Keep blob URLs alive — the resent message reuses these attachments.
    const base = chat.messages.slice(0, index);
    base.push({ ...target, content, edited: true });
    void sendMessage(undefined, { chatId: chat.id, base });
  };

  const stopRecording = () => {
    if (speechModeRef.current === "browser") {
      speechRef.current?.stop();
    } else {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
    }
    speechModeRef.current = null;
    setIsRecording(false);
  };

  const startRecording = async () => {
    if (isRecording) return;
    const speechWindow = window as SpeechWindow;
    const SpeechCtor = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

    if (!status.voiceInput && SpeechCtor) {
      try {
        const recognition = new SpeechCtor();
        recognition.lang = navigator.language || "en-US";
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.onresult = (event) => {
          const transcript = Array.from(event.results)
            .map((result) => result[0]?.transcript ?? "")
            .join(" ")
            .trim();
          if (transcript) sendMessage(transcript);
        };
        recognition.onerror = (event) => {
          speechModeRef.current = null;
          setIsRecording(false);
          if (event.error !== "aborted" && event.error !== "no-speech") {
            showToast("Mic permission ya network issue — dobara try karein.", "error");
          }
        };
        recognition.onend = () => {
          speechModeRef.current = null;
          setIsRecording(false);
        };
        speechRef.current = recognition;
        speechModeRef.current = "browser";
        recognition.start();
        setIsRecording(true);
        return;
      } catch {
        showToast("Voice input start nahi ho paya.", "error");
        return;
      }
    }

    if (!status.voiceInput) {
      showToast("Is browser mein voice input available nahi hai.", "error");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      showToast("Ye browser voice input support nahi karta.", "error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        micStreamRef.current = null;
        speechModeRef.current = null;
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size === 0) return;

        const form = new FormData();
        form.append("file", blob, "speech.webm");
        try {
          const response = await fetch("/api/transcribe", { method: "POST", body: form });
          const data = await response.json().catch(() => null);
          if (response.ok && data?.text) {
            sendMessage(data.text as string);
          } else {
            showToast(data?.error ?? "Voice samajh nahi aaya.", "error");
          }
        } catch {
          showToast("Network error — dobara try karein.", "error");
        }
      };

      recorder.start();
      speechModeRef.current = "server";
      setIsRecording(true);
    } catch {
      showToast("Mic permission denied. Browser settings mein allow karein.", "error");
    }
  };

  const toggleRecording = () => (isRecording ? stopRecording() : void startRecording());
  const toggleTheme = () => setTheme((current) => (current === "dark" ? "light" : "dark"));

  const toggleVoice = () => {
    if (!voiceOutputReady) {
      showToast("Is browser mein voice output available nahi hai.", "error");
      return;
    }
    const next = !voiceOn;
    if (voiceOn) stopSpeaking();
    setVoiceOn(next);
    setPreferences((prev) => ({ ...prev, autoSpeak: next }));
  };

  const toggleSearch = () => {
    if (!status.search) {
      showToast("Search abhi available nahi hai.", "error");
      return;
    }
    setWebSearch((on) => !on);
  };

  const toggleImageMode = () => {
    setVideoMode(false);
    setImageMode((on) => !on);
    textareaRef.current?.focus();
  };

  const toggleVideoMode = () => {
    setImageMode(false);
    setVideoMode((on) => !on);
    textareaRef.current?.focus();
  };

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    setShowScrollDown(!stickToBottom.current);
  };

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    stickToBottom.current = true;
    setShowScrollDown(false);
  };

  return (
    <div className="app-shell">
      <Sidebar
        chats={chats}
        activeId={activeId}
        open={sidebarOpen}
        status={effectiveStatus}
        onSelect={(id) => {
          writeDraft(activeId, input);
          setActiveId(id);
          setInput(readDraft(id));
          setSidebarOpen(false);
          stickToBottom.current = true;
          setShowScrollDown(false);
        }}
        onNew={newChat}
        onDelete={deleteChat}
        onRename={renameChat}
        onTogglePin={togglePin}
        onOpenSettings={() => setSettingsOpen(true)}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="main-panel">
        <header className="topbar">
          <button
            className="icon-btn menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Menu kholein"
          >
            <Menu size={20} />
          </button>
          <div className="topbar-title">
            <span className="topbar-dot" />
            {activeChat?.title ?? "Nayi chat"}
          </div>
          <div className="topbar-actions">
            <button
              className="icon-btn"
              onClick={toggleTheme}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
              aria-label={theme === "dark" ? "Light mode" : "Dark mode"}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {isSpeaking && (
              <button className="speaking-pill" onClick={stopSpeaking}>
                <Volume2 size={14} /> Speaking… rokain
              </button>
            )}
            <button
              className={`icon-btn ${webSearch ? "active" : ""}`}
              onClick={toggleSearch}
              title="Web search toggle"
              aria-label="Web search toggle"
              aria-pressed={webSearch}
            >
              <Globe size={18} />
            </button>
            <button
              className={`icon-btn ${voiceOn ? "active" : ""}`}
              onClick={toggleVoice}
              title={voiceOutputReady ? "Voice output toggle" : "Voice output unsupported"}
              aria-label="Voice output toggle"
              aria-pressed={voiceOn}
            >
              {voiceOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <button
              className="icon-btn"
              onClick={() => openToolbox()}
              title="Toolbox — 16 tools (Ctrl+.)"
              aria-label="Toolbox"
            >
              <Boxes size={18} />
            </button>
            <button
              className="icon-btn"
              onClick={() => openImageStudio(null, "")}
              title="Image Studio — photo par script (/edit)"
              aria-label="Image Studio"
            >
              <Wand2 size={18} />
            </button>
            <button
              className="icon-btn"
              onClick={() => openStudio()}
              title="Reel / Video Studio (/reel)"
              aria-label="Reel / Video Studio"
            >
              <Film size={18} />
            </button>
            <button
              className="icon-btn"
              onClick={() => setSettingsOpen(true)}
              title="Settings (Ctrl+,)"
              aria-label="Settings"
            >
              <Settings2 size={18} />
            </button>
            <button className="icon-btn" onClick={newChat} title="Nayi chat" aria-label="Nayi chat">
              <Plus size={19} />
            </button>
          </div>
        </header>

        <div className="messages" ref={scrollRef} onScroll={onScroll}>
          {!activeChat || activeChat.messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><Sparkles size={32} /></div>
              <h1>Namaste! Main Chat-Master hoon 👋</h1>
              <p>Poocho kuch bhi — Hindi, Urdu ya English mein. Seedha jawab, bina jhanjhat.</p>
              <div className="mode-pill">
                <span className="mode-dot" />
                Chat · Search · Image · Video · Files · Tools — sab free mode me
              </div>
              <div className="suggestions">
                {SUGGESTIONS.map(({ text, icon: Icon }) => (
                  <button key={text} onClick={() => sendMessage(text)}>
                    <Icon size={16} />
                    <span>{text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages-inner">
              {activeChat.messages.map((message, index) => {
                const isLast = message.role === "assistant" && index === activeChat.messages.length - 1;
                return (
                  <div key={message.id}>
                    <MessageBubble
                      message={message}
                      isLastAssistant={isLast}
                      isStreaming={streamingId === message.id}
                      canSpeak={voiceOutputReady}
                      onSpeak={speakText}
                      onRegenerate={() => {
                        void sendMessage(undefined, { regenerate: true, chatId: activeChat.id });
                      }}
                      onEdit={(content) => editMessage(index, content)}
                      onDelete={() => deleteMessage(message.id)}
                      onFeedback={(value) => giveFeedback(message.id, value)}
                    />
                    {isLast && !isLoading && message.content && (
                      <div className="followups">
                        {followUpPrompts(message.content).map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            onClick={() => void sendMessage(prompt)}
                            title={prompt}
                          >
                            <Sparkles size={12} /> {prompt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {showScrollDown && (
            <button
              className="scroll-bottom-btn"
              type="button"
              onClick={scrollToBottom}
              title="Neeche jayein"
              aria-label="Neeche jayein"
            >
              <ArrowDown size={18} />
            </button>
          )}
        </div>

        <div
          className={`composer-area ${dragging ? "dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void addFiles(event.dataTransfer.files);
          }}
        >
          {dragging && (
            <div className="drop-overlay"><Paperclip size={22} /> Files yahin chhod kar attach karein</div>
          )}
          {slashMatches.length > 0 && (
            <div className="command-menu" role="listbox" aria-label="Commands">
              {slashMatches.map((item) => (
                <button
                  key={item.command}
                  type="button"
                  onClick={() => {
                    setInput(`${item.command} `);
                    textareaRef.current?.focus();
                  }}
                >
                  <strong>{item.command}</strong>
                  <span>{item.label}</span>
                  <small>{item.hint}</small>
                </button>
              ))}
            </div>
          )}

          {showTools && (
            <div className="tools-menu" role="menu" aria-label="Tools">
              <div className="tools-menu-title">Tools — command dabao ya click karein</div>
              <div className="tools-grid">
                {TOOL_COMMANDS.map((item) => (
                  <button
                    key={item.command}
                    type="button"
                    title={item.hint}
                    onClick={() => {
                      setInput(`${item.command} `);
                      setShowTools(false);
                      textareaRef.current?.focus();
                    }}
                  >
                    <Wrench size={14} />
                    <span>{item.title}</span>
                    <small>{item.example}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {attachments.length > 0 && (
            <div className="pending-attachments">
              {attachments.map((file, index) => (
                <div key={`${file.name}-${index}`} className="pending-file">
                  {file.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={file.url} alt={file.name} />
                  ) : (
                    <FileText size={15} />
                  )}
                  <span title={file.name}>{file.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (file.url?.startsWith("blob:")) URL.revokeObjectURL(file.url);
                      setAttachments((prev) => prev.filter((_, i) => i !== index));
                    }}
                    aria-label="Attachment hataayein"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="composer">
            <button
              className={`mode-tool ${imageMode ? "active" : ""}`}
              onClick={toggleImageMode}
              title="Image banana (ya /image likhein)"
              aria-label="Image mode"
              aria-pressed={imageMode}
            >
              <ImageIcon size={19} />
            </button>
            <button
              className={`mode-tool ${videoMode ? "active" : ""}`}
              onClick={toggleVideoMode}
              title="Video banana (ya /video likhein)"
              aria-label="Video mode"
              aria-pressed={videoMode}
            >
              <Video size={19} />
            </button>
            <button
              className={`mode-tool ${showTools ? "active" : ""}`}
              onClick={() => setShowTools((on) => !on)}
              title="Tools (calculator, weather, URL reader…)"
              aria-label="Tools"
              aria-pressed={showTools}
            >
              <Wrench size={18} />
            </button>
            <button
              className="mode-tool"
              onClick={() => fileRef.current?.click()}
              title="File attach karein (PDF, text, image)"
              aria-label="File attach karein"
              disabled={uploading}
            >
              <Paperclip size={18} />
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept=".pdf,.txt,.md,.csv,.json,.log,.xml,.yaml,.yml,.js,.jsx,.ts,.tsx,.py,.java,.css,.html,.sql,image/*"
              onChange={(event) => void addFiles(event.target.files)}
            />
            <button
              className={`mic-btn ${isRecording ? "recording" : ""}`}
              onClick={toggleRecording}
              title={voiceInputReady ? (isRecording ? "Recording rokain" : "Bolne ke liye dabayein") : "Voice input unsupported"}
              aria-label={isRecording ? "Recording rokain" : "Voice input"}
              aria-pressed={isRecording}
            >
              <Mic size={20} />
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                // Hindi/Urdu IME: Enter confirms the candidate, it must not send.
                if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  // Pure command like `/help` should execute, not just autocomplete.
                  if (slashMatches.length && input.trim() !== slashMatches[0].command) {
                    setInput(`${slashMatches[0].command} `);
                    return;
                  }
                  void sendMessage();
                }
              }}
              rows={1}
              placeholder={
                uploading
                  ? "File padhi ja rahi hai…"
                  : isRecording
                    ? "Sun raha hoon…"
                    : videoMode
                      ? "Video ka description likhein…"
                      : imageMode
                        ? "Image ka description likhein…"
                        : "Message likhein… (/ se commands)"
              }
              aria-label="Message"
            />
            {isLoading ? (
              <button className="send-btn stop" onClick={stopGeneration} title="Rokain (Esc)" aria-label="Generation rokain">
                <Square size={16} fill="currentColor" />
              </button>
            ) : (
              <button
                className="send-btn"
                onClick={() => sendMessage()}
                disabled={!input.trim() && !attachments.length}
                title="Bhejein (Enter)"
                aria-label="Message bhejein"
              >
                <ArrowUp size={20} />
              </button>
            )}
          </div>
          <p className="composer-hint">
            📎 Files (drag-drop) · 🖼️ Edit · 🧰 Toolbox · 🎬 Reel · / Commands · Enter = bhejein
          </p>
        </div>

        {toast && (
          <div className={`toast ${toast.tone}`} role="status" key={toast.id}>
            {toast.tone === "error" ? <AlertCircle size={16} /> : <Sparkles size={16} />}
            <span>{toast.text}</span>
          </div>
        )}
      </main>

      <SettingsModal
        key={`${settingsOpen}-${settingsTab}`}
        open={settingsOpen}
        initialTab={settingsTab}
        preferences={preferences}
        chats={chats}
        onClose={() => setSettingsOpen(false)}
        onChange={setPreferences}
        onImport={importChats}
        onClearAll={clearAllChats}
      />

      <VideoStudio
        key={`${studioScript}|${studioPrompt}|${studioImages.map((item) => item.url).join(",")}`}
        open={studioOpen}
        initialScript={studioScript}
        initialPrompt={studioPrompt}
        initialImages={studioImages}
        onClose={() => setStudioOpen(false)}
        onInsert={insertReel}
      />

      <ImageStudio
        key={`${imageStudioOpen}-${imageStudioImage?.url ?? "none"}`}
        open={imageStudioOpen}
        initialImage={imageStudioImage}
        initialText={imageStudioText}
        onClose={() => setImageStudioOpen(false)}
        onInsert={insertEditedImage}
        onSendToReel={sendEditedToReel}
      />

      <Toolbox
        key={`${toolboxOpen}-${toolboxTool}`}
        open={toolboxOpen}
        initialTool={toolboxTool}
        onClose={() => setToolboxOpen(false)}
        onInsert={insertToolResult}
      />
    </div>
  );
}
