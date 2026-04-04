# Drift Setup Guide

One-time setup steps. Do these in order.

---

## 1. Create Notion Integration

1. Go to https://www.notion.so/my-integrations
2. Click **+ New integration**
3. Name it `Drift`, select your workspace
4. Copy the **Internal Integration Token** (starts with `secret_`)
   → This is your `NOTION_TOKEN`

---

## 2. Create the Notion Database

1. In Notion, create a new **full-page database** (not inline)
2. Name it: `ADHD Daily Log`
3. Delete the default "Name" column type change — keep it as **Title**, rename it to `Name`
4. Add the following properties exactly (names are case-sensitive):

| Property name      | Type     | Notes              |
|--------------------|----------|--------------------|
| Name               | Title    | Already exists     |
| Date               | Date     |                    |
| Sleep Hours        | Number   | Format: Number     |
| Sleep Quality      | Number   | Format: Number     |
| Morning Energy     | Number   | Format: Number     |
| Meds Taken         | Checkbox |                    |
| Exercise           | Checkbox |                    |
| Exercise Minutes   | Number   | Format: Number     |
| Caffeine Cups      | Number   | Format: Number     |
| Afternoon Energy   | Number   | Format: Number     |
| Mood EOD           | Number   | Format: Number     |
| Focus Quality      | Number   | Format: Number     |
| Win of the Day     | Text     |                    |
| Where I Left Off   | Text     |                    |
| Notes              | Text     |                    |

5. **Share the database with your integration:**
   - Click ··· (top right of the database page) → **Connections** → find `Drift` → connect

6. **Get the Database ID:**
   - Open the database as a full page in browser
   - Copy the URL: `https://notion.so/Your-DB-Name-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`
   - The 32-character string after the last `-` is your `NOTION_DB_ID`

---

## 3. Deploy to Vercel

1. Go to https://vercel.com → **Add New Project**
2. Import the `alexjustdoit/drift` GitHub repo
3. Framework preset: **Other** (leave defaults)
4. Under **Environment Variables**, add:
   - `NOTION_TOKEN` = your token from step 1
   - `NOTION_DB_ID` = your database ID from step 2
5. Click **Deploy**
6. Once deployed, copy your project URL: `https://drift-XXXX.vercel.app`

7. **Update the API URL in the PWA:**
   - Open `index.html`, find line with `API_URL`
   - Replace `https://YOUR-PROJECT.vercel.app/api/log` with your real Vercel URL
   - Commit and push

---

## 4. Enable GitHub Pages

1. Go to https://github.com/alexjustdoit/drift/settings/pages
2. Source: **Deploy from a branch**
3. Branch: `main` / `/ (root)`
4. Click **Save**
5. Wait ~60 seconds — your PWA will be live at:
   `https://alexjustdoit.github.io/drift/`

---

## 5. Install PWA on iPhone

1. Open Safari on iPhone
2. Navigate to `https://alexjustdoit.github.io/drift/`
3. Tap the **Share** button (box with arrow)
4. Tap **Add to Home Screen**
5. Tap **Add**

The app now lives on your home screen and opens full-screen.

---

## 6. Deploy Analysis App to Streamlit (after building it)

1. Go to https://share.streamlit.io → **New app**
2. Repo: `alexjustdoit/drift`
3. Branch: `main`
4. Main file path: `analysis/streamlit_app.py`
5. Under **Advanced settings → Secrets**, add:
   ```toml
   NOTION_TOKEN = "secret_xxxx"
   NOTION_DB_ID = "xxxx"
   ANTHROPIC_API_KEY = "sk-ant-xxxx"
   ```
6. Click **Deploy**
7. Copy the app URL and update `keepalive.yml` in `.github/workflows/`

---

## Checklist

- [ ] Notion integration created, token copied
- [ ] Notion database created with exact schema
- [ ] Database shared with Drift integration
- [ ] Deployed to Vercel, env vars added
- [ ] `API_URL` in `index.html` updated with real Vercel URL
- [ ] GitHub Pages enabled
- [ ] PWA installed on iPhone
- [ ] Morning and evening flows tested end-to-end
- [ ] Streamlit analysis app deployed (v0.2)
- [ ] Keepalive workflow URL updated
