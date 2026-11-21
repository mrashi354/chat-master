"use client";

import {
  Globe,
  Image as ImageIcon,
  MessageSquarePlus,
  Mic,
  Plus,
  Sparkles,
  Trash2,
  Video,
  Volume2,
  X,
} from "lucide-react";
import type { Chat, FeatureStatus } from "@/lib/chat";

interface Props {
  chats: Chat[];
  activeId: string | null;
  open: boolean;
  status: FeatureStatus;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function Sidebar({
  chats,
  activeId,
  open,
  status,
  onSelect,
  onNew,
  onDelete,
  onClose,
}: Props) {
  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <>
      {open && <button className="sidebar-scrim" onClick={onClose} aria-label="Menu band karein" />}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <div className="brand">
            <div className="brand-mark"><Sparkles size={18} /></div>
            <div>
              <div className="brand-name">Chat-Master</div>
              <div className="brand-sub">Chat + Image + Video</div>
            </div>
          </div>
          <button className="icon-btn sidebar-close" onClick={onClose} aria-label="Menu band karein">
            <X size={18} />
          </button>
        </div>

        <button className="new-chat-btn" onClick={onNew}>
          <Plus size={17} /> Nayi chat
          <kbd>⌘K</kbd>
        </button>

        <div className="sidebar-label">Recent chats</div>
        <nav className="chat-list" aria-label="Chats">
          {sorted.length === 0 && (
            <p className="chat-empty">Abhi koi chat nahi. Upar se nayi chat shuru karein.</p>
          )}
          {sorted.map((chat) => (
            <div
              key={chat.id}
              className={`chat-item ${chat.id === activeId ? "active" : ""}`}
            >
              <button
                className="chat-select"
                onClick={() => onSelect(chat.id)}
                title={chat.title}
              >
                <MessageSquarePlus size={16} />
                <span>{chat.title}</span>
              </button>
              <button
                className="chat-delete"
                onClick={() => onDelete(chat.id)}
                title="Chat delete karein"
                aria-label={`Delete ${chat.title}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-label">Features</div>
          <div className="feature-list">
            <span className={status.chat ? "on" : "off"} title={status.chat ? "Chat ready" : "ANTHROPIC_API_KEY missing"}>
              <Sparkles size={13} /> Chat
            </span>
            <span className={status.search ? "on" : "off"} title={status.search ? "Web search ready" : "TAVILY_API_KEY missing"}>
              <Globe size={13} /> Search
            </span>
            <span className={status.image ? "on" : "off"} title="Free image generation ready">
              <ImageIcon size={13} /> Image
            </span>
            <span className={status.video ? "on" : "off"} title="Free video clips (Chrome/Edge)">
              <Video size={13} /> Video
            </span>
            <span className={status.voiceInput ? "on" : "off"} title={status.voiceInput ? "Mic ready" : "Browser speech / OPENAI_API_KEY"}>
              <Mic size={13} /> Mic
            </span>
            <span className={status.voiceOutput ? "on" : "off"} title={status.voiceOutput ? "Voice ready" : "Browser speech / CARTESIA_API_KEY"}>
              <Volume2 size={13} /> Voice
            </span>
          </div>
          <p className="sidebar-hint">Chats is browser mein save hote hain.</p>
        </div>
      </aside>
    </>
  );
}
