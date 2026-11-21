"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, RotateCcw, Sparkles, Volume2 } from "lucide-react";
import Markdown from "@/components/Markdown";
import type { Message } from "@/lib/chat";

interface Props {
  message: Message;
  isLastAssistant: boolean;
  isStreaming: boolean;
  canSpeak: boolean;
  onSpeak: (text: string) => void;
  onRegenerate: () => void;
}

export default function MessageBubble({
  message,
  isLastAssistant,
  isStreaming,
  canSpeak,
  onSpeak,
  onRegenerate,
}: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked — silently ignore.
    }
  };

  if (message.role === "user") {
    return (
      <div className="msg-row msg-user">
        <div className="bubble bubble-user">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
          {message.searched && (
            <span className="search-chip">🌐 Web search</span>
          )}
        </div>
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
          </div>
        )}
      </div>
    </div>
  );
}
