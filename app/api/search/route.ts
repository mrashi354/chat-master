import { NextRequest, NextResponse } from "next/server";
import { hasKey } from "@/lib/server-config";

interface Source {
  title: string;
  url: string;
}

interface SearchResult {
  answer: string | null;
  context: string;
  sources: Source[];
}

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
}

async function tavilySearch(query: string, signal: AbortSignal): Promise<SearchResult> {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      max_results: 5,
      include_answer: true,
      search_depth: "basic",
    }),
    signal,
  });
  if (!response.ok) throw new Error(`Tavily ${response.status}`);

  const data = (await response.json().catch(() => null)) as {
    answer?: string;
    results?: TavilyResult[];
  } | null;

  const sources = (data?.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({ title: (r.title || r.url || "Source").slice(0, 120), url: r.url as string }));

  const context = [
    data?.answer ? `Summary: ${data.answer}` : "",
    ...(data?.results ?? []).map(
      (r) => `Source: ${r.title ?? r.url}\nURL: ${r.url ?? ""}\n${r.content ?? ""}`
    ),
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 6000);

  return { answer: data?.answer ?? null, context, sources };
}

// Free, keyless fallback: DuckDuckGo instant answers + Wikipedia summary.
async function freeSearch(query: string, signal: AbortSignal): Promise<SearchResult> {
  const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=chat-master`;
  const response = await fetch(ddgUrl, {
    headers: { "User-Agent": "Chat-Master/1.0" },
    signal,
  });
  if (!response.ok) throw new Error(`DuckDuckGo ${response.status}`);

  const data = (await response.json().catch(() => null)) as {
    AbstractText?: string;
    AbstractURL?: string;
    Heading?: string;
    RelatedTopics?: { Text?: string; FirstURL?: string; Topics?: { Text?: string; FirstURL?: string }[] }[];
  } | null;

  const parts: string[] = [];
  const sources: Source[] = [];

  if (data?.AbstractText) {
    parts.push(`Summary: ${data.AbstractText}`);
    sources.push({
      title: (data.Heading || "DuckDuckGo").slice(0, 120),
      url: data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
    });
  }

  const topics = (data?.RelatedTopics ?? []).flatMap((topic) =>
    topic.Topics?.length ? topic.Topics : [topic]
  );
  for (const topic of topics.slice(0, 5)) {
    if (!topic.Text || !topic.FirstURL) continue;
    parts.push(`Source: ${topic.Text}`);
    sources.push({ title: topic.Text.slice(0, 120), url: topic.FirstURL });
  }

  if (parts.length === 0) {
    try {
      const wiki = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`,
        { headers: { "User-Agent": "Chat-Master/1.0" }, signal }
      );
      if (wiki.ok) {
        const page = (await wiki.json()) as {
          title?: string;
          extract?: string;
          content_urls?: { desktop?: { page?: string } };
        };
        if (page.extract) {
          parts.push(`Summary: ${page.extract}`);
          sources.push({
            title: (page.title || "Wikipedia").slice(0, 120),
            url: page.content_urls?.desktop?.page || "https://en.wikipedia.org",
          });
        }
      }
    } catch {
      // Wikipedia optional — ignore failures.
    }
  }

  if (parts.length === 0) {
    parts.push(
      `No live snippet found for "${query}". Answer with general knowledge and say live data is unavailable.`
    );
  }

  return { answer: parts[0], context: parts.join("\n\n").slice(0, 6000), sources };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const query = typeof body?.query === "string" ? body.query.trim().slice(0, 500) : "";
    if (!query) return NextResponse.json({ error: "query required" }, { status: 400 });

    let result: SearchResult;
    try {
      result = hasKey(process.env.TAVILY_API_KEY)
        ? await tavilySearch(query, req.signal)
        : await freeSearch(query, req.signal);
    } catch (error) {
      if (hasKey(process.env.TAVILY_API_KEY)) {
        console.warn("Tavily failed, using free search:", error);
        result = await freeSearch(query, req.signal);
      } else {
        throw error;
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    console.error("Search API Error:", error);
    return NextResponse.json({ error: "Search fail ho gaya" }, { status: 500 });
  }
}
