import { NextRequest, NextResponse } from "next/server";
import type { ToolName } from "@/lib/tools";

const MAX_INPUT = 1500;

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": "Chat-Master/1.0 (+https://github.com/mrashi354/chat-master)",
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/* ----------------------------- calculator ----------------------------- */

type Token = { type: "num" | "name" | "op"; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const char = input[i];
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      let number = "";
      while (i < input.length && /[0-9.]/.test(input[i])) number += input[i++];
      if ((number.match(/\./g) ?? []).length > 1) throw new Error("Invalid number");
      tokens.push({ type: "num", value: number });
      continue;
    }
    if (/[a-z]/i.test(char)) {
      let name = "";
      while (i < input.length && /[a-z]/i.test(input[i])) name += input[i++];
      tokens.push({ type: "name", value: name.toLowerCase() });
      continue;
    }
    if ("+-*/^%(),".includes(char)) {
      tokens.push({ type: "op", value: char });
      i++;
      continue;
    }
    throw new Error(`Unsupported character: ${char}`);
  }
  return tokens;
}

class Calculator {
  private pos = 0;
  private steps = 0;

  constructor(private readonly tokens: Token[]) {}

  private get current(): Token | undefined {
    return this.tokens[this.pos];
  }

  private eat(value: string): boolean {
    if (this.current?.value === value) {
      this.pos++;
      return true;
    }
    return false;
  }

  private step() {
    if (++this.steps > 500) throw new Error("Expression too complex");
  }

  parse(): number {
    const result = this.expression();
    if (this.pos !== this.tokens.length) throw new Error("Invalid expression");
    if (!Number.isFinite(result)) throw new Error("Result is not a finite number");
    return result;
  }

  private expression(): number {
    this.step();
    let value = this.term();
    while (this.current?.value === "+" || this.current?.value === "-") {
      const op = this.tokens[this.pos++].value;
      const right = this.term();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }

  private term(): number {
    this.step();
    let value = this.power();
    while (this.current?.value === "*" || this.current?.value === "/" || this.current?.value === "%") {
      const op = this.tokens[this.pos++].value;
      const right = this.power();
      if ((op === "/" || op === "%") && right === 0) throw new Error("Division by zero");
      value = op === "*" ? value * right : op === "/" ? value / right : value % right;
    }
    return value;
  }

  private power(): number {
    this.step();
    const base = this.unary();
    if (this.eat("^")) return Math.pow(base, this.power());
    return base;
  }

  private unary(): number {
    this.step();
    if (this.eat("+")) return this.unary();
    if (this.eat("-")) return -this.unary();
    return this.primary();
  }

  private primary(): number {
    this.step();
    const token = this.current;
    if (!token) throw new Error("Incomplete expression");

    if (token.type === "num") {
      this.pos++;
      return Number(token.value);
    }
    if (this.eat("(")) {
      const value = this.expression();
      if (!this.eat(")")) throw new Error("Missing closing bracket");
      return value;
    }
    if (token.type === "name") {
      this.pos++;
      const args: number[] = [];
      if (this.eat("(")) {
        if (!this.eat(")")) {
          do {
            args.push(this.expression());
          } while (this.eat(","));
          if (!this.eat(")")) throw new Error("Missing closing bracket");
        }
      }
      const fn = FUNCTIONS[token.value];
      if (fn) return fn(args);
      const constant = CONSTANTS[token.value];
      if (constant !== undefined && args.length === 0) return constant;
      throw new Error(`Unknown function: ${token.value}`);
    }
    throw new Error("Invalid expression");
  }
}

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };
const FUNCTIONS: Record<string, (args: number[]) => number> = {
  sqrt: ([a]) => Math.sqrt(a ?? NaN),
  abs: ([a]) => Math.abs(a ?? NaN),
  round: ([a]) => Math.round(a ?? NaN),
  floor: ([a]) => Math.floor(a ?? NaN),
  ceil: ([a]) => Math.ceil(a ?? NaN),
  sin: ([a]) => Math.sin(a ?? NaN),
  cos: ([a]) => Math.cos(a ?? NaN),
  tan: ([a]) => Math.tan(a ?? NaN),
  log: ([a]) => Math.log(a ?? NaN),
  log10: ([a]) => Math.log10(a ?? NaN),
  pow: ([a, b]) => Math.pow(a ?? NaN, b ?? NaN),
  min: (args) => Math.min(...args),
  max: (args) => Math.max(...args),
};

function calculate(input: string): string {
  const clean = input.replace(/=$/, "").replace(/[×]/g, "*").replace(/[÷]/g, "/");
  const value = new Calculator(tokenize(clean)).parse();
  const rounded = Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10)));
  return `${clean} = **${rounded}**`;
}

/* --------------------------- unit converter --------------------------- */

type Unit = { factor: number; names: string[] };
const UNITS: Record<string, Record<string, Unit>> = {
  length: {
    m: { factor: 1, names: ["m", "meter", "meters", "metre", "metres", "मीटर"] },
    km: { factor: 1000, names: ["km", "kilometer", "kilometers", "kilometre", "किमी"] },
    cm: { factor: 0.01, names: ["cm", "centimeter", "centimeters"] },
    mm: { factor: 0.001, names: ["mm", "millimeter", "millimeters"] },
    mi: { factor: 1609.344, names: ["mi", "mile", "miles", "माइल"] },
    ft: { factor: 0.3048, names: ["ft", "foot", "feet", "फीट"] },
    in: { factor: 0.0254, names: ["in", "inch", "inches"] },
    yd: { factor: 0.9144, names: ["yd", "yard", "yards"] },
  },
  weight: {
    kg: { factor: 1, names: ["kg", "kilogram", "kilograms", "किलो"] },
    g: { factor: 0.001, names: ["g", "gram", "grams"] },
    mg: { factor: 0.000001, names: ["mg", "milligram", "milligrams"] },
    lb: { factor: 0.45359237, names: ["lb", "lbs", "pound", "pounds"] },
    oz: { factor: 0.028349523, names: ["oz", "ounce", "ounces"] },
  },
  data: {
    b: { factor: 1, names: ["b", "byte", "bytes"] },
    kb: { factor: 1024, names: ["kb", "kilobyte", "kilobytes"] },
    mb: { factor: 1024 ** 2, names: ["mb", "megabyte", "megabytes"] },
    gb: { factor: 1024 ** 3, names: ["gb", "gigabyte", "gigabytes"] },
    tb: { factor: 1024 ** 4, names: ["tb", "terabyte", "terabytes"] },
  },
  time: {
    s: { factor: 1, names: ["s", "sec", "second", "seconds"] },
    min: { factor: 60, names: ["min", "minute", "minutes"] },
    h: { factor: 3600, names: ["h", "hr", "hour", "hours"] },
    d: { factor: 86400, names: ["d", "day", "days"] },
    week: { factor: 604800, names: ["week", "weeks"] },
  },
};

function findUnit(token: string): { category: string; key: string } | null {
  const value = token.toLowerCase().replace(/\.$/, "");
  for (const [category, units] of Object.entries(UNITS)) {
    for (const [key, unit] of Object.entries(units)) {
      if (unit.names.includes(value)) return { category, key };
    }
  }
  return null;
}

function convert(input: string): string {
  const cleaned = input
    .replace(/\s+(?:ko|to|into|me|में|से)\s+/gi, " to ")
    .replace(/°/g, " ")
    .trim();
  const match = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*([a-z]+\.?)\s+to\s+([a-z]+\.?)$/i);
  if (!match) throw new Error("Format: 10 km to miles");
  const amount = Number(match[1]);
  const from = findUnit(match[2]);
  const to = findUnit(match[3]);

  if (from && to && from.category === to.category) {
    const base = amount * UNITS[from.category][from.key].factor;
    const result = base / UNITS[to.category][to.key].factor;
    return `${amount} ${match[2]} = **${Number(result.toFixed(8))} ${match[3]}**`;
  }

  const tempFrom = match[2].toLowerCase();
  const tempTo = match[3].toLowerCase();
  const tempAliases: Record<string, string> = { c: "c", "°c": "c", celsius: "c", f: "f", "°f": "f", fahrenheit: "f", k: "k", kelvin: "k" };
  const a = tempAliases[tempFrom];
  const b = tempAliases[tempTo];
  if (a && b) {
    const celsius = a === "c" ? amount : a === "f" ? ((amount - 32) * 5) / 9 : amount - 273.15;
    const result = b === "c" ? celsius : b === "f" ? celsius * 1.8 + 32 : celsius + 273.15;
    return `${amount} ${tempFrom.toUpperCase()} = **${Number(result.toFixed(2))} ${tempTo.toUpperCase()}**`;
  }
  throw new Error("Unsupported units");
}

/* ------------------------------- weather ------------------------------ */

const WEATHER_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Rain showers",
  82: "Violent showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with hail",
};

async function weather(query: string, hint: string): Promise<string> {
  const place = query.trim() || hint.trim() || "Delhi";
  const geoRes = await fetchWithTimeout(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`
  );
  if (!geoRes.ok) throw new Error("Location service unavailable");
  const geo = (await geoRes.json()) as {
    results?: { name: string; country?: string; latitude: number; longitude: number }[];
  };
  const location = geo.results?.[0];
  if (!location) throw new Error(`Location not found: ${place}`);

  const forecastRes = await fetchWithTimeout(
    `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`
  );
  if (!forecastRes.ok) throw new Error("Weather service unavailable");
  const data = (await forecastRes.json()) as {
    current?: {
      temperature_2m: number;
      relative_humidity_2m: number;
      weather_code: number;
      wind_speed_10m: number;
    };
  };
  const current = data.current;
  if (!current) throw new Error("Weather data missing");
  const label = [location.name, location.country].filter(Boolean).join(", ");
  return [
    `**${label} — current weather**`,
    `Condition: ${WEATHER_CODES[current.weather_code] ?? `Code ${current.weather_code}`}`,
    `Temperature: ${current.temperature_2m}°C`,
    `Humidity: ${current.relative_humidity_2m}%`,
    `Wind: ${current.wind_speed_10m} km/h`,
  ].join("\n");
}

/* ------------------------------ web tools ----------------------------- */

function isPrivateHost(host: string): boolean {
  const hostname = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  if (hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80:")) return true;
  if (/\.(local|internal|test|invalid)$/.test(hostname)) return true;
  if (/^127\./.test(hostname) || /^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^169\.254\./.test(hostname)) return true;
  const private172 = hostname.match(/^172\.(\d+)\./);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return true;
  if (/^0\./.test(hostname) || hostname === "0.0.0.0") return true;
  return false;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<title[^>]*>([\s\S]*?)<\/title>/i, (_m, title: string) => `\n# ${title}\n`)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function readPage(rawUrl: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Valid URL likhein (https://example.com)");
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only http/https URLs are allowed");
  if (url.username || url.password) throw new Error("URL credentials are not allowed");
  if (isPrivateHost(url.hostname)) throw new Error("Private/local URLs block hain");

  let target = url;
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetchWithTimeout(target.toString(), { redirect: "manual" }, 11000);
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      const next = new URL(location, target);
      if (
        !/^https?:$/.test(next.protocol) ||
        next.username ||
        next.password ||
        isPrivateHost(next.hostname)
      ) {
        throw new Error("Redirect private/local URL par nahi ja sakta");
      }
      target = next;
      continue;
    }
    if (!response.ok) throw new Error(`Page fetch failed (${response.status})`);
    const html = (await response.text()).slice(0, 300000);
    const text = htmlToText(html);
    if (!text) throw new Error("Page se text nahi mila");
    return `**${target.hostname}**\n\n${text.slice(0, 7000)}`;
  }
  throw new Error("Bahut zyade redirects");
}

async function wiki(topic: string): Promise<string> {
  if (!topic) throw new Error("Topic likhein");
  const response = await fetchWithTimeout(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic.replace(/ /g, "_"))}`
  );
  if (!response.ok) throw new Error("Wikipedia result nahi mila");
  const data = (await response.json()) as { title?: string; extract?: string; content_urls?: { desktop?: { page?: string } } };
  if (!data.extract) throw new Error("Wikipedia result nahi mila");
  const link = data.content_urls?.desktop?.page ? `\n\nSource: ${data.content_urls.desktop.page}` : "";
  return `**${data.title ?? topic}**\n\n${data.extract.slice(0, 2500)}${link}`;
}

async function define(word: string): Promise<string> {
  if (!word) throw new Error("Word likhein");
  const response = await fetchWithTimeout(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.split(/\s+/)[0])}`
  );
  if (!response.ok) throw new Error("Definition nahi mila");
  const data = (await response.json()) as Array<{
    word?: string;
    phonetic?: string;
    meanings?: { partOfSpeech?: string; definitions?: { definition?: string; example?: string }[] }[];
  }>;
  const entry = data[0];
  const lines = [`**${entry?.word ?? word}**${entry?.phonetic ? ` — /${entry.phonetic}/` : ""}`];
  for (const meaning of (entry?.meanings ?? []).slice(0, 3)) {
    const definition = meaning.definitions?.[0];
    if (!definition?.definition) continue;
    lines.push(`- *${meaning.partOfSpeech ?? "word"}:* ${definition.definition}`);
    if (definition.example) lines.push(`  - eg: ${definition.example}`);
  }
  if (lines.length === 1) throw new Error("Definition nahi mila");
  return lines.join("\n");
}

function time(zone: string): string {
  const target = zone.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: target,
    dateStyle: "full",
    timeStyle: "long",
  });
  return `**${target}** — ${formatter.format(new Date())}`;
}

/* ------------------------------- handler ------------------------------ */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const tool = body?.tool as ToolName;
    const input = typeof body?.input === "string" ? body.input.trim().slice(0, MAX_INPUT) : "";
    const hint = typeof body?.hint === "string" ? body.hint.slice(0, 120) : "";

    let output: string;
    switch (tool) {
      case "calc":
        output = calculate(input);
        break;
      case "convert":
        output = convert(input);
        break;
      case "weather":
        output = await weather(input, hint);
        break;
      case "read":
        output = await readPage(input);
        break;
      case "wiki":
        output = await wiki(input);
        break;
      case "define":
        output = await define(input);
        break;
      case "time":
        output = time(input);
        break;
      default:
        return NextResponse.json({ error: "Unknown tool" }, { status: 400 });
    }
    return NextResponse.json({ tool, output }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    const message = error instanceof Error ? error.message : "Tool fail ho gaya";
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 400 });
  }
}
