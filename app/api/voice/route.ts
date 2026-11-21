import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json();
    if (!process.env.CARTESIA_API_KEY || process.env.CARTESIA_API_KEY.startsWith("your_")) {
      return NextResponse.json(
        { error: "CARTESIA_API_KEY placeholder/missing — .env.local mein real key dalo" },
        { status: 500 }
      );
    }
    const response = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        "X-API-Key": process.env.CARTESIA_API_KEY || "",
        "Cartesia-Version": "2024-06-10",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transcript: text,
        model_id: "sonic-english",
        voice: {
          mode: "id",
          id: "a0e99841-438c-4a64-b679-ae501e7d6091",
        },
        output_format: {
          container: "mp3",
          encoding: "mp3",
          sample_rate: 44100,
        },
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("Cartesia API Error:", response.status, detail);
      throw new Error("Cartesia failed");
    }
    const audioBuffer = await response.arrayBuffer();
    return new NextResponse(audioBuffer, {
      headers: { "Content-Type": "audio/mpeg" },
    });
  } catch {
    return NextResponse.json({ error: "Voice failed" }, { status: 500 });
  }
}
