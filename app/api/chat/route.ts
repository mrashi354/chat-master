import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Anthropic APIError se sabse useful message nikalo
function extractErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as {
      error?: { error?: { message?: string } };
      message?: string;
    };
    const inner = e.error?.error?.message;
    if (typeof inner === "string" && inner.length > 0) return inner.slice(0, 300);
    if (typeof e.message === "string" && e.message.length > 0)
      return e.message.slice(0, 300);
  }
  return "Stream interrupted";
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not set in .env.local" },
        { status: 500 }
      );
    }

    const { messages } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "messages array required" }, { status: 400 });
    }

    const stream = await client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: `You are Chat-Master, a helpful AI assistant like Siri/ChatGPT.
               You can answer questions, help with tasks, and search the web when needed.
               Be concise, friendly and helpful.
               The user may ask in Hindi, Urdu or English — reply in the same language they use.`,
      messages: messages,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`)
              );
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (streamError) {
          console.error("Stream error:", streamError);
          const msg = extractErrorMessage(streamError);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`)
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat API Error:", error);
    return NextResponse.json({ error: extractErrorMessage(error) }, { status: 500 });
  }
}
