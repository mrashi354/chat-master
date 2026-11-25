# 🤖 Chat-Master — Your Own ChatGPT

> 🖼️ **Live demo gallery:** `http://localhost:3000/demos/index.html` — 4 alag image styles aur 2 alag reel videos, asli prompts/metadata ke saath.

ChatGPT jaisa AI assistant — streaming chat, live search, image/video banane, code likhne,
voice input/output aur har language mein jawab. Aap jis language mein poochho, usi mein jawab milta hai.

## Features

- 💬 **Streaming chat** — Claude (Anthropic) ya **bina kisi key ke free model** se word-by-word jawab, beech mein `Stop`
- 🗂️ **Multiple chats** — sidebar mein nayi chat, purani chats, delete; sab browser mein automatically save
- 🎙️ **Voice input** — mic dabao, bolo; Chrome/Edge me browser speech, ya `OPENAI_API_KEY` hone pe Whisper
- 🔊 **Voice output** — browser speaker (kisi key ke bina), ya `CARTESIA_API_KEY` hone pe natural TTS
- 🌐 **Web search** — free DuckDuckGo/Wikipedia fallback, ya `TAVILY_API_KEY` hone pe Tavily + source links
- 🧠 **Smart image director** — image command pehle samjha jata hai (Hinglish/Hindi/English), style (photo / cinematic / anime / cartoon / 3D / watercolour / oil / pixel / logo) aur aspect (9:16 reel, 16:9 wide, 4:5 poster, 1:1 square) detect karke clear English prompt banta hai. Anthropic key ho to model "soch kar" prompt likhta hai, nahi to free local director; final prompt chat me `🧠 ...` ke saath dikhayi deta hai
- 🖼️ **Image generation** — "ek cute cat ki image banao" ya `/image jaisi command likho. Teen free providers (AI Horde, naya Pollinations/Flux, legacy Pollinations) alag quotas ke saath race karte hain — jiska response pehle aaye wahi jeet ta hai. Ab payload me requested prompt nahi — director ka improved prompt jata hai, isliye command zyada sahi follow hoti hai
- 🎬 **Video generation** — usi realistic image ko browser me 4–5 sec ki smooth animated clip me badalta hai (Chrome/Edge best)
- 💻 **Code** — kisi bhi language me complete runnable code, fenced blocks + copy button
- 🧠 **Same-language replies** — Hindi, Hinglish, Urdu, English ya koi bhi language — jawab usi mein
- 📝 **Markdown** — code blocks (copy button ke saath), lists, tables, links — sab clean formatting
- 📋 **Copy / Regenerate** — ek click se jawab copy ya dobara banwao
- ⌨️ **Shortcuts** — `Enter` bhejein, `Shift+Enter` nayi line, `⌘/Ctrl+K` nayi chat, `⌘/Ctrl+.` Toolbox, `⌘/Ctrl+,` Settings, `Esc` generation rokein
- 🌗 **Dark / Light theme** — header mein toggle, choice browser mein save
- 🟢 **Feature status** — jin features ki API key missing hai, unke buttons disabled + tooltip
- 📎 **File attachments** — PDF (text extraction), TXT/MD/CSV/JSON/code files aur images attach karke un par sawaal; max 5 files, 12 MB each
- 🧰 **Tools** — calculator, unit converter, live weather (Open-Meteo), web page reader, Wikipedia summary, dictionary aur timezone clock — sab free, bina key ke
- 🧰 **Toolbox (`/toolbox`, `Ctrl/.`)** — 16 instant client-side tools: JSON formatter, Base64, SHA-256/SHA-1 hash, UUID, strong password generator, regex tester, word/character counter, case converter, URL encode/decode, color converter (hex/rgb/hsl), percentage calculator, date calculator, slugify, lorem generator, number bases aur live Markdown preview. Output ek click se chat me add ho jata hai
- ⌘ **Slash commands** — `/calc`, `/convert`, `/weather`, `/read`, `/wiki`, `/define`, `/time`, `/toolbox`, `/edit`, `/reel`, `/image`, `/video`, `/search`, `/clear`, `/help`
- 🧠 **Presets + memory** — Code mentor, Teacher, Writer, Translator jaise personas, custom instructions aur user facts jo har jawab me context ban jaate hain
- 🗂️ **Advanced chat management** — search, rename, pin, per-message edit/delete, branching regenerate, JSON export/import (validated + duplicate-free)
- 💾 **Draft autosave** — har chat ka adhoora likha hua message browser me save hota hai; reload ya chat switch ke baad wapas mil jata hai
- ✨ **Smoother UX** — last jawab ke neeche follow-up suggestion chips, upar scroll karne pe "neeche jayein" button, 👍/👎 feedback, drag-and-drop attachments, IME-safe Enter (Hindi/Urdu typing me gallery accidentally send nahi hoti), single-chat delete confirmation
- 📤 **Markdown transcript export** — Settings → Data se poori chat history readable `.md` file me download; JSON backup/blob URLs safe clean karke export/import hote hain
- ⚙️ **Settings panel** — temperature control, auto-search/auto-voice toggles, data backup aur shortcut guide (`/help` seedha Shortcuts tab kholta hai)
- 🎬 **Reel / Video Studio (`/reel`)** — script ki har line ek scene, apni photos ya auto-generated images, **cinematic camera motion** (Cinematic pan / Soft zoom / Dramatic push / Static), 5 transitions (Fade, Slide, Zoom, Circle wipe, None), animated captions, vignette + glow progress, **live animated preview**, 9:16 / 1:1 / 16:9 format, optional background music, WebM download aur seedha chat me add. Pure browser-side rendering (Chrome/Edge recommended)
- 🖼️ **Image Studio / Photo Editor (`/edit`)** — photo attach karke "is pic me script add karo", `/image add gun in hand` ya "iska haat ma gun add kro" likhte hi full editor khulta hai. **Smart object add** gun/crown/flower/glasses/hat/heart/fire/sparkle ko seedha photo par layer ke taur par rakhta hai (drag karke place karein, Delete se hataayein). **8 tools**: Select/Move (layers drag + delete), Text, Brush, **Erase** (aas-paas ke colours se object hataayein), **Clone stamp** (source pick karke copy), Shapes (rectangle/circle/arrow), Stickers aur Crop. 5 filter presets + brightness/contrast/saturation/blur/B&W/sepia sliders, Undo/Redo (Ctrl+Z/Y), Rotate, Flip, Reset, PNG download, chat me insert aur seedha Reel Studio me bhejne ka option. Sab edits browser me — koi API key nahi
- 👁️ **Image context** — attach ki gayi image ka offline visual summary (size, orientation, dominant colour, brightness) chat context me jata hai, taaki assistant "main images nahi dekh sakta" na kahe. Image Studio me bhejne par asli editing hoti hai
- 🧪 **HTML live preview** — jab bhi code block `html`/`svg` ho, "Preview" button se sandboxed iframe me turant chal kar dekha ja sakta hai (Claude artifacts jaisa chhota version)

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
- **Image**: free AI Horde — `Realistic Vision` model, photorealistic prompts + negative prompt; **Pollinations fallback race** (6s baad start) ke saath jo pehle aaye wahi use hota hai, slower request abort
- **Video**: generated realistic image → browser me smooth canvas animation → WebM clip (Chrome/Edge)
- **Speed**: tool aur web search **parallel** chalte hain; free model par 402/quota turant clear message deta hai (20s bekaar wait nahi); Horde polling 1.2s aur 60s cap
- **Optional** `AI_HORDE_API_KEY` se image queue mein priority milta hai (bina key ke bhi kaam karta hai)

Keys sirf **upgrade** ke liye hain — behtar quality aur speed. `CHAT_PROVIDER=auto` default hai:
pehle Anthropic try hota hai, credit/key issue pe automatically free model par fallback.
`CHAT_PROVIDER=free` ya `anthropic` se force bhi kar sakte ho.

Free model rate-limited hota hai (lagbhag ek request har 45 sec per IP), isliye do messages ke beech thoda wait lagega.

## Run

```bash
npm run dev      # development — http://localhost:3000
npm run build    # production build
npm start        # production server — sabse fast (ab yahi chal raha hai)
npm run lint     # code check
```

💡 **Fastest experience** ke liye `npm run build` ke baad `npm start` use karein — dev mode me har request par compile hota hai, production me nahi.

## Project structure

```
app/
  page.tsx                 → Chat UI (chats, tools, files, commands, mic, shortcuts)
  globals.css              → Dark theme + markdown/code/UI styling
  api/chat/route.ts        → Claude + free-model fallback (SSE, system/temperature, abort)
  api/search/route.ts      → Tavily + free DuckDuckGo/Wikipedia fallback
  api/image/route.ts       → AI Horde + Pollinations image fallback
  api/tools/route.ts       → Calculator, converter, weather, URL reader, wiki, dictionary, time
  api/files/route.ts       → PDF text extraction (unpdf)
  api/transcribe/route.ts  → OpenAI Whisper (server-side, key safe)
  api/voice/route.ts       → Cartesia text-to-speech
  api/status/route.ts      → Which features are available
components/
  Sidebar.tsx              → Chat search, rename, pin, delete, feature status
  MessageBubble.tsx        → Edit/delete, feedback, attachments, tool results, sources, streaming
  Markdown.tsx             → Markdown + copyable code blocks
  SettingsModal.tsx        → Presets, memory, behavior, JSON/Markdown export, import, shortcuts
  Toolbox.tsx              → 16 browser-side utility tools with chat insert
  VideoStudio.tsx          → Script-to-reel renderer (canvas + MediaRecorder, music, captions)
lib/
  chat.ts                  → Types, localStorage persistence, draft autosave, import sanitization, helpers
  media.ts                 → Image fetch + browser-side video clip
  preferences.ts           → Presets, memory, temperature, settings storage
  server-config.ts         → Key validation, model config
  tools.ts                 → Tool/command definitions aur detection
```

Chats aur drafts **sirf is browser ke localStorage** mein rehte hain — koi server DB nahi. Clear karne ke liye
browser devtools → Application → Local Storage → `chat-master:chats:v1` (chats) aur `chat-master:draft:<chat-id>` (drafts) delete karein.

## Troubleshooting

- **"Credit balance is too low"** → kuch mat karo: app automatically free model par chal jayega. Claude chahiye to console.anthropic.com → Billing → credits add karo
- **Jawab slow aa raha hai** → free model per-IP rate limited hai; thoda wait karke dobara bhejo, ya Anthropic credits add karo
- **Mic permission denied** → browser settings mein mic allow karo (localhost pe chalta hai). Chrome/Edge me key ke bina bhi voice chalega
- **Voice nahi sunayi de raha** → browser tab mute na ho; Chrome/Edge me built-in speaker kaam karta hai, ya `CARTESIA_API_KEY` dalo
- **Jawab beech mein ruk gaya** → `Regenerate` dabao; free model kabhi-kabhi slow hota hai
