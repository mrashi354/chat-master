# 🤖 Chat-Master — Your Own ChatGPT

ChatGPT jaisa AI assistant — chat, voice input/output aur live web search ke saath.
Hindi, Urdu ya English — sab mein jawab deta hai.

## Features

- 💬 **Streaming chat** — Claude (Anthropic) se word-by-word jawab
- 🎙️ **Voice input** — mic hold karke bolo, Whisper se text banta hai
- 🔊 **Voice output** — jawab sunne ke liye speaker button (Cartesia TTS), OFF/ON toggle header mein
- 🔍 **Live web search** — "latest news / aaj ka mausam / abhi" jaise sawalo pe Tavily se live info
- 📝 **Markdown support** — code, lists, bold sab properly format hote hain

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

⚠️ `.env.local` kabhi git mein commit mat karo — keys chipki rehengi.

## Run

```bash
npm run dev      # development — http://localhost:3000
npm run build    # production build
npm start        # production server
```

## Project structure

```
app/
  page.tsx              → Chat UI (messages, mic, voice toggle)
  api/chat/route.ts     → Claude streaming chat (SSE)
  api/search/route.ts   → Tavily web search
  api/transcribe/route.ts → OpenAI Whisper (server-side, key safe)
  api/voice/route.ts    → Cartesia text-to-speech
```

## Troubleshooting

- **"Credit balance is too low"** → console.anthropic.com → Settings → Billing → credits add karo
- **"Incorrect API key"** → `.env.local` mein placeholder hatakar real key dalo, server restart karo
- **Mic kaam nahi kar raha** → browser mein mic permission allow karo (localhost pe chalta hai)
- **Search/voice kaam nahi kar rahe** → bina keys ke chat phir bhi chalta hai; search/voice silently fail hote hain
