export type ToolName = "calc" | "convert" | "weather" | "read" | "wiki" | "define" | "time";

export interface ToolResult {
  name: string;
  output: string;
}

export interface ToolCommand {
  command: string;
  tool: ToolName;
  title: string;
  hint: string;
  example: string;
}

export const TOOL_COMMANDS: ToolCommand[] = [
  {
    command: "/calc",
    tool: "calc",
    title: "Calculator",
    hint: "Math expression solve karein",
    example: "/calc (12*8)+sqrt(81)",
  },
  {
    command: "/convert",
    tool: "convert",
    title: "Unit converter",
    hint: "Length, weight, temperature, data",
    example: "/convert 10 km to miles",
  },
  {
    command: "/weather",
    tool: "weather",
    title: "Weather",
    hint: "City ka live mausam (free API)",
    example: "/weather London",
  },
  {
    command: "/read",
    tool: "read",
    title: "Read a web page",
    hint: "URL ka text extract karein",
    example: "/read https://example.com",
  },
  {
    command: "/wiki",
    tool: "wiki",
    title: "Wikipedia",
    hint: "Quick encyclopedia summary",
    example: "/wiki Black hole",
  },
  {
    command: "/define",
    tool: "define",
    title: "Dictionary",
    hint: "English word ka meaning",
    example: "/define curious",
  },
  {
    command: "/time",
    tool: "time",
    title: "Time",
    hint: "Kisi bhi timezone me waqt",
    example: "/time Asia/Kolkata",
  },
];

export function parseCommand(text: string): { tool: ToolName; args: string } | null {
  const match = text.match(/^\s*\/([a-z]+)\s*([\s\S]*)$/i);
  if (!match) return null;
  const command = TOOL_COMMANDS.find((item) => item.command === `/${match[1].toLowerCase()}`);
  if (!command) return null;
  return { tool: command.tool, args: match[2].trim() };
}

const WEATHER_STOP_WORDS = new Set([
  "aaj", "today", "kal", "tomorrow", "abhi", "now", "current", "ab",
  "ka", "ki", "ke", "kya", "kaisa", "kaise", "hai", "he", "me", "mein", "में",
  "in", "at", "for", "of", "the", "what", "whats", "is", "how", "does", "like",
  "weather", "mausam", "मौसम", "موسم", "batao", "batayein", "do", "please", "pls", "kindly",
]);

function weatherPlace(text: string): string {
  return text
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word && !WEATHER_STOP_WORDS.has(word.toLowerCase()))
    .slice(0, 3)
    .join(" ")
    .slice(0, 80);
}

/** Natural-language hints that can be answered by a deterministic tool. */
export function detectTool(text: string): { tool: ToolName; args: string } | null {
  const explicit = parseCommand(text);
  if (explicit) return explicit;

  const clean = text.trim();
  if (clean.length <= 120 && /^[\d\s.+\-*\/^%(),]+=?$/.test(clean) && /[+\-*/^]/.test(clean)) {
    return { tool: "calc", args: clean.replace(/=$/, "") };
  }
  if (/\b(weather|mausam|मौसम|موسم)\b/i.test(clean) && clean.length <= 160) {
    return { tool: "weather", args: weatherPlace(clean) };
  }
  if (/\b(define|meaning of|ka matlab|मतलब)\b/i.test(clean) && clean.length <= 120) {
    const word = clean.replace(/.*?(?:define|meaning of|ka matlab|मतलब)\s+/i, "").trim();
    if (word) return { tool: "define", args: word };
  }
  return null;
}

export function isCommand(text: string): boolean {
  return /^\s*\//.test(text);
}
