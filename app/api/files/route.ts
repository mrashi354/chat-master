import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";

const MAX_BYTES = 12 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File required" }, { status: 400 });
    }
    if (file.size === 0 || file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File size 0–12 MB hona chahiye" }, { status: 400 });
    }
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return NextResponse.json({ error: "Sirf PDF parse kiya jata hai" }, { status: 415 });
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const pdf = await getDocumentProxy(buffer);
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    const pages = Array.isArray(text) ? text : [text];
    const joined = pages.join("\n\n").replace(/\s+/g, " ").trim();

    return NextResponse.json(
      {
        name: file.name,
        pages: totalPages,
        text: joined.slice(0, 60000),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    const message = error instanceof Error ? error.message : "PDF read nahi ho payi";
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 400 });
  }
}
