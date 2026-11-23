export interface Preset {
  id: string;
  name: string;
  description: string;
  instructions: string;
}

export interface Preferences {
  presetId: string;
  customInstructions: string;
  memory: string[];
  temperature: number;
  autoSearch: boolean;
  autoSpeak: boolean;
}

const STORAGE_KEY = "chat-master:preferences:v1";

export const PRESETS: Preset[] = [
  {
    id: "general",
    name: "General",
    description: "Har din ke liye balanced assistant",
    instructions: "",
  },
  {
    id: "coder",
    name: "Code mentor",
    description: "Complete, runnable code aur simple explanation",
    instructions:
      "Act as a senior software engineer. Give complete runnable code in fenced blocks, mention the file name, list key edge cases, and keep explanations short. Prefer modern, secure defaults.",
  },
  {
    id: "teacher",
    name: "Teacher",
    description: "Step-by-step padhai, examples ke saath",
    instructions:
      "Act as a patient teacher. Break topics into small numbered steps, use simple everyday analogies, and end with a 2-question quick quiz.",
  },
  {
    id: "writer",
    name: "Writer",
    description: "Creative writing aur editing",
    instructions:
      "Act as a creative editor. Write vividly but avoid clichés. Offer one shorter alternative version at the end when the task is creative writing.",
  },
  {
    id: "translator",
    name: "Translator",
    description: "Natural translation, same meaning",
    instructions:
      "Act as a professional translator. Preserve tone and meaning, never translate proper nouns, and give only the translation unless the user asks for notes.",
  },
  {
    id: "analyst",
    name: "Data analyst",
    description: "Numbers, tables aur clear conclusions",
    instructions:
      "Act as a data analyst. Show assumptions, use compact Markdown tables for comparisons, and finish with one clear actionable conclusion.",
  },
  {
    id: "concise",
    name: "Short answers",
    description: "Sirf seedha jawab, kam shabdon me",
    instructions:
      "Answer in at most 4 short sentences unless the user explicitly asks for detail. No preamble, no filler, no restating the question.",
  },
];

export const DEFAULT_PREFERENCES: Preferences = {
  presetId: "general",
  customInstructions: "",
  memory: [],
  temperature: 0.7,
  autoSearch: true,
  autoSpeak: false,
};

export function loadPreferences(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      presetId: PRESETS.some((p) => p.id === parsed.presetId)
        ? (parsed.presetId as string)
        : DEFAULT_PREFERENCES.presetId,
      customInstructions:
        typeof parsed.customInstructions === "string"
          ? parsed.customInstructions.slice(0, 2000)
          : "",
      memory: Array.isArray(parsed.memory)
        ? parsed.memory.filter((item): item is string => typeof item === "string").slice(0, 40)
        : [],
      temperature:
        typeof parsed.temperature === "number" && Number.isFinite(parsed.temperature)
          ? Math.min(1, Math.max(0, parsed.temperature))
          : DEFAULT_PREFERENCES.temperature,
      autoSearch:
        typeof parsed.autoSearch === "boolean" ? parsed.autoSearch : DEFAULT_PREFERENCES.autoSearch,
      autoSpeak:
        typeof parsed.autoSpeak === "boolean" ? parsed.autoSpeak : DEFAULT_PREFERENCES.autoSpeak,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(prefs: Preferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage blocked — settings still apply for this session.
  }
}

export function systemAddition(prefs: Preferences): string {
  const preset = PRESETS.find((item) => item.id === prefs.presetId);
  const parts: string[] = [];
  if (preset?.instructions) parts.push(preset.instructions.trim());
  if (prefs.customInstructions.trim()) parts.push(prefs.customInstructions.trim());
  if (prefs.memory.length) {
    parts.push(
      `User facts to remember when relevant (do not invent others):\n- ${prefs.memory
        .map((item) => item.trim())
        .filter(Boolean)
        .join("\n- ")}`
    );
  }
  return parts.join("\n\n").slice(0, 5000);
}
