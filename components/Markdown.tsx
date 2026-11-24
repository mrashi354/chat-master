"use client";

import { isValidElement, useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { Check, Code2, Copy, Play } from "lucide-react";

function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement(node)) {
    return nodeText((node.props as { children?: ReactNode }).children);
  }
  return "";
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked — silently ignore.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="copy-btn"
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied!" : label}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      <span>{copied ? "Copied" : label}</span>
    </button>
  );
}

function CodeBlock({
  code,
  language,
  children,
}: {
  code: string;
  language: string;
  children: ReactNode;
}) {
  const [preview, setPreview] = useState(false);
  const canPreview = /^(html|svg)$/i.test(language);

  return (
    <div className="code-block">
      <div className="code-head">
        <span>{language}</span>
        <div className="code-head-actions">
          {canPreview && (
            <button
              type="button"
              onClick={() => setPreview((value) => !value)}
              aria-label={preview ? "Code dikhaayein" : "Preview chalayein"}
              title={preview ? "Code dikhaayein" : "Live preview (HTML)"}
            >
              {preview ? <Code2 size={14} /> : <Play size={14} />}
              <span>{preview ? "Code" : "Preview"}</span>
            </button>
          )}
          <CopyButton text={code} label="Copy code" />
        </div>
      </div>
      {preview ? (
        <div className="code-preview">
          <iframe
            key={code}
            title="HTML preview"
            sandbox="allow-scripts allow-forms allow-modals allow-popups"
            srcDoc={code}
          />
        </div>
      ) : (
        <pre>{children}</pre>
      )}
    </div>
  );
}

const components: Components = {
  p: ({ children }) => <p>{children}</p>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  pre: ({ children }) => {
    const element = isValidElement(children) ? children : null;
    const props = (element?.props ?? {}) as { children?: ReactNode; className?: string };
    const code = nodeText(props.children).replace(/\n$/, "");
    const language = /language-(\w+)/.exec(props.className ?? "")?.[1] ?? "code";
    return <CodeBlock code={code} language={language}>{children}</CodeBlock>;
  },
  code: ({ children, className }) =>
    className?.startsWith("language-") ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="inline-code">{children}</code>
    ),
  ul: ({ children }) => <ul>{children}</ul>,
  ol: ({ children }) => <ol>{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  h1: ({ children }) => <h3>{children}</h3>,
  h2: ({ children }) => <h3>{children}</h3>,
  h3: ({ children }) => <h3>{children}</h3>,
  blockquote: ({ children }) => <blockquote>{children}</blockquote>,
  table: ({ children }) => (
    <div className="table-wrap">
      <table>{children}</table>
    </div>
  ),
  hr: () => <hr />,
};

export default function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown components={components}>{content}</ReactMarkdown>
    </div>
  );
}
