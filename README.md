# 🤖 Chat-Master — Your Own ChatGPT

ChatGPT jaisa AI assistant — streaming chat, live search, image/video banane, code likhne,
voice input/output aur har language mein jawab. Aap jis language mein poochho, usi mein jawab milta hai.

## Features

- 💬 **Streaming chat** — Claude (Anthropic) ya **bina kisi key ke free model** se word-by-word jawab, beech mein `Stop`
- 🗂️ **Multiple chats** — sidebar mein nayi chat, purani chats, delete; sab browser mein automatically save
- 🎙️ **Voice input** — mic dabao, bolo; Chrome/Edge me browser speech, ya `OPENAI_API_KEY` hone pe Whisper
- 🔊 **Voice output** — browser speaker (kisi key ke bina), ya `CARTESIA_API_KEY` hone pe natural TTS
- 🌐 **Web search** — free DuckDuckGo/Wikipedia fallback, ya `TAVILY_API_KEY` hone pe Tavily + source links
- 🖼️ **Realistic image generation** — "ek cute cat ki image banao" likho ya 🖼️/🎬 toggle dabao. Free AI Horde (Realistic Vision model) se photorealistic image; agar busy ho to Pollinations fallback + auto-retry
- 🎬 **Video generation** — usi realistic image ko browser me 4–5 sec ki smooth animated clip me badalta hai (Chrome/Edge best)
- 💻 **Code** — kisi bhi language me complete runnable code, fenced blocks + copy button
- 🧠 **Same-language replies** — Hindi, Hinglish, Urdu, English ya koi bhi language — jawab usi mein
- 📝 **Markdown** — code blocks (copy button ke saath), lists, tables, links — sab clean formatting
- 📋 **Copy / Regenerate** — ek click se jawab copy ya dobara banwao
- ⌨️ **Shortcuts** — `Enter` bhejein, `Shift+Enter` nayi line, `⌘/Ctrl+K` nayi chat, `Esc` generation rokein
- 🌗 **Dark / Light theme** — header mein toggle, choice browser mein save
- 🟢 **Feature status** — jin features ki API key missing hai, unke buttons disabled + tooltip

## Setup (pehli baar)

```bash
npm install
cp .env.example .env.local   # phir .env.local mein apni REAL keys bharo
npm run dev                  # http://localhost:3000
```

### Keys kahan se lao

| Key | Kaam | Kahan milegi |
|-----|------|--------------|
| `ANTHROPIC_API_KEY` | Chat (Claude) | console.anthropic.com → API Keys (**billing mein credits hone chahiye**) |
| `OPENAI_API_KEY` | Voice → text (Whisper) | platform.openai.com → API Keys |
| `TAVILY_API_KEY` | Web search | tavily.com |
| `CARTESIA_API_KEY` | Text → voice (TTS) | cartesia.ai |
| `AI_HORDE_API_KEY` | Optional — realistic images me faster queue | aihorde.net → Register |

Optional: `ANTHROPIC_MODEL` se model change kar sakte ho (default: `claude-sonnet-4-6`).

⚠️ `.env.local` kabhi git mein commit mat karo — keys chipki rehengi.

### Free mode (default, zero setup)
Koi key na ho to bhi app **poor tarah kaam karta hai**:
- **Chat**: free anonymous model (Pollinations) — streaming ke saath
- **Search**: DuckDuckGo instant answers + Wikipedia summary
- **Mic / Speaker**: browser ke built-in speech APIs (Chrome/Edge best)
- **Image**: free AI Horde — `Realistic Vision` model, photorealistic prompts + negative prompt; busy hone pe Pollinations fallback ke saath retry
- **Video**: generated realistic image → browser me smooth canvas animation → WebM clip (Chrome/Edge)
- **Optional** `AI_HORDE_API_KEY` se image queue mein priority milta hai (bina key ke bhi kaam karta hai)

Keys sirf **upgrade** ke liye hain — behtar quality aur speed. `CHAT_PROVIDER=auto` default hai:
pehle Anthropic try hota hai, credit/key issue pe automatically free model par fallback.
`CHAT_PROVIDER=free` ya `anthropic` se force bhi kar sakte ho.

Free model rate-limited hota hai (lagbhag ek request har 45 sec per IP), isliye do messages ke beech thoda wait lagega.

## Run

```bash
npm run dev      # development — http://localhost:3000
npm run build    # production build
npm start        # production server
npm run lint     # code check
```

## Project structure

```
app/
  page.tsx                 → Chat UI (chats, streaming, mic, shortcuts)
  globals.css              → Dark theme + markdown/code styling
  api/chat/route.ts        → Claude + free-model fallback (SSE, abort support)
  api/search/route.ts      → Tavily + free DuckDuckGo/Wikipedia fallback
  api/transcribe/route.ts  → OpenAI Whisper (server-side, key safe)
  api/voice/route.ts       → Cartesia text-to-speech
  api/status/route.ts      → Which features have keys configured
components/
  Sidebar.tsx              → Chat list / feature status
  MessageBubble.tsx        → Message actions, sources, streaming state
  Markdown.tsx             → Markdown + copyable code blocks
lib/
  chat.ts                  → Types, localStorage persistence, helpers
  server-config.ts         → Key validation, model config
```

Chats **sirf is browser ke localStorage** mein rehte hain — koi server DB nahi. Clear karne ke liye
browser devtools → Application → Local Storage → `chat-master:chats:v1` delete karein.

## Troubleshooting

- **"Credit balance is too low"** → kuch mat karo: app automatically free model par chal jayega. Claude chahiye to console.anthropic.com → Billing → credits add karo
- **Jawab slow aa raha hai** → free model per-IP rate limited hai; thoda wait karke dobara bhejo, ya Anthropic credits add karo
- **Mic permission denied** → browser settings mein mic allow karo (localhost pe chalta hai). Chrome/Edge me key ke bina bhi voice chalega
- **Voice nahi sunayi de raha** → browser tab mute na ho; Chrome/Edge me built-in speaker kaam karta hai, ya `CARTESIA_API_KEY` dalo
- **Jawab beech mein ruk gaya** → `Regenerate` dabao; free model kabhi-kabhi slow hota hai
