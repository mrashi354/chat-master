"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  FileText,
  Pencil,
  RotateCcw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Volume2,
  Wrench,
  X,
} from "lucide-react";
import Markdown from "@/components/Markdown";
import type { Attachment, Message } from "@/lib/chat";

interface Props {
  message: Message;
  isLastAssistant: boolean;
  isStreaming: boolean;
  canSpeak: boolean;
  onSpeak: (text: string) => void;
  onRegenerate: () => void;
  onEdit: (content: string) => void;
  onDelete: () => void;
  onFeedback: (value: "up" | "down") => void;
}

function AttachmentCard({ file }: { file: Attachment }) {
  if (file.type.startsWith("image/") && file.url) {
    return (
      <figure className="attachment-image">
        <img src={file.url} alt={file.name} />
        <figcaption>{file.name}</figcaption>
      </figure>
    );
  }
  return (
    <div className="attachment-file" title={file.text ? `${file.text.length} characters extracted` : file.name}>
      <FileText size={15} />
      <div>
        <strong>{file.name}</strong>
        <small>
          {file.text
            ? `${file.pages ? `${file.pages} pages · ` : ""}${file.text.length.toLocaleString()} chars`
            : `${(file.size / 1024).toFixed(0)} KB`}
        </small>
      </div>
    </div>
  );
}

export default function MessageBubble({
  message,
  isLastAssistant,
  isStreaming,
  canSpeak,
  onSpeak,
  onRegenerate,
  onEdit,
  onDelete,
  onFeedback,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message.content);
      } else {
        const helper = document.createElement("textarea");
        helper.value = message.content;
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.appendChild(helper);
        helper.select();
        document.execCommand("copy");
        helper.remove();
      }
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  if (message.role === "user") {
    return (
      <div className="msg-row msg-user">
        <div className="bubble bubble-user">
          {editing ? (
            <div className="message-edit">
              <textarea
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                rows={4}
                aria-label="Message edit karein"
              />
              <div>
                <button
                  type="button"
                  onClick={() => {
                    if (draft.trim()) onEdit(draft.trim());
                    setEditing(false);
                  }}
                >
                  <Check size={13} /> Save & resend
                </button>
                <button type="button" onClick={() => setEditing(false)}>
                  <X size={13} /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
              {!!message.attachments?.length && (
                <div className="attachments">
                  {message.attachments.map((file, index) => (
                    <AttachmentCard key={`${file.name}-${index}`} file={file} />
                  ))}
                </div>
              )}
              {message.searched && <span className="search-chip">🌐 Web search</span>}
              {message.edited && <span className="search-chip">✏️ Edited</span>}
            </>
          )}
        </div>
        {!editing && !isStreaming && (
          <div className="msg-actions user-actions">
            <button
              type="button"
              onClick={() => {
                setDraft(message.content);
                setEditing(true);
              }}
              title="Message edit karein"
              aria-label="Message edit karein"
            >
              <Pencil size={13} /> <span>Edit</span>
            </button>
            <button type="button" onClick={onDelete} title="Message delete karein" aria-label="Message delete karein">
              <Trash2 size={13} /> <span>Delete</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="msg-row msg-assistant">
      <div className="assistant-avatar" aria-hidden="true">
        <Sparkles size={16} />
      </div>
      <div className="assistant-body">
        <div className="bubble bubble-assistant">
          {message.media?.type === "image" && (
            <figure className="media-card">
              <img src={message.media.url} alt={message.media.prompt} />
              <figcaption>
                <span title={message.media.prompt}>{message.media.prompt}</span>
                <a
                  href={message.media.url}
                  download={message.media.fileName ?? "chat-master-image.webp"}
                >
                  <Download size={13} /> Download
                </a>
              </figcaption>
            </figure>
          )}
          {message.media?.type === "video" && (
            <figure className="media-card">
              <video src={message.media.url} controls playsInline />
              <figcaption>
                <span title={message.media.prompt}>{message.media.prompt}</span>
                <a href={message.media.url} download="chat-master-video.webm">
                  <Download size={13} /> Download
                </a>
              </figcaption>
            </figure>
          )}
          {!!message.tools?.length && (
            <div className="tool-results">
              {message.tools.map((tool, index) => (
                <details key={`${tool.name}-${index}`}>
                  <summary>
                    <Wrench size={13} /> <strong>{tool.name}</strong>
                    <span>{tool.output.replace(/[*#`\n]+/g, " ").slice(0, 70)}</span>
                  </summary>
                  <div className="tool-output"><Markdown content={tool.output} /></div>
                </details>
              ))}
            </div>
          )}
          {message.content ? (
            <>
              <Markdown content={message.content} />
              {isStreaming && <span className="stream-cursor" aria-hidden="true" />}
            </>
          ) : isStreaming ? (
            <div className="typing" aria-label="Jawab aa raha hai">
              <span /><span /><span />
            </div>
          ) : null}
        </div>

        {!!message.sources?.length && (
          <div className="sources">
            <span className="sources-label">Sources:</span>
            {message.sources.slice(0, 3).map((source) => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                title={source.url}
              >
                {source.title}
              </a>
            ))}
          </div>
        )}

        {!isStreaming && message.content && (
          <div className="msg-actions">
            <button type="button" onClick={copy} title="Copy jawab" aria-label="Copy jawab">
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
            {canSpeak && (
              <button
                type="button"
                onClick={() => onSpeak(message.content)}
                title="Jawab sunao"
                aria-label="Jawab sunao"
              >
                <Volume2 size={14} />
                <span>Sunao</span>
              </button>
            )}
            <button
              type="button"
              className={message.feedback === "up" ? "active" : ""}
              onClick={() => onFeedback("up")}
              title="Achha jawab"
              aria-label="Achha jawab"
              aria-pressed={message.feedback === "up"}
            >
              <ThumbsUp size={14} /> <span>Achha</span>
            </button>
            <button
              type="button"
              className={message.feedback === "down" ? "active" : ""}
              onClick={() => onFeedback("down")}
              title="Jawab theek nahi"
              aria-label="Jawab theek nahi"
              aria-pressed={message.feedback === "down"}
            >
              <ThumbsDown size={14} /> <span>Sudharo</span>
            </button>
            {isLastAssistant && (
              <button
                type="button"
                onClick={onRegenerate}
                title="Naya jawab banwao"
                aria-label="Naya jawab banwao"
              >
                <RotateCcw size={14} />
                <span>Regenerate</span>
              </button>
            )}
            <button type="button" onClick={onDelete} title="Jawab delete karein" aria-label="Jawab delete karein">
              <Trash2 size={14} /> <span>Delete</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
