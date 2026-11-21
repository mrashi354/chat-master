import { NextRequest, NextResponse } from "next/server";
import { hasKey } from "@/lib/server-config";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text.trim().slice(0, 1000) : "";
    if (!text) {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }
    if (!hasKey(process.env.CARTESIA_API_KEY)) {
      return NextResponse.json(
        { error: "CARTESIA_API_KEY missing — .env.local mein real key dalo" },
        { status: 503 }
      );
    }

    const response = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        "X-API-Key": process.env.CARTESIA_API_KEY as string,
        "Cartesia-Version": "2024-06-10",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transcript: text,
        model_id: "sonic-english",
        voice: { mode: "id", id: "a0e99841-438c-4a64-b679-ae501e7d6091" },
        output_format: { container: "mp3", encoding: "mp3", sample_rate: 44100 },
      }),
      signal: req.signal,
    });

    if (!response.ok) {
      console.error("Cartesia API Error:", response.status, await response.text().catch(() => ""));
      return NextResponse.json({ error: "Voice service unavailable" }, { status: 502 });
    }

    return new NextResponse(await response.arrayBuffer(), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    console.error("Voice API Error:", error);
    return NextResponse.json({ error: "Voice failed" }, { status: 500 });
  }
}
