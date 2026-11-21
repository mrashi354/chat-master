"use client";

import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Send, Mic, MicOff, Volume2, VolumeX } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SEARCH_KEYWORDS = [
  "latest", "today", "news", "current", "search", "2026",
  "abhi", "aaj", "khabar", "mausam", "abhi bhi",
];

export default function ChatMaster() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const assistantTextRef = useRef("");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsSpeaking(false);
  };

  const speakText = async (text: string) => {
    try {
      stopSpeaking();
      setIsSpeaking(true);
      const response = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.substring(0, 500) }),
      });
      if (response.ok) {
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.onended = () => {
          setIsSpeaking(false);
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
        };
        audio.onerror = () => setIsSpeaking(false);
        await audio.play();
      } else {
        setIsSpeaking(false);
      }
    } catch {
      setIsSpeaking(false);
    }
  };

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;
    const newMessages: Message[] = [...messages, { role: "user", content }];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    stopSpeaking();

    try {
      // Step 1: Web search agar sawal current affairs ka hai
      const needsSearch = SEARCH_KEYWORDS.some((k) =>
        content.toLowerCase().includes(k)
      );
      let searchContext = "";
      if (needsSearch) {
        const searchRes = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: content }),
        });
        const searchData = await searchRes.json().catch(() => ({}));
        if (searchData.answer) {
          searchContext = " [Web Search Results]: " + searchData.answer;
        }
      }

      // Step 2: Chat API se streaming response
      const messagesWithContext = [...newMessages];
      if (searchContext) {
        messagesWithContext[messagesWithContext.length - 1] = {
          role: "user",
          content: content + searchContext,
        };
      }
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messagesWithContext }),
      });

      if (!response.ok || !response.body) {
        const err = await response.json().catch(() => null);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "⚠️ Maaf kijiye, kuch gadbad ho gayi: " +
              (err?.error ?? `Server error (${response.status})`),
          },
        ]);
        setIsLoading(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      assistantTextRef.current = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // aakhri adhuri line buffer mein rakho
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") continue;
          try {
            const data = JSON.parse(payload);
            if (data.text) {
              assistantTextRef.current += data.text;
              const merged = assistantTextRef.current;
              setMessages((prev) => [
                ...prev.slice(0, -1),
                { role: "assistant", content: merged },
              ]);
            } else if (data.error) {
              const prefix = assistantTextRef.current ? "\n\n" : "";
              assistantTextRef.current += `${prefix}⚠️ ${data.error}`;
              setMessages((prev) => [
                ...prev.slice(0, -1),
                { role: "assistant", content: assistantTextRef.current },
              ]);
            }
          } catch {
            // adhuri JSON line — skip
          }
        }
      }

      let assistantMessage = assistantTextRef.current;
      if (!assistantMessage.trim()) {
        assistantMessage = "⚠️ Jawab nahi mila. Dobara try karein.";
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: "assistant", content: assistantMessage },
        ]);
      }

      if (voiceOn) speakText(assistantMessage);
    } catch (error) {
      console.error("Error:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Network error — internet check karke dobara try karein." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const startRecording = async () => {
    if (isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        if (audioBlob.size === 0) return;
        const formData = new FormData();
        formData.append("file", audioBlob, "audio.webm");
        try {
          // Server-side transcription — API key browser mein nahi aati
          const response = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
          });
          const data = await response.json();
          if (data.text) sendMessage(data.text);
          else console.error("Transcription failed:", data.error);
        } catch (err) {
          console.error("Transcription error:", err);
        }
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      alert("Microphone access denied! Browser mein mic permission allow karein.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-500 rounded-full flex items-center justify-center font-bold text-sm">
            CM
          </div>
          <h1 className="text-xl font-bold">Chat-Master</h1>
          <span className="hidden sm:inline text-xs bg-blue-600 px-2 py-1 rounded-full">
            AI + Voice + Search
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isSpeaking && (
            <button
              onClick={stopSpeaking}
              className="flex items-center gap-2 text-blue-400 animate-pulse hover:text-blue-300 transition"
              title="Rokne ke liye click karein"
            >
              <Volume2 size={16} />
              <span className="text-sm hidden sm:inline">Bol raha hai... (rokein)</span>
            </button>
          )}
          <button
            onClick={() => setVoiceOn((v) => !v)}
            className={`p-2 rounded-full transition ${
              voiceOn ? "bg-blue-600 hover:bg-blue-500" : "bg-gray-600 hover:bg-gray-500"
            }`}
            title={voiceOn ? "Voice OFF karein" : "Voice ON karein"}
          >
            {voiceOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 mt-20">
            <div className="text-6xl mb-4">🤖</div>
            <h2 className="text-2xl font-bold mb-2 text-white">Chat-Master</h2>
            <p className="mb-6">Type karo ya mic button dabao baat karne ke liye</p>
            <div className="flex justify-center gap-3 flex-wrap">
              {[
                "Aaj ka mausam kaisa hai?",
                "Python code example do",
                "Latest AI news kya hai?",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-full text-sm transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={"flex " + (msg.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={
                "max-w-3xl px-4 py-3 rounded-2xl " +
                (msg.role === "user"
                  ? "bg-blue-600 rounded-br-sm"
                  : "bg-gray-700 rounded-bl-sm")
              }
            >
              {msg.role === "assistant" ? (
                <div>
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p style={{ margin: "4px 0" }}>{children}</p>,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                  {msg.content && !msg.content.startsWith("⚠️") && (
                    <button
                      onClick={() => speakText(msg.content)}
                      className="mt-2 text-gray-400 hover:text-blue-400 transition flex items-center gap-1 text-xs"
                    >
                      <Volume2 size={12} /> Sunao
                    </button>
                  )}
                </div>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-700 px-4 py-3 rounded-2xl rounded-bl-sm">
              <div className="flex gap-1">
                {[0, 100, 200].map((d) => (
                  <div
                    key={d}
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: d + "ms" }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-700 bg-gray-800">
        <div className="flex gap-3 max-w-4xl mx-auto">
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={stopRecording}
            onTouchStart={(e) => {
              e.preventDefault();
              startRecording();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              stopRecording();
            }}
            onTouchCancel={stopRecording}
            className={
              "p-3 rounded-full transition touch-none select-none " +
              (isRecording
                ? "bg-red-500 animate-pulse"
                : "bg-gray-600 hover:bg-gray-500")
            }
            title="Hold karke boliye"
          >
            {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
            placeholder="Message likhein ya mic dabayein..."
            className="flex-1 bg-gray-700 placeholder-gray-400 px-4 py-3 rounded-full outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={isLoading || !input.trim()}
            className="p-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-full transition"
            title="Bhejiye"
          >
            <Send size={20} />
          </button>
        </div>
        <p className="text-center text-gray-500 text-xs mt-2">
          Mic hold karo bolne ke liye • Enter dabao message bhejne ke liye
        </p>
      </div>
    </div>
  );
}
