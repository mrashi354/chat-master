"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUp,
  BookOpen,
  CloudSun,
  Code2,
  Globe,
  Image as ImageIcon,
  Menu,
  Mic,
  Moon,
  Plus,
  Sparkles,
  Square,
  Sun,
  Video,
  Volume2,
  VolumeX,
} from "lucide-react";
import MessageBubble from "@/components/MessageBubble";
import Sidebar from "@/components/Sidebar";
import {
  createChat,
  EMPTY_STATUS,
  loadState,
  looksLikeImageRequest,
  looksLikeSearch,
  mediaPromptFromText,
  mediaStatusText,
  looksLikeVideoRequest,
  makeMessage,
  newId,
  revokeMessageMedia,
  saveState,
  titleFromMessage,
  toApiMessages,
  type Chat,
  type FeatureStatus,
  type MediaAsset,
  type Message,
  type Source,
} from "@/lib/chat";
import { createVideoFromImage, fetchImageBlob } from "@/lib/media";

const SUGGESTIONS = [
  { text: "Aaj ka mausam kaisa hai?", icon: CloudSun },
  { text: "Python me ek chota example likho", icon: Code2 },
  { text: "Mujhe ek short story sunao", icon: BookOpen },
  { text: "Ek cute cat ki image banao", icon: ImageIcon },
  { text: "Samundar ki short video banao", icon: Video },
  { text: "Newton ke laws samjhao", icon: Sparkles },
] as const;

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

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  const showToast = useCallback((text: string, tone: Toast["tone"] = "info") => {
    setToast({ id: newId(), text, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3600);
  }, []);

  // Load saved chats + feature availability on first mount.
  useEffect(() => {
    // Defer to after hydration so server and client render the same HTML.
    const timer = setTimeout(() => {
      const saved = loadState();
      setChats(saved.chats);
      setActiveId(saved.activeId);
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
        if (data.voiceOutput || "speechSynthesis" in window) setVoiceOn(true);
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
    el.scrollTop = el.scrollHeight;
  }, [activeId, messageCount, lastMessageContent]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const chat = createChat();
        setChats((prev) => [chat, ...prev]);
        setActiveId(chat.id);
        setInput("");
        setSidebarOpen(false);
        textareaRef.current?.focus();
      }
      if (event.key === "Escape" && isLoading) abortRef.current?.abort();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isLoading]);

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

  const newChat = () => {
    const chat = createChat();
    setChats((prev) => [chat, ...prev]);
    setActiveId(chat.id);
    setInput("");
    setSidebarOpen(false);
    textareaRef.current?.focus();
  };

  const deleteChat = (id: string) => {
    const target = chats.find((chat) => chat.id === id);
    if (target) revokeMessageMedia(target);
    setChats((prev) => {
      const next = prev.filter((chat) => chat.id !== id);
      if (id === activeId) setActiveId(next[0]?.id ?? null);
      return next;
    });
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

    // Browser speech synthesis works without any API key.
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

  const sendMessage = async (raw?: string, options?: { regenerate?: boolean }) => {
    if (isLoading) return;

    let chat = activeChat;
    let chatId = activeId;
    const regenerate = options?.regenerate === true;
    let userText = (raw ?? input).trim();

    if (!chat) {
      chat = createChat();
      chatId = chat.id;
      setChats((prev) => [chat as Chat, ...prev]);
      setActiveId(chat.id);
    }

    let base: Message[];
    if (regenerate) {
      let assistantIndex = -1;
      for (let i = chat.messages.length - 1; i >= 0; i--) {
        if (chat.messages[i].role === "assistant") {
          assistantIndex = i;
          break;
        }
      }
      if (assistantIndex === -1) return;
      const previous = chat.messages[assistantIndex];
      if (previous.media?.url.startsWith("blob:")) URL.revokeObjectURL(previous.media.url);
      base = chat.messages.slice(0, assistantIndex);
      const lastUser = [...base].reverse().find((m) => m.role === "user");
      if (!lastUser) return;
      userText = lastUser.content;
    } else {
      if (!userText) return;
      const userMessage = makeMessage("user", userText);
      base = [...chat.messages, userMessage];
    }

    const lastUserId = [...base].reverse().find((m) => m.role === "user")?.id;
    const assistantMessage = makeMessage("assistant", "");
    const nextMessages = [...base, assistantMessage];
    const isFirstMessage = !regenerate && chat.messages.length === 0;

    setChats((prev) =>
      prev.map((c) =>
        c.id === chatId
          ? {
              ...c,
              title: isFirstMessage ? titleFromMessage(userText) : c.title,
              messages: nextMessages,
              updatedAt: Date.now(),
            }
          : c
      )
    );
    setInput("");
    setSidebarOpen(false);
    stickToBottom.current = true;
    setIsLoading(true);
    setStreamingId(assistantMessage.id);
    stopSpeaking();

    const controller = new AbortController();
    abortRef.current = controller;

    // Image / video requests use free generators — no keys needed.
    const wantsVideo = videoMode || (!imageMode && looksLikeVideoRequest(userText));
    const wantsImage = !wantsVideo && (imageMode || looksLikeImageRequest(userText));
    if (wantsVideo || wantsImage) {
      let createdUrl: string | null = null;
      try {
        const cleanPrompt = mediaPromptFromText(userText);
        updateAssistant(
          chatId as string,
          assistantMessage.id,
          wantsVideo
            ? "🎬 Pehle ek realistic image ban rahi hai…"
            : "🎨 Realistic image ban rahi hai…"
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
        if (voiceOn && voiceOutputReady) speakText(label);
        setImageMode(false);
        setVideoMode(false);
        return;
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
        return;
      }
    }

    try {
      // Optional web search — results are injected only into the API payload.
      let searchContext = "";
      let sources: Source[] = [];
      const shouldSearch = status.search && (webSearch || looksLikeSearch(userText));
      if (shouldSearch) {
        try {
          const searchRes = await fetch("/api/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: userText }),
            signal: controller.signal,
          });
          const data = await searchRes.json().catch(() => null);
          if (searchRes.ok) {
            searchContext = typeof data?.context === "string" ? data.context : "";
            sources = Array.isArray(data?.sources) ? data.sources : [];
            setChats((prev) =>
              prev.map((c) =>
                c.id === chatId
                  ? {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === assistantMessage.id
                          ? { ...m, searched: true, sources }
                          : m.id === lastUserId
                            ? { ...m, searched: true }
                            : m
                      ),
                    }
                  : c
              )
            );
          } else {
            showToast(data?.error ?? "Search fail ho gaya.", "error");
          }
        } catch {
          if (!controller.signal.aborted) showToast("Search available nahi hai.", "error");
        }
      }

      const payload = toApiMessages(base);
      if (searchContext && payload.length) {
        const last = payload[payload.length - 1];
        if (last.role === "user") {
          last.content += `\n\n[Web search results — use these facts if relevant]\n${searchContext}`;
        } else {
          payload.push({ role: "user", content: `[Web search results]\n${searchContext}` });
        }
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payload }),
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
        const payloadText = line.trim().slice(6);
        if (payloadText === "[DONE]") return;
        try {
          const data = JSON.parse(payloadText) as { text?: string; error?: string };
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

      if (!full.trim()) {
        updateAssistant(chatId as string, assistantMessage.id, "⚠️ Jawab nahi mila. Dobara try karein.");
      } else if (voiceOn && voiceOutputReady) {
        speakText(full);
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
      abortRef.current = null;
      setStreamingId(null);
      setIsLoading(false);
    }
  };

  const stopGeneration = () => abortRef.current?.abort();

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

    // Browser-native speech recognition — no API key needed (Chrome/Edge).
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
    if (voiceOn) stopSpeaking();
    setVoiceOn((on) => !on);
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
  };

  return (
    <div className="app-shell">
      <Sidebar
        chats={chats}
        activeId={activeId}
        open={sidebarOpen}
        status={effectiveStatus}
        onSelect={(id) => {
          setActiveId(id);
          setSidebarOpen(false);
          stickToBottom.current = true;
        }}
        onNew={newChat}
        onDelete={deleteChat}
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
              title={status.search ? "Web search toggle" : "TAVILY_API_KEY missing"}
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
                Free mode active — bina kisi paid key ke chal raha hai
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
              {activeChat.messages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isLastAssistant={
                    message.role === "assistant" &&
                    index === activeChat.messages.length - 1
                  }
                  isStreaming={streamingId === message.id}
                  canSpeak={voiceOutputReady}
                  onSpeak={speakText}
                  onRegenerate={() => void sendMessage(undefined, { regenerate: true })}
                />
              ))}
            </div>
          )}
        </div>

        <div className="composer-area">
          <div className="composer">
            <button
              className={`mode-tool ${imageMode ? "active" : ""}`}
              onClick={toggleImageMode}
              title="Image banana (ya 'image' likh kar bhejein)"
              aria-label="Image mode"
              aria-pressed={imageMode}
            >
              <ImageIcon size={19} />
            </button>
            <button
              className={`mode-tool ${videoMode ? "active" : ""}`}
              onClick={toggleVideoMode}
              title="Video banana (ya 'video' likh kar bhejein)"
              aria-label="Video mode"
              aria-pressed={videoMode}
            >
              <Video size={19} />
            </button>
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
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              rows={1}
              placeholder={
                isRecording
                  ? "Sun raha hoon…"
                  : videoMode
                    ? "Video ka description likhein…"
                    : imageMode
                      ? "Image ka description likhein…"
                      : "Message likhein…"
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
                disabled={!input.trim()}
                title="Bhejein (Enter)"
                aria-label="Message bhejein"
              >
                <ArrowUp size={20} />
              </button>
            )}
          </div>
          <p className="composer-hint">
            🖼️ Image · 🎬 Video · Enter = bhejein · Shift+Enter = nayi line{isRecording ? " · 🎙️ recording chal rahi hai" : ""}
          </p>
        </div>

        {toast && (
          <div className={`toast ${toast.tone}`} role="status" key={toast.id}>
            {toast.tone === "error" ? <AlertCircle size={16} /> : <Sparkles size={16} />}
            <span>{toast.text}</span>
          </div>
        )}
      </main>
    </div>
  );
}
