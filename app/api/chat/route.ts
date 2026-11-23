import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { chatModel, friendlyApiError, hasKey } from "@/lib/server-config";

type ApiMessage = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT =
  "You are Chat-Master, a world-class AI assistant. " +
  "CRITICAL: Detect the language of the user's latest message and reply in that EXACT same language " +
  "(Hindi, Hinglish, Urdu, English, Spanish, Arabic, or any other). Match their script too. " +
  "Never switch to another language, even if your reasoning is in one. " +
  "Answer any topic: general knowledge, maths, science, history, coding, creative writing. " +
  "For code requests, give complete runnable code in fenced Markdown blocks. " +
  "If you are unsure or the question is ambiguous, say so honestly or ask a short clarifying question. " +
  "Use Markdown for structure. If web search context is provided, use it and " +
  "clearly say when information may be outdated.";

const FREE_CHAT_URL = "https://text.pollinations.ai/";

interface RequestOptions {
  system: string;
  temperature: number;
}

function requestOptions(body: { system?: unknown; temperature?: unknown }): RequestOptions {
  const extra = typeof body.system === "string" ? body.system.trim().slice(0, 6000) : "";
  const temperature =
    typeof body.temperature === "number" && Number.isFinite(body.temperature)
      ? Math.min(1, Math.max(0, body.temperature))
      : 0.7;
  return {
    system: extra ? `${SYSTEM_PROMPT}\n\n${extra}` : SYSTEM_PROMPT,
    temperature,
  };
}

function normalizeMessages(input: unknown): ApiMessage[] | null {
  if (!Array.isArray(input)) return null;
  const messages = input
    .slice(-40)
    .map((item: { role?: unknown; content?: unknown }) => ({
      role: item?.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: typeof item?.content === "string" ? item.content.trim().slice(0, 12000) : "",
    }))
    .filter((m) => m.content.length > 0);
  return messages.length > 0 ? messages : null;
}

function sse(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function doneEvent(): Uint8Array {
  return new TextEncoder().encode("data: [DONE]\n\n");
}

async function anthropicStream(
  messages: ApiMessage[],
  signal: AbortSignal,
  options: RequestOptions
) {
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const stream = await client.messages.stream(
      {
        model: chatModel(),
        max_tokens: 2048,
        temperature: options.temperature,
        system: options.system,
        messages,
      },
      { signal }
    );

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        let wroteText = false;
        try {
          for await (const chunk of stream) {
            if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
              wroteText = true;
              controller.enqueue(sse({ text: chunk.delta.text }));
            }
          }
          controller.enqueue(doneEvent());
        } catch (error) {
          if (signal.aborted) {
            // Client stopped generation — nothing to do.
          } else if (!wroteText) {
            // Anthropic failed before producing anything (e.g. no credits):
            // seamlessly switch to the free model on this same stream.
            console.warn("Anthropic failed, using free model:", friendlyApiError(error, "unknown"));
            try {
              const fallback = await freeStream(messages, signal, options);
              const reader = fallback.getReader();
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                controller.enqueue(value);
              }
            } catch (fallbackError) {
              controller.enqueue(
                sse({ error: friendlyApiError(fallbackError, "Free model unavailable") })
              );
            }
          } else {
            controller.enqueue(
              sse({ error: friendlyApiError(error, "Stream interrupted") })
            );
          }
        } finally {
          controller.close();
        }
      },
      cancel() {
        if (!stream.aborted) stream.abort();
      },
    });
  } catch (error) {
    // Credit/key problems should not leave the user without a working chat.
    console.warn("Anthropic unavailable, using free model:", friendlyApiError(error, "unknown"));
    return null;
  }
}

function waitWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("Aborted"));
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function freeStream(
  messages: ApiMessage[],
  signal: AbortSignal,
  options: RequestOptions
) {
  const request = () =>
    fetch(FREE_CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Chat-Master/1.0" },
      body: JSON.stringify({
        messages: [{ role: "system", content: options.system }, ...messages],
        stream: true,
        max_tokens: 2048,
        temperature: options.temperature,
      }),
      signal,
    });

  let upstream = await request();
  if ((upstream.status === 402 || upstream.status === 429) && !signal.aborted) {
    const retrySeconds = Number(upstream.headers.get("retry-after")) || 45;
    await upstream.body?.cancel().catch(() => undefined);
    await waitWithAbort(Math.min(retrySeconds * 1000, 20000), signal);
    upstream = await request();
  }

  if (!upstream.ok || !upstream.body) {
    const detail = (await upstream.text().catch(() => "")).slice(0, 220);
    throw new Error(detail || `Free model unavailable (${upstream.status})`);
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let rawAll = "";
  let emitted = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const handleBlock = (block: string) => {
        const line = block.split("\n").find((part) => part.trim().startsWith("data: "));
        if (!line) return;
        const payload = line.trim().slice(6);
        if (payload === "[DONE]") return;
        try {
          const chunk = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
          };
          const content = chunk?.choices?.[0]?.delta?.content;
          if (typeof content === "string" && content.length > 0) {
            emitted = true;
            controller.enqueue(sse({ text: content }));
          }
        } catch {
          // Ignore malformed upstream chunks.
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const decoded = decoder.decode(value, { stream: true });
          rawAll += decoded;
          buffer += decoded;
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";
          blocks.forEach(handleBlock);
        }
        if (buffer.trim()) handleBlock(buffer);

        // Some upstream versions ignore `stream` and return one JSON object.
        if (!emitted && rawAll.trim().startsWith("{")) {
          try {
            const data = JSON.parse(rawAll) as {
              choices?: { message?: { content?: string } }[];
            };
            const content = data?.choices?.[0]?.message?.content;
            if (typeof content === "string" && content) controller.enqueue(sse({ text: content }));
          } catch {
            // Nothing usable from upstream.
          }
        }
        controller.enqueue(doneEvent());
      } catch (error) {
        if (!signal.aborted) {
          controller.enqueue(sse({ error: friendlyApiError(error, "Free model failed") }));
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      void reader.cancel().catch(() => undefined);
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const messages = normalizeMessages(body?.messages);
    if (!messages) {
      return NextResponse.json({ error: "messages array required" }, { status: 400 });
    }

    const provider = process.env.CHAT_PROVIDER?.trim().toLowerCase() || "auto";
    const options = requestOptions(body ?? {});
    let stream: ReadableStream<Uint8Array> | null = null;

    if (provider !== "free" && hasKey(process.env.ANTHROPIC_API_KEY)) {
      stream = await anthropicStream(messages, req.signal, options);
    }
    if (!stream) {
      if (provider === "anthropic") {
        return NextResponse.json(
          { error: "Anthropic unavailable — CHAT_PROVIDER=auto se free fallback chalao." },
          { status: 502 }
        );
      }
      stream = await freeStream(messages, req.signal, options);
    }

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    console.error("Chat API Error:", error);
    return NextResponse.json(
      { error: friendlyApiError(error, "Chat request failed") },
      { status: 500 }
    );
  }
}
