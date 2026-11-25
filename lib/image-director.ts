import Anthropic from "@anthropic-ai/sdk";
import { chatModel, hasKey } from "@/lib/server-config";

export interface ImagePlan {
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  style: string;
  thought: boolean;
  raw: string;
}

interface StyleRule {
  id: string;
  test: RegExp;
  tags: string;
  negative: string[];
}

const STYLE_RULES: StyleRule[] = [
  {
    id: "anime",
    test: /\b(anime|manga|cartoon\s*anime|जापानी\s*कार्टून)\b/i,
    tags: "anime style, cel shading, vibrant colours, expressive eyes, detailed anime background, studio quality",
    negative: ["photorealistic", "realistic skin", "3d render"],
  },
  {
    id: "cartoon",
    test: /\b(cartoon|caricature|comic|kids?\s*illustration|children'?s?\s*book|कार्टून|कॉमिक)\b/i,
    tags: "cartoon illustration, bold clean outlines, flat vibrant colours, playful character design, smooth shapes",
    negative: ["photorealistic", "realistic skin", "gritty texture"],
  },
  {
    id: "pixel",
    test: /\b(pixel\s*art|8\s*bit|16\s*bit|retro\s*game)\b/i,
    tags: "pixel art, crisp square pixels, retro game sprite, limited colour palette, clean silhouette",
    negative: ["photorealistic", "blurry", "anti-aliased edges"],
  },
  {
    id: "logo",
    test: /\b(logo|icon|emblem|brand\s*mark|monogram|लोगो|आइकन)\b/i,
    tags: "clean vector logo design, minimal flat colours, centred composition, crisp edges, simple background",
    negative: ["photorealistic", "cluttered background", "busy detail"],
  },
  {
    id: "3d",
    test: /\b(3\s*d|three[-\s]?dimensional|blender|octane|render)\b/i,
    tags: "high-quality 3D render, soft studio lighting, detailed materials, depth of field, clean geometry",
    negative: ["flat 2d", "hand-drawn sketch"],
  },
  {
    id: "watercolor",
    test: /\b(water\s*colour|watercolor|wash\s*painting|जलरंग)\b/i,
    tags: "watercolour painting, soft pigment washes, delicate brush strokes, paper texture, gentle lighting",
    negative: ["photorealistic", "harsh contrast", "3d render"],
  },
  {
    id: "oil",
    test: /\b(oil\s*painting|canvas\s*painting|brush\s*strokes|तेल\s*चित्र)\b/i,
    tags: "oil painting on canvas, visible brush strokes, rich colour layering, classical composition, museum quality",
    negative: ["photorealistic", "flat vector", "3d render"],
  },
  {
    id: "cinematic",
    test: /\b(cinematic|movie\s*still|film\s*still|blockbuster|dramatic\s*light|सिनेमैटिक|फिल्मी)\b/i,
    tags: "cinematic still, dramatic rim lighting, anamorphic lens, film grain, colour graded, shallow depth of field",
    negative: ["flat lighting", "amateur snapshot"],
  },
  {
    id: "photo",
    test: /\b(photo|photograph|photorealistic|realistic|portrait|selfie|film\s*photo|फोटो|तस्वीर|यथार्थ)\b/i,
    tags: "photorealistic, professional photography, natural lighting, sharp focus, realistic textures, shallow depth of field",
    negative: ["cartoon", "anime", "illustration", "painting", "3d render"],
  },
];

// Hinglish/Hindi words that image models understand far better in English.
const TRANSLATIONS: Array<[RegExp, string]> = [
  [/\b(scripeo|scripteo|scripe|scrpio|scripyo|स्क्रिप्ट)\b/gi, "script"],
  [/\bscript\s+([a-z]+)\s+(?:image|photo|picture|poster|img)\b/gi, "$1 poster with elegant handwritten script text"],
  [/\bscript\s+(?:image|photo|picture|poster|img)\b/gi, "poster with elegant handwritten script text"],
  [/\b(img|tasveer|तस्वीर|फोटो)\b/gi, "image"],
  [/\b(ladki|larki|girl|बच्ची|लड़की)\b/gi, "young woman"],
  [/\b(ladka|larka|बच्चा|लड़का)\b/gi, "young man"],
  [/\b(aurat|mahila|woman|स्त्री|महिला|औरत)\b/gi, "woman"],
  [/\b(manus|insaan|mard|आदमी|मनुष्य|इंसान)\b/gi, "man"],
  [/\b(kutta|kutte|dog|कुत्ता)\b/gi, "dog"],
  [/\b(billi|biloni|cat|बिल्ली)\b/gi, "cat"],
  [/\b(ghar|house|घर)\b/gi, "house"],
  [/\b(jungle|forest|जंगल)\b/gi, "forest"],
  [/\b(samundar|ocean|sea|समुद्र)\b/gi, "ocean"],
  [/\b(suraj|sun|सूरज)\b/gi, "sun"],
  [/\b(chand|chaand|moon|चाँद|चंद)\b/gi, "moon"],
  [/\b(phool|flowers?|फूल)\b/gi, "flowers"],
  [/\b(ped|tree|पेड़)\b/gi, "tree"],
  [/\b(paani|water|पानी)\b/gi, "water"],
  [/\b(aag|fire|आग)\b/gi, "fire"],
  [/\b(hawa|wind|हवा)\b/gi, "wind"],
  [/\b(safed|white|सफ़ेद|सफेद)\b/gi, "white"],
  [/\b(kaala|kala|black|काला)\b/gi, "black"],
  [/\b(lal|red|लाल)\b/gi, "red"],
  [/\b(neela|blue|नीला)\b/gi, "blue"],
  [/\b(hara|green|हरा)\b/gi, "green"],
  [/\b(sundar|beautiful|सुंदर)\b/gi, "beautiful"],
  [/\b(bada|large|बड़ा)\b/gi, "large"],
  [/\b(chhota|small|छोटा)\b/gi, "small"],
  [/\b(khada|khadi|standing|खड़ा|खड़ी)\b/gi, "standing"],
  [/\b(baitha|baithi|sitting|बैठा|बैठी)\b/gi, "sitting"],
  [/\b(daud|running|दौड़)\b/gi, "running"],
  [/\b(muskura|smiling|मुस्कुरा)\b/gi, "smiling"],
  [/\b(ke\s*saath|with|के\s*साथ)\b/gi, "with"],
  [/\b(aur|and|और)\b/gi, "and"],
  [/\b(?:pm|prime\s+minister)\s+modi\b/gi, "Narendra Modi"],
  [/\bpm\b/gi, "Prime Minister"],
];

const DIRECTOR_SYSTEM =
  "You are an image prompt director for a free text-to-image model. " +
  "Rewrite the user's command into ONE precise English image prompt. " +
  "Keep the EXACT subject, action, setting, mood, colours, clothing, style, aspect ratio and any text requested. " +
  "Translate Hinglish, Hindi or Urdu into English. Add concrete visual details that are clearly implied, " +
  "but never contradict the user or invent named people/brands. " +
  "Do not mention negative prompts, settings, or explanations. " +
  "Output only the final prompt as plain text, maximum 70 words.";

function timeoutSignal(parent: AbortSignal | undefined, ms: number) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (parent?.aborted) controller.abort();
  else parent?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onAbort);
    },
  };
}

function cleanThought(text: string): string | null {
  const cleaned = text
    .replace(/^\s*(?:prompt|image\s*prompt|final\s*prompt)\s*[:\-]?\s*/i, "")
    .replace(/^\s*["'`]+|["'`]+\s*$/g, "")
    .replace(/[_*#>+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);

  if (cleaned.length < 12) return null;
  if (/^(?:i\s+can'?t|i\s+cannot|sorry|as\s+an\s+ai|error|unavailable)/i.test(cleaned)) return null;
  if (/(?:api\s*key|rate\s*limit|payment\s*required|402|quota)/i.test(cleaned)) return null;
  return cleaned;
}

async function thinkWithAnthropic(raw: string, parent?: AbortSignal): Promise<string | null> {
  if (!hasKey(process.env.ANTHROPIC_API_KEY)) return null;
  const timed = timeoutSignal(parent, 4500);
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create(
      {
        model: chatModel(),
        max_tokens: 180,
        system: DIRECTOR_SYSTEM,
        messages: [{ role: "user", content: raw }],
      },
      { signal: timed.signal }
    );
    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => ("text" in block ? block.text : ""))
      .join(" ");
    return cleanThought(text);
  } catch {
    return null;
  } finally {
    timed.cleanup();
  }
}

async function thinkWithFreeModel(raw: string, parent?: AbortSignal): Promise<string | null> {
  const timed = timeoutSignal(parent, 3200);
  try {
    const response = await fetch("https://text.pollinations.ai/", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Chat-Master/1.0" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: DIRECTOR_SYSTEM },
          { role: "user", content: raw },
        ],
        stream: false,
        max_tokens: 180,
        temperature: 0.2,
      }),
      signal: timed.signal,
    });
    if (!response.ok) return null;
    const rawText = await response.text();
    let content: string | null = null;
    try {
      const data = JSON.parse(rawText) as {
        choices?: { message?: { content?: string } }[];
        message?: { content?: string };
      };
      content = data?.choices?.[0]?.message?.content ?? data?.message?.content ?? null;
    } catch {
      content = rawText;
    }
    return typeof content === "string" ? cleanThought(content) : null;
  } catch {
    // Free text quota is often exhausted — the local director still works.
    return null;
  } finally {
    timed.cleanup();
  }
}

function cleanCommand(raw: string): string {
  return raw
    .replace(/^\s*\/(?:image|photo|img)\s*/i, "")
    .replace(/\b(?:muja|mujhe|muje)\b/gi, " ")
    .replace(/\b(?:scripeo|scripteo|scripe|scrpio|scripyo)\b/gi, "script")
    .replace(
      /\b([a-z]+(?:\s+[a-z]+)?)\s+ki\s+(?:img|image|photo|picture|tasveer|तस्वीर|फोटो)\b/gi,
      "photograph of $1"
    )
    .replace(
      /\b(?:ki|ka|ke)\s+(?:img|image|photo|picture|tasveer|तस्वीर|फोटो)\s+(?:bna|bana|bnao|banao|banwao|banaye|banayi|kdi|kar\s*di|kar\s*do|do)\b/gi,
      "photograph"
    )
    .replace(/\b(?:bna|bana|bnao|banao|banwao|banaye|banayi|banake|banakar)\s+(?:k|kar)?\s*do\b/gi, " ")
    .replace(/\b(?:kar\s*do|k\s*do|kdi|kar\s*di|banke)\b/gi, " ")
    .replace(/\b(?:bna|bnao|bana|banao|banwao|banaye|banayi)\b/gi, " ")
    .replace(
      /^\s*(?:please\s+|pls\s+|kindly\s+)?(?:generate|create|make|draw|banao|banwao|banaye|do)\s+(?:an?\s+|the\s+)?(?:new\s+)?(?:image|photo|picture|poster|art|drawing|tasveer|taswir|chitra)?\s*(?:of\s+|about\s+|:|-)?\s*/i,
      ""
    )
    .replace(/^\s*(?:ek|ak|a|an)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function translate(raw: string): string {
  let text = raw;
  TRANSLATIONS.forEach(([pattern, replacement]) => {
    text = text.replace(pattern, replacement);
  });
  return text.replace(/\s+/g, " ").trim();
}

const THOUGHT_STOP_WORDS = new Set([
  "image", "photo", "picture", "poster", "generate", "create", "make", "draw", "design",
  "with", "and", "the", "for", "from", "into", "that", "this", "there", "their", "your",
  "style", "composition", "portrait", "photorealistic", "realistic", "cinematic", "cartoon",
  "anime", "logo", "icon", "render", "detailed", "lighting", "background", "colour", "color",
  "vertical", "horizontal", "landscape", "square", "wide", "reel", "story", "aspect", "ratio",
]);

const THOUGHT_SYNONYMS: Record<string, string[]> = {
  woman: ["woman", "women", "girl", "female", "lady"],
  man: ["man", "men", "boy", "male", "gentleman"],
  cat: ["cat", "cats", "kitten", "kittens"],
  dog: ["dog", "dogs", "puppy", "puppies"],
  house: ["house", "home", "building", "cottage"],
  forest: ["forest", "jungle", "woods", "woodland"],
  ocean: ["ocean", "sea", "waves"],
  flower: ["flower", "flowers", "bloom", "blossom"],
  tree: ["tree", "trees"],
  beautiful: ["beautiful", "stunning", "gorgeous", "elegant"],
  large: ["large", "big", "huge"],
  small: ["small", "tiny", "little"],
  standing: ["standing", "upright"],
  sitting: ["sitting", "seated"],
  running: ["running", "sprinting"],
  smiling: ["smiling", "happy"],
};

function validateThought(thought: string, translated: string): boolean {
  const keyTerms = [...new Set(
    translated
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((word) => word.length >= 3 && !THOUGHT_STOP_WORDS.has(word))
  )];
  if (!keyTerms.length) return true;

  const thoughtLower = ` ${thought.toLowerCase()} `;
  const matched = keyTerms.filter((term) => {
    const candidates = THOUGHT_SYNONYMS[term] ?? [term];
    return candidates.some((candidate) =>
      new RegExp(`(?:^|[^a-z])${candidate}(?:s|es)?(?:[^a-z]|$)`).test(thoughtLower)
    );
  });
  return matched.length > 0;
}

function detectStyles(text: string): StyleRule[] {
  const matches = STYLE_RULES.filter((rule) => rule.test.test(text));
  const cartoonish = matches.some((rule) => ["anime", "cartoon", "pixel", "logo"].includes(rule.id));
  if (cartoonish) {
    return matches.filter((rule) => !["photo", "3d"].includes(rule.id));
  }
  return matches.length ? matches : [];
}

function detectDimensions(
  text: string,
  fallbackWidth: number,
  fallbackHeight: number
): { width: number; height: number } {
  if (/\b(9\s*:\s*16|reel|story|vertical|portrait|खड़ी|वर्टिकल)\b/i.test(text)) {
    return { width: 576, height: 1024 };
  }
  if (/\b(16\s*:\s*9|landscape|wide\s*screen|वाइड|लैंडस्केप)\b/i.test(text)) {
    return { width: 1024, height: 576 };
  }
  if (/\b(4\s*:\s*5|instagram\s*post|poster\s*size|पोस्टर)\b/i.test(text)) {
    return { width: 768, height: 960 };
  }
  if (/\b(1\s*:\s*1|square|profile\s*picture|avatar|स्क्वायर)\b/i.test(text)) {
    return { width: 768, height: 768 };
  }

  const clamp = (value: number) => Math.max(384, Math.min(1024, Math.round(value / 64) * 64));
  const width = Number.isFinite(fallbackWidth) ? clamp(fallbackWidth) : 768;
  const height = Number.isFinite(fallbackHeight) ? clamp(fallbackHeight) : 768;
  return { width, height };
}

function compositionHint(width: number, height: number): string {
  if (width > height * 1.2) return "wide landscape composition";
  if (height > width * 1.2) return "vertical portrait composition";
  return "centred square composition";
}

export function buildNegativePrompt(styleIds: string[], textRequested: boolean): string {
  const parts = [
    "lowres",
    "blurry",
    "distorted",
    "deformed",
    "bad anatomy",
    "extra fingers",
    "extra limbs",
    "watermark",
    "signature",
    "jpeg artifacts",
    "cropped",
    "worst quality",
  ];
  if (!textRequested) parts.push("text", "letters", "words", "gibberish");
  STYLE_RULES.filter((rule) => styleIds.includes(rule.id)).forEach((rule) => parts.push(...rule.negative));
  return [...new Set(parts)].join(", ").slice(0, 420);
}

export async function planImage(
  rawPrompt: string,
  options: { width?: number; height?: number; think?: boolean },
  parent?: AbortSignal
): Promise<ImagePlan> {
  const cleaned = cleanCommand(rawPrompt);
  const translated = translate(cleaned);
  const styles = detectStyles(translated);
  const dimensions = detectDimensions(
    translated,
    options.width ?? 768,
    options.height ?? 768
  );
  const textRequested = /\b(text|word|words|caption|title|heading|poster|typography|write|script|likh|लिख|अक्षर|शीर्षक)\b/i.test(
    translated
  );

  const allowThink = options.think !== false;
  const anthropicThought = allowThink ? await thinkWithAnthropic(cleaned, parent) : null;
  const freeThought = anthropicThought
    ? null
    : allowThink
      ? await thinkWithFreeModel(cleaned, parent)
      : null;
  const candidate = anthropicThought ?? freeThought;
  // Free LLMs sometimes misread Hinglish ("billi" -> billiards). Reject any
  // "thought" that drops the actual subject; the local director is safer.
  const thought = candidate && validateThought(candidate, translated) ? candidate : null;

  let core = thought ?? translated;
  if (thought) {
    // Keep Hinglish keywords as a backup cue for the image model.
    core = `${thought}, ${translated}`.slice(0, 700);
  }
  core = core
    .replace(/\b\d+\s*:\s*\d+\b/gi, "")
    .replace(/\b(?:vertical|horizontal|wide|square)?\s*aspect\s*ratio\b/gi, "")
    .replace(/\s*,\s*,/g, ", ")
    .replace(/\s+/g, " ")
    .trim();

  const tags = styles.length
    ? styles.map((style) => style.tags).join(", ")
    : "highly detailed, beautiful composition, balanced lighting, sharp focus, 8k";
  const hint = compositionHint(dimensions.width, dimensions.height);
  const prompt = `${core}, ${tags}, ${hint}`
    .replace(/\s*,\s*,/g, ", ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);

  return {
    prompt,
    negativePrompt: buildNegativePrompt(
      styles.map((style) => style.id),
      textRequested
    ),
    ...dimensions,
    style: styles.map((style) => style.id).join("+") || "detailed",
    thought: Boolean(thought),
    raw: rawPrompt,
  };
}
