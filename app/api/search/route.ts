import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!process.env.TAVILY_API_KEY || process.env.TAVILY_API_KEY.startsWith("your_")) {
      return NextResponse.json(
        { error: "TAVILY_API_KEY placeholder/missing — .env.local mein real key dalo" },
        { status: 500 }
      );
    }
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: query,
        max_results: 5,
        include_answer: true,
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      console.error("Tavily API Error:", response.status, data);
      return NextResponse.json(
        { error: "Search failed (check TAVILY_API_KEY)" },
        { status: 502 }
      );
    }
    return NextResponse.json({
      answer: data?.answer ?? null,
      results: data?.results?.map((r: { title?: string; url?: string; content?: string }) => ({
        title: r.title,
        url: r.url,
        content: r.content?.substring(0, 200),
      })),
    });
  } catch (error) {
    console.error("Search API Error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
