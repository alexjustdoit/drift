# drift

Personal ADHD companion app. Daily logging, brain dump, task breakdown, and focus timer — with AI pattern surfacing from your data.

**Live:** [driftadhd.vercel.app](https://driftadhd.vercel.app)

---

## What it does

- **Daily log** — morning (sleep, energy, meds, exercise) and evening (mood, focus, win of the day) check-ins
- **Brain dump** — capture whatever's in your head, no structure needed; AI surfaces themes
- **Task breakdown** — paste something daunting, get micro-steps so small you can't not start
- **Focus timer** — declare your task, start a session, body double mode
- **Insights** — trends on sleep, mood, focus, meds adherence over time; AI pattern report

Logs are stored in Notion. The Telegram bot lets you log from your phone without opening the app.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router), Tailwind CSS, shadcn/ui |
| Backend | FastAPI (Python), deployed on Render |
| Database | Notion (via REST API) |
| AI | Claude Haiku (`claude-haiku-4-5-20251001`) |
| Telegram bot | python-telegram-bot v21.5 |
| Hosting | Vercel (frontend) + Render (backend + bot) |

---

## Repo structure

```
drift/
├── web/              # Next.js frontend (PWA)
├── backend/          # FastAPI backend
│   ├── main.py       # API routes
│   ├── notion.py     # Notion DB client
│   └── ai.py         # Claude API calls
├── telegram/         # Telegram bot
│   └── bot.py
├── analysis/         # Legacy Streamlit analysis app
├── render.yaml       # Render Blueprint config
└── SETUP.md          # Deployment guide
```

---

## Setup

See [SETUP.md](./SETUP.md) for full deployment instructions.

**Required environment variables:**

| Variable | Where |
|---|---|
| `NOTION_TOKEN` | Backend + Bot |
| `NOTION_DB_ID` | Backend + Bot |
| `NOTION_CAPTURES_DB_ID` | Backend |
| `ANTHROPIC_API_KEY` | Backend |
| `TELEGRAM_BOT_TOKEN` | Bot |
| `TELEGRAM_CHAT_ID` | Bot |
| `NEXT_PUBLIC_API_URL` | Frontend (Vercel) |

---

## Notes

The FastAPI backend runs on Render's free tier, which sleeps after 15 minutes of inactivity. First API call of the day may take ~30 seconds to warm up. Upgrade to a paid Render instance to eliminate this.
