import { connection, NextResponse } from "next/server";
import { hasKey } from "@/lib/server-config";

export async function GET() {
  // Keys are runtime config — never bake the status into a build-time response.
  await connection();
  return NextResponse.json(
    {
      // Chat, search, image and video always work: free fallbacks are built in.
      chat: true,
      search: true,
      image: true,
      video: true,
      voiceInput: hasKey(process.env.OPENAI_API_KEY),
      voiceOutput: hasKey(process.env.CARTESIA_API_KEY),
      tools: true,
      files: true,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
