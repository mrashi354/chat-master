"use client";

import { useRef, useState } from "react";
import { Download, FileUp, Plus, Sparkles, Trash2, X } from "lucide-react";
import {
  DEFAULT_PREFERENCES,
  PRESETS,
  type Preferences,
} from "@/lib/preferences";
import type { Chat } from "@/lib/chat";

interface Props {
  open: boolean;
  preferences: Preferences;
  chats: Chat[];
  onClose: () => void;
  onChange: (prefs: Preferences) => void;
  onImport: (chats: Chat[]) => void;
  onClearAll: () => void;
}

type Tab = "assistant" | "behavior" | "data" | "shortcuts";

const TABS: { id: Tab; label: string }[] = [
  { id: "assistant", label: "Assistant" },
  { id: "behavior", label: "Behavior" },
  { id: "data", label: "Data" },
  { id: "shortcuts", label: "Shortcuts" },
];

export default function SettingsModal({
  open,
  preferences,
  chats,
  onClose,
  onChange,
  onImport,
  onClearAll,
}: Props) {
  const [tab, setTab] = useState<Tab>("assistant");
  const [newMemory, setNewMemory] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  if (!open) return null;

  const patch = (next: Partial<Preferences>) => onChange({ ...preferences, ...next });

  const addMemory = () => {
    const fact = newMemory.trim();
    if (!fact) return;
    if (preferences.memory.length >= 40) {
      setError("Maximum 40 facts allow hain.");
      return;
    }
    patch({ memory: [...preferences.memory, fact.slice(0, 240)] });
    setNewMemory("");
    setError("");
  };

  const exportChats = () => {
    const blob = new Blob([JSON.stringify({ version: 1, chats }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chat-master-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importChats = async (file: File | undefined) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as { chats?: Chat[] } | Chat[];
      const list = Array.isArray(data) ? data : data.chats;
      if (!Array.isArray(list)) throw new Error("File me chats array nahi mila");
      onImport(list);
      setError("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import fail ho gaya");
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div className="modal-title">
            <Sparkles size={18} /> Settings
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Band karein">
            <X size={18} />
          </button>
        </header>

        <div className="modal-tabs" role="tablist">
          {TABS.map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? "active" : ""}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {tab === "assistant" && (
            <>
              <h3>Persona / preset</h3>
              <p className="modal-note">Preset choose karein ya apni custom instructions likhein.</p>
              <div className="preset-grid">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    className={`preset-card ${preferences.presetId === preset.id ? "active" : ""}`}
                    onClick={() => patch({ presetId: preset.id })}
                  >
                    <strong>{preset.name}</strong>
                    <span>{preset.description}</span>
                  </button>
                ))}
              </div>

              <h3>Custom instructions</h3>
              <textarea
                className="modal-textarea"
                value={preferences.customInstructions}
                onChange={(event) => patch({ customInstructions: event.target.value.slice(0, 2000) })}
                placeholder="Jaise: mere jawab hamesha Hinglish me doon, code ke saath comment na likho…"
                rows={4}
              />

              <h3>Memory</h3>
              <p className="modal-note">Yahaan likhi baatein har naye jawab me context ke taur par jati hain.</p>
              <div className="memory-input">
                <input
                  value={newMemory}
                  onChange={(event) => setNewMemory(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") addMemory();
                  }}
                  placeholder="Jaise: main Python developer hoon"
                  aria-label="Nayi memory fact"
                />
                <button type="button" onClick={addMemory} aria-label="Memory add karein">
                  <Plus size={16} />
                </button>
              </div>
              <ul className="memory-list">
                {preferences.memory.length === 0 && <li className="memory-empty">Abhi koi fact nahi.</li>}
                {preferences.memory.map((fact, index) => (
                  <li key={`${fact}-${index}`}>
                    <span>{fact}</span>
                    <button
                      type="button"
                      onClick={() =>
                        patch({ memory: preferences.memory.filter((_, i) => i !== index) })
                      }
                      aria-label="Fact delete karein"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {tab === "behavior" && (
            <>
              <h3>Creativity (temperature)</h3>
              <p className="modal-note">
                Kam value = focused aur predictable, zyada value = creative. Current: {preferences.temperature.toFixed(2)}
              </p>
              <input
                className="slider"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={preferences.temperature}
                onChange={(event) => patch({ temperature: Number(event.target.value) })}
              />

              <h3>Automation</h3>
              <label className="switch-row">
                <input
                  type="checkbox"
                  checked={preferences.autoSearch}
                  onChange={(event) => patch({ autoSearch: event.target.checked })}
                />
                <span>
                  <strong>Auto web search</strong>
                  <small>Jab sawaal current information ke baare me ho to search khud chalao.</small>
                </span>
              </label>
              <label className="switch-row">
                <input
                  type="checkbox"
                  checked={preferences.autoSpeak}
                  onChange={(event) => patch({ autoSpeak: event.target.checked })}
                />
                <span>
                  <strong>Auto voice output</strong>
                  <small>Har jawab ke baad sunao (browser voice ya Cartesia).</small>
                </span>
              </label>
            </>
          )}

          {tab === "data" && (
            <>
              <h3>Export / Import</h3>
              <p className="modal-note">
                Chats sirf is browser me rehte hain. Export karke backup rakhein. Blob media (images/videos)
                reload ke baad available nahi hote.
              </p>
              <div className="data-actions">
                <button type="button" onClick={exportChats} disabled={chats.length === 0}>
                  <Download size={16} /> Export {chats.length} chats (JSON)
                </button>
                <button type="button" onClick={() => importRef.current?.click()}>
                  <FileUp size={16} /> Import JSON
                </button>
                <input
                  ref={importRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(event) => void importChats(event.target.files?.[0])}
                />
              </div>

              <h3>Reset</h3>
              <div className="data-actions">
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    if (window.confirm("Saari chats delete karein? Ye wapas nahi aa saktiin.")) {
                      onClearAll();
                      onClose();
                    }
                  }}
                >
                  <Trash2 size={16} /> Saari chats delete karein
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChange(DEFAULT_PREFERENCES);
                    setError("");
                  }}
                >
                  Settings reset karein
                </button>
              </div>
              {error && <p className="modal-error">{error}</p>}
            </>
          )}

          {tab === "shortcuts" && (
            <>
              <h3>Keyboard shortcuts</h3>
              <ul className="shortcut-list">
                <li><span>Nayi chat</span><kbd>Ctrl/⌘ + K</kbd></li>
                <li><span>Message bhejein</span><kbd>Enter</kbd></li>
                <li><span>Nayi line</span><kbd>Shift + Enter</kbd></li>
                <li><span>Generation rokein</span><kbd>Esc</kbd></li>
                <li><span>Settings kholein</span><kbd>Ctrl/⌘ + ,</kbd></li>
                <li><span>Commands</span><kbd>/</kbd></li>
              </ul>
              <h3>Commands</h3>
              <ul className="shortcut-list">
                <li><span>Reel Studio</span><kbd>/reel</kbd></li>
                <li><span>Image banana</span><kbd>/image</kbd></li>
                <li><span>Video banana</span><kbd>/video</kbd></li>
                <li><span>Web search</span><kbd>/search</kbd></li>
                <li><span>Calculator</span><kbd>/calc</kbd></li>
                <li><span>Weather</span><kbd>/weather</kbd></li>
                <li><span>Website padhna</span><kbd>/read</kbd></li>
              </ul>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
