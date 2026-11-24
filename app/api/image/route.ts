import { NextRequest, NextResponse } from "next/server";

const HORDE_URL = "https://aihorde.net/api/v2";
const POLLINATIONS_URL = "https://image.pollinations.ai/prompt/";
const ANONYMOUS_KEY = "0000000000";

// Realistic-first model list. AI Horde routes to whichever worker has one of these.
const HORDE_MODELS = ["Realistic Vision", "Deliberate", "stable_diffusion"];
const NEGATIVE_PROMPT =
  "cartoon, anime, illustration, painting, drawing, sketch, 3d render, lowres, " +
  "blurry, distorted, deformed, bad anatomy, extra fingers, watermark, text";

type GeneratedImage = { bytes: ArrayBuffer; contentType: string };

function hordeHeaders(): Record<string, string> {
  return {
    apikey: process.env.AI_HORDE_API_KEY?.trim() || ANONYMOUS_KEY,
    "Content-Type": "application/json",
    "Client-Agent": "Chat-Master:1.0:local",
  };
}

function realisticPrompt(prompt: string): string {
  if (/\b(cartoon|anime|illustration|painting|drawing|sketch|pixel art|3d render)\b/i.test(prompt)) {
    return prompt;
  }
  if (/photorealistic|photo-realistic/i.test(prompt)) return prompt;
  return (
    `${prompt}, photorealistic, highly detailed, natural lighting, sharp focus, ` +
    `realistic textures, professional photography, 8k`
  );
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Start a fallback only after `ms`, unless the caller aborts first. */
function delayedStart<T>(factory: () => Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      factory().then(resolve, reject);
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function generateWithHorde(prompt: string, signal: AbortSignal): Promise<GeneratedImage> {
  const headers = hordeHeaders();
  const submit = await fetch(`${HORDE_URL}/generate/async`, {
    method: "POST",
    headers,
    signal,
    body: JSON.stringify({
      prompt,
      models: HORDE_MODELS,
      params: {
        width: 512,
        height: 512,
        steps: 28,
        cfg_scale: 7,
        karras: true,
        sampler_name: "k_euler_a",
        negative_prompt: NEGATIVE_PROMPT,
        n: 1,
      },
      r2: true,
      censor_nsfw: false,
    }),
  });

  if (!submit.ok) {
    throw new Error(`AI Horde ${submit.status}`);
  }
  const job = (await submit.json().catch(() => null)) as { id?: string } | null;
  if (!job?.id) throw new Error("AI Horde job nahi mila.");

  // Short leash — the parallel Pollinations fallback usually answers sooner.
  const deadline = Date.now() + 60_000;
  let done = false;
  while (Date.now() < deadline) {
    await wait(1200, signal);
    const check = await fetch(`${HORDE_URL}/generate/check/${job.id}`, { headers, signal });
    if (!check.ok) throw new Error(`AI Horde check ${check.status}`);
    const status = (await check.json().catch(() => null)) as { done?: boolean } | null;
    if (status?.done) {
      done = true;
      break;
    }
  }
  if (!done) throw new Error("Image generation mein zyada time laga.");

  const statusRes = await fetch(`${HORDE_URL}/generate/status/${job.id}`, { headers, signal });
  if (!statusRes.ok) throw new Error(`AI Horde status ${statusRes.status}`);
  const result = (await statusRes.json().catch(() => null)) as {
    generations?: { img?: string; censored?: boolean }[];
  } | null;
  const generation = result?.generations?.[0];
  if (!generation?.img || generation.censored) {
    throw new Error("Worker ne image block kar di (safe filter).");
  }

  const imageRes = await fetch(generation.img, { signal });
  if (!imageRes.ok) throw new Error(`Image download ${imageRes.status}`);
  const contentType = imageRes.headers.get("content-type") || "image/webp";
  if (!contentType.startsWith("image/")) throw new Error("Image response invalid tha.");
  return { bytes: await imageRes.arrayBuffer(), contentType };
}

async function generateWithPollinations(
  prompt: string,
  signal: AbortSignal
): Promise<GeneratedImage> {
  // Fail fast — Horde is racing in parallel, so long waits only add latency.
  for (let attempt = 0; attempt < 2; attempt++) {
    const seed = Math.floor(Math.random() * 1_000_000_000);
    const url = `${POLLINATIONS_URL}${encodeURIComponent(prompt)}?nologo=true&seed=${seed}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Chat-Master/1.0" },
      signal,
    });

    if (response.ok) {
      const contentType = response.headers.get("content-type") || "image/jpeg";
      if (!contentType.startsWith("image/")) throw new Error("Image response invalid tha.");
      return { bytes: await response.arrayBuffer(), contentType };
    }

    if ((response.status === 402 || response.status === 429) && attempt < 1) {
      await response.arrayBuffer().catch(() => undefined);
      const retryAfter = Number(response.headers.get("retry-after")) || 5;
      await wait(Math.min(retryAfter, 5) * 1000, signal);
      continue;
    }

    throw new Error(`Image service busy (${response.status}).`);
  }
  throw new Error("Image service busy — thoda wait karke dobara try karein.");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const rawPrompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, 1000) : "";
    if (!rawPrompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

    const prompt = realisticPrompt(rawPrompt);
    let result: GeneratedImage;
    let provider: string;

    // Race both free providers: Horde starts now, Pollinations joins after 6s.
    // Winner wins; the slower request is aborted to avoid wasting work.
    const race = new AbortController();
    const forwardAbort = () => race.abort();
    req.signal.addEventListener("abort", forwardAbort, { once: true });
    try {
      const horde = generateWithHorde(prompt, race.signal).then((bytes) => ({ bytes, provider: "horde" }));
      const pollinations = delayedStart(
        () => generateWithPollinations(prompt, race.signal),
        6000,
        race.signal
      ).then((bytes) => ({ bytes, provider: "pollinations" }));

      const winner = await Promise.any([horde, pollinations]);
      race.abort();
      result = winner.bytes;
      provider = winner.provider;
    } catch {
      if (req.signal.aborted) throw new DOMException("Aborted", "AbortError");
      throw new Error("Dono free image services busy hain — thodi der baad try karein.");
    } finally {
      req.signal.removeEventListener("abort", forwardAbort);
    }

    return new NextResponse(result.bytes, {
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "no-store",
        "X-Image-Provider": provider,
      },
    });
  } catch (error) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    console.error("Image API Error:", error);
    const message = (error as Error).message || "Image generate nahi ho paya.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
