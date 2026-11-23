const PLACEHOLDERS = /^(your_|sk-ant-\.\.\.|sk-\.\.\.|tvly-\.\.\.|\.\.\.$)/i;

export function hasKey(value: string | undefined): boolean {
  if (!value) return false;
  const key = value.trim();
  return key.length > 0 && !PLACEHOLDERS.test(key);
}

export function chatModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6";
}

export function friendlyApiError(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const e = error as {
      error?: { error?: { message?: string } };
      message?: string;
      status?: number;
    };
    const inner = e.error?.error?.message ?? e.message;
    if (typeof inner === "string" && inner.trim()) {
      const message = inner.slice(0, 300);
      if (/RATE_LIMITED|rate.?limit|previous request is still running|too many requests/i.test(message)) {
        return "Free model abhi busy hai (rate limit). Thoda wait karke dobara bhejein ya Regenerate dabayein.";
      }
      if (/402|payment required|free model unavailable/i.test(message)) {
        return "Free provider abhi quota/busy ki wajah se jawab nahi de raha. Thodi der baad try karein ya apni API key .env.local me add karein.";
      }
      if (/credit balance|billing|quota/i.test(message)) {
        return "Anthropic credits khatam ho gaye — console.anthropic.com → Billing mein credits add karein.";
      }
      return message;
    }
  }
  return fallback;
}
