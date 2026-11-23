"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Globe,
  Image as ImageIcon,
  MessageSquarePlus,
  Mic,
  Pencil,
  Pin,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Video,
  Volume2,
  Wrench,
  FileText,
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
  onRename: (id: string, title: string) => void;
  onTogglePin: (id: string) => void;
  onOpenSettings: () => void;
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
  onRename,
  onTogglePin,
  onOpenSettings,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  const sorted = useMemo(() => {
    const term = query.trim().toLowerCase();
    return chats
      .filter((chat) => {
        if (!term) return true;
        return (
          chat.title.toLowerCase().includes(term) ||
          chat.messages.some((message) => message.content.toLowerCase().includes(term))
        );
      })
      .sort((a, b) => {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
  }, [chats, query]);

  const commitRename = (id: string) => {
    const title = draftTitle.trim();
    if (title) onRename(id, title);
    setEditingId(null);
  };

  return (
    <>
      {open && <button className="sidebar-scrim" onClick={onClose} aria-label="Menu band karein" />}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <div className="brand">
            <div className="brand-mark"><Sparkles size={18} /></div>
            <div>
              <div className="brand-name">Chat-Master</div>
              <div className="brand-sub">Chat + Image + Video + Tools</div>
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

        <label className="chat-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Chats search karein…"
            aria-label="Chats search karein"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Search clear karein">
              <X size={13} />
            </button>
          )}
        </label>

        <div className="sidebar-label">Recent chats</div>
        <nav className="chat-list" aria-label="Chats">
          {sorted.length === 0 && (
            <p className="chat-empty">
              {query ? "Koi chat nahi mila." : "Abhi koi chat nahi. Upar se nayi chat shuru karein."}
            </p>
          )}
          {sorted.map((chat) => (
            <div
              key={chat.id}
              className={`chat-item ${chat.id === activeId ? "active" : ""}`}
            >
              {editingId === chat.id ? (
                <div className="chat-rename">
                  <input
                    autoFocus
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") commitRename(chat.id);
                      if (event.key === "Escape") setEditingId(null);
                    }}
                    aria-label="Chat ka naam"
                  />
                  <button
                    type="button"
                    onClick={() => commitRename(chat.id)}
                    title="Save"
                    aria-label="Naam save karein"
                  >
                    <Check size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    className="chat-select"
                    onClick={() => onSelect(chat.id)}
                    title={chat.title}
                  >
                    {chat.pinned ? <Pin size={15} /> : <MessageSquarePlus size={16} />}
                    <span>{chat.title}</span>
                  </button>
                  <div className="chat-tools">
                    <button
                      className="chat-action"
                      onClick={() => {
                        setEditingId(chat.id);
                        setDraftTitle(chat.title);
                      }}
                      title="Rename"
                      aria-label={`Rename ${chat.title}`}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="chat-action"
                      onClick={() => onTogglePin(chat.id)}
                      title={chat.pinned ? "Unpin" : "Pin"}
                      aria-label={chat.pinned ? "Unpin" : "Pin"}
                    >
                      <Pin size={14} />
                    </button>
                    <button
                      className="chat-delete"
                      onClick={() => {
                        if (window.confirm(`"${chat.title}" delete karein? Ye wapas nahi aayegi.`)) {
                          onDelete(chat.id);
                        }
                      }}
                      title="Chat delete karein"
                      aria-label={`Delete ${chat.title}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-label">Features</div>
          <div className="feature-list">
            <span className={status.chat ? "on" : "off"} title={status.chat ? "Chat ready" : "ANTHROPIC_API_KEY missing"}>
              <Sparkles size={13} /> Chat
            </span>
            <span className={status.search ? "on" : "off"} title="Search (Tavily + free fallback)">
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
            <span className={status.tools ? "on" : "off"} title="Calculator, weather, URL reader aur tools">
              <Wrench size={13} /> Tools
            </span>
            <span className={status.files ? "on" : "off"} title="PDF aur text file attachments">
              <FileText size={13} /> Files
            </span>
          </div>
          <button className="sidebar-settings" onClick={onOpenSettings}>
            <Settings2 size={15} /> Settings, memory aur data
          </button>
          <p className="sidebar-hint">Chats is browser mein save hote hain.</p>
        </div>
      </aside>
    </>
  );
}
