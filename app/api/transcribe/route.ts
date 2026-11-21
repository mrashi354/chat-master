import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { hasKey } from "@/lib/server-config";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    if (!hasKey(process.env.OPENAI_API_KEY)) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY missing — .env.local mein real key dalo" },
        { status: 503 }
      );
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        { error: "Audio file nahi mila (multipart/form-data expected)" },
        { status: 400 }
      );
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Audio file empty hai" }, { status: 400 });
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "Audio 25MB se chhota hona chahiye" }, { status: 413 });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const transcription = await openai.audio.transcriptions.create(
      { file, model: "whisper-1" },
      { signal: req.signal }
    );

    const text = transcription.text?.trim();
    if (!text) {
      return NextResponse.json({ error: "Kuch samajh nahi aaya, dobara boliye" }, { status: 422 });
    }
    return NextResponse.json({ text });
  } catch (error) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    console.error("Transcribe API Error:", error);
    return NextResponse.json({ error: "Transcription failed" }, { status: 500 });
  }
}
