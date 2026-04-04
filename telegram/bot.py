"""
Drift Telegram Bot
Sends scheduled morning/evening check-in prompts and logs to Notion.
All flows are fully tap-based (no typing required except free-text fields).
"""

import os
import logging
import threading
import requests
from datetime import datetime, date
from http.server import HTTPServer, BaseHTTPRequestHandler

import pytz
from apscheduler.schedulers.background import BackgroundScheduler
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, CallbackQueryHandler,
    MessageHandler, ConversationHandler, filters, ContextTypes,
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────

BOT_TOKEN    = os.environ['TELEGRAM_BOT_TOKEN']
CHAT_ID      = int(os.environ['TELEGRAM_CHAT_ID'])
NOTION_TOKEN = os.environ['NOTION_TOKEN']
NOTION_DB_ID = os.environ['NOTION_DB_ID']
MORNING_TIME = os.environ.get('MORNING_TIME', '08:00')   # HH:MM
EVENING_TIME = os.environ.get('EVENING_TIME', '20:00')   # HH:MM
TZ           = pytz.timezone(os.environ.get('TIMEZONE', 'America/New_York'))

NOTION_HEADERS = {
    'Authorization': f'Bearer {NOTION_TOKEN}',
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28',
}

# ── Conversation states ───────────────────────────────────────────────────────

# Morning
(M_SLEEP_HOURS, M_SLEEP_QUALITY, M_MORNING_ENERGY,
 M_MEDS, M_EXERCISE, M_EXERCISE_MIN, M_CAFFEINE) = range(7)

# Evening
(E_AFTERNOON_ENERGY, E_MOOD, E_FOCUS, E_WIN, E_LEFT_OFF) = range(10, 15)

# ── Inline keyboard helpers ───────────────────────────────────────────────────

def rating_keyboard(prefix):
    return InlineKeyboardMarkup([[
        InlineKeyboardButton(str(i), callback_data=f'{prefix}:{i}') for i in range(1, 6)
    ]])

def yesno_keyboard(prefix):
    return InlineKeyboardMarkup([[
        InlineKeyboardButton('Yes', callback_data=f'{prefix}:yes'),
        InlineKeyboardButton('No',  callback_data=f'{prefix}:no'),
    ]])

def sleep_keyboard():
    row1 = [InlineKeyboardButton(f'{h}h', callback_data=f'sleep:{h}')
            for h in [4.0, 5.0, 6.0, 6.5, 7.0]]
    row2 = [InlineKeyboardButton(f'{h}h', callback_data=f'sleep:{h}')
            for h in [7.5, 8.0, 8.5, 9.0, 10.0]]
    return InlineKeyboardMarkup([row1, row2])

def caffeine_keyboard():
    return InlineKeyboardMarkup([[
        InlineKeyboardButton(str(i), callback_data=f'caffeine:{i}') for i in [0, 1, 2, 3, 4]
    ]])

def exercise_min_keyboard():
    return InlineKeyboardMarkup([[
        InlineKeyboardButton(f'{m}m', callback_data=f'exmin:{m}')
        for m in [15, 20, 30, 45, 60, 90]
    ]])

def skip_keyboard(prefix):
    return InlineKeyboardMarkup([[
        InlineKeyboardButton('Skip', callback_data=f'{prefix}:skip')
    ]])

# ── Notion helpers ────────────────────────────────────────────────────────────

def today_str():
    return datetime.now(TZ).strftime('%Y-%m-%d')

def find_today_page(date_str):
    res = requests.post(
        f'https://api.notion.com/v1/databases/{NOTION_DB_ID}/query',
        headers=NOTION_HEADERS,
        json={'filter': {'property': 'Date', 'date': {'equals': date_str}}},
    )
    results = res.json().get('results', [])
    return results[0] if results else None

def build_properties(data: dict) -> dict:
    props = {}
    if 'date' in data:
        props['Date'] = {'date': {'start': data['date']}}
    if 'sleep_hours' in data:
        props['Sleep Hours'] = {'number': data['sleep_hours']}
    if 'sleep_quality' in data:
        props['Sleep Quality'] = {'number': data['sleep_quality']}
    if 'morning_energy' in data:
        props['Morning Energy'] = {'number': data['morning_energy']}
    if 'meds_taken' in data:
        props['Meds Taken'] = {'checkbox': data['meds_taken']}
    if 'exercise' in data:
        props['Exercise'] = {'checkbox': data['exercise']}
    if 'exercise_minutes' in data:
        props['Exercise Minutes'] = {'number': data['exercise_minutes']}
    if 'caffeine_cups' in data:
        props['Caffeine Cups'] = {'number': data['caffeine_cups']}
    if 'afternoon_energy' in data:
        props['Afternoon Energy'] = {'number': data['afternoon_energy']}
    if 'mood_eod' in data:
        props['Mood EOD'] = {'number': data['mood_eod']}
    if 'focus_quality' in data:
        props['Focus Quality'] = {'number': data['focus_quality']}
    if 'win_of_day' in data:
        props['Win of the Day'] = {'rich_text': [{'text': {'content': data['win_of_day']}}]}
    if 'where_left_off' in data:
        props['Where I Left Off'] = {'rich_text': [{'text': {'content': data['where_left_off']}}]}
    return props

def upsert_notion(data: dict):
    date_str = data.get('date', today_str())
    props = build_properties(data)
    existing = find_today_page(date_str)

    if existing:
        requests.patch(
            f"https://api.notion.com/v1/pages/{existing['id']}",
            headers=NOTION_HEADERS,
            json={'properties': props},
        )
    else:
        requests.post(
            'https://api.notion.com/v1/pages',
            headers=NOTION_HEADERS,
            json={
                'parent': {'database_id': NOTION_DB_ID},
                'properties': {
                    'Name': {'title': [{'text': {'content': date_str}}]},
                    **props,
                },
            },
        )

def calculate_streak(date_str: str) -> int:
    try:
        cutoff = datetime.strptime(date_str, '%Y-%m-%d')
        from datetime import timedelta
        cutoff -= timedelta(days=60)
        res = requests.post(
            f'https://api.notion.com/v1/databases/{NOTION_DB_ID}/query',
            headers=NOTION_HEADERS,
            json={
                'filter': {'property': 'Date', 'date': {'on_or_after': cutoff.strftime('%Y-%m-%d')}},
                'sorts': [{'property': 'Date', 'direction': 'descending'}],
                'page_size': 60,
            },
        )
        dates = {p['properties']['Date']['date']['start']
                 for p in res.json().get('results', [])
                 if p['properties'].get('Date', {}).get('date')}

        from datetime import timedelta
        streak = 0
        check = datetime.strptime(date_str, '%Y-%m-%d')
        while check.strftime('%Y-%m-%d') in dates:
            streak += 1
            check -= timedelta(days=1)
        return streak
    except Exception:
        return 0

def get_last_left_off() -> str | None:
    try:
        from datetime import timedelta
        cutoff = (datetime.now(TZ) - timedelta(days=7)).strftime('%Y-%m-%d')
        res = requests.post(
            f'https://api.notion.com/v1/databases/{NOTION_DB_ID}/query',
            headers=NOTION_HEADERS,
            json={
                'filter': {'property': 'Date', 'date': {'on_or_after': cutoff}},
                'sorts': [{'property': 'Date', 'direction': 'descending'}],
                'page_size': 7,
            },
        )
        for page in res.json().get('results', []):
            items = page['properties'].get('Where I Left Off', {}).get('rich_text', [])
            text = items[0]['plain_text'].strip() if items else ''
            if text:
                return text
    except Exception:
        pass
    return None

# ── Morning flow ──────────────────────────────────────────────────────────────

async def morning_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.clear()
    context.user_data['date'] = today_str()

    left_off = get_last_left_off()
    if left_off:
        await update.effective_chat.send_message(
            f"☀️ *Good morning!*\n\n_Yesterday you left off:_\n{left_off}",
            parse_mode='Markdown',
        )
    else:
        await update.effective_chat.send_message("☀️ *Good morning!* Time for your morning check-in.", parse_mode='Markdown')

    await update.effective_chat.send_message(
        "How many hours did you sleep?",
        reply_markup=sleep_keyboard(),
    )
    return M_SLEEP_HOURS

async def m_sleep_hours(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    await q.answer()
    val = float(q.data.split(':')[1])
    context.user_data['sleep_hours'] = val
    await q.edit_message_text(f"Sleep: *{val}h* ✓", parse_mode='Markdown')
    await update.effective_chat.send_message(
        "Sleep quality?",
        reply_markup=rating_keyboard('sq'),
    )
    return M_SLEEP_QUALITY

async def m_sleep_quality(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    await q.answer()
    val = int(q.data.split(':')[1])
    context.user_data['sleep_quality'] = val
    await q.edit_message_text(f"Sleep quality: *{val}/5* ✓", parse_mode='Markdown')
    await update.effective_chat.send_message(
        "Morning energy right now?",
        reply_markup=rating_keyboard('me'),
    )
    return M_MORNING_ENERGY

async def m_morning_energy(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    await q.answer()
    val = int(q.data.split(':')[1])
    context.user_data['morning_energy'] = val
    await q.edit_message_text(f"Morning energy: *{val}/5* ✓", parse_mode='Markdown')
    await update.effective_chat.send_message(
        "Meds taken?",
        reply_markup=yesno_keyboard('meds'),
    )
    return M_MEDS

async def m_meds(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    await q.answer()
    val = q.data.split(':')[1] == 'yes'
    context.user_data['meds_taken'] = val
    await q.edit_message_text(f"Meds: *{'Yes' if val else 'No'}* ✓", parse_mode='Markdown')
    await update.effective_chat.send_message(
        "Exercise this morning?",
        reply_markup=yesno_keyboard('ex'),
    )
    return M_EXERCISE

async def m_exercise(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    await q.answer()
    val = q.data.split(':')[1] == 'yes'
    context.user_data['exercise'] = val
    await q.edit_message_text(f"Exercise: *{'Yes' if val else 'No'}* ✓", parse_mode='Markdown')
    if val:
        await update.effective_chat.send_message(
            "How many minutes?",
            reply_markup=exercise_min_keyboard(),
        )
        return M_EXERCISE_MIN
    else:
        context.user_data['exercise_minutes'] = 0
        await update.effective_chat.send_message(
            "Caffeine so far?",
            reply_markup=caffeine_keyboard(),
        )
        return M_CAFFEINE

async def m_exercise_min(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    await q.answer()
    val = int(q.data.split(':')[1])
    context.user_data['exercise_minutes'] = val
    await q.edit_message_text(f"Exercise: *{val} min* ✓", parse_mode='Markdown')
    await update.effective_chat.send_message(
        "Caffeine so far?",
        reply_markup=caffeine_keyboard(),
    )
    return M_CAFFEINE

async def m_caffeine(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    await q.answer()
    val = int(q.data.split(':')[1])
    context.user_data['caffeine_cups'] = val
    await q.edit_message_text(f"Caffeine: *{val} cup{'s' if val != 1 else ''}* ✓", parse_mode='Markdown')

    upsert_notion(context.user_data)
    streak = calculate_streak(context.user_data['date'])
    streak_line = f"\n🔥 *{streak} day streak*" if streak > 1 else ""
    await update.effective_chat.send_message(
        f"Logged. ✓{streak_line}\n\nSee you tonight.",
        parse_mode='Markdown',
    )
    return ConversationHandler.END

# ── Evening flow ──────────────────────────────────────────────────────────────

async def evening_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.clear()
    context.user_data['date'] = today_str()
    await update.effective_chat.send_message("🌙 *Evening check-in.* How was your afternoon energy?", parse_mode='Markdown',
        reply_markup=rating_keyboard('ae'))
    return E_AFTERNOON_ENERGY

async def e_afternoon_energy(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    await q.answer()
    val = int(q.data.split(':')[1])
    context.user_data['afternoon_energy'] = val
    await q.edit_message_text(f"Afternoon energy: *{val}/5* ✓", parse_mode='Markdown')
    await update.effective_chat.send_message("Mood at end of day?", reply_markup=rating_keyboard('mood'))
    return E_MOOD

async def e_mood(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    await q.answer()
    val = int(q.data.split(':')[1])
    context.user_data['mood_eod'] = val
    await q.edit_message_text(f"Mood: *{val}/5* ✓", parse_mode='Markdown')
    await update.effective_chat.send_message("Focus quality today?", reply_markup=rating_keyboard('fq'))
    return E_FOCUS

async def e_focus(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    await q.answer()
    val = int(q.data.split(':')[1])
    context.user_data['focus_quality'] = val
    await q.edit_message_text(f"Focus: *{val}/5* ✓", parse_mode='Markdown')
    await update.effective_chat.send_message(
        "Win of the day? _(or tap Skip)_",
        parse_mode='Markdown',
        reply_markup=skip_keyboard('win'),
    )
    return E_WIN

async def e_win_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['win_of_day'] = update.message.text.strip()
    await update.effective_chat.send_message(
        "Where are you leaving off? _(or tap Skip)_",
        parse_mode='Markdown',
        reply_markup=skip_keyboard('loff'),
    )
    return E_LEFT_OFF

async def e_win_skip(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    await q.answer()
    await q.edit_message_text("Win: _skipped_", parse_mode='Markdown')
    await update.effective_chat.send_message(
        "Where are you leaving off? _(or tap Skip)_",
        parse_mode='Markdown',
        reply_markup=skip_keyboard('loff'),
    )
    return E_LEFT_OFF

async def e_left_off_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['where_left_off'] = update.message.text.strip()
    return await _finish_evening(update, context)

async def e_left_off_skip(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query
    await q.answer()
    await q.edit_message_text("Left off: _skipped_", parse_mode='Markdown')
    return await _finish_evening(update, context)

async def _finish_evening(update: Update, context: ContextTypes.DEFAULT_TYPE):
    upsert_notion(context.user_data)
    streak = calculate_streak(context.user_data['date'])
    streak_line = f"\n🔥 *{streak} day streak*" if streak > 1 else ""
    await update.effective_chat.send_message(
        f"Logged. ✓{streak_line}\n\nGood night.",
        parse_mode='Markdown',
    )
    return ConversationHandler.END

# ── Cancel ────────────────────────────────────────────────────────────────────

async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.effective_chat.send_message("Check-in cancelled. Use /morning or /evening to start again.")
    return ConversationHandler.END

# ── Scheduled triggers ────────────────────────────────────────────────────────

def schedule_checkins(app: Application):
    scheduler = BackgroundScheduler(timezone=TZ)

    m_hour, m_min = map(int, MORNING_TIME.split(':'))
    e_hour, e_min = map(int, EVENING_TIME.split(':'))

    async def send_morning():
        await app.bot.send_message(
            chat_id=CHAT_ID,
            text="☀️ Morning check-in time! Tap /morning to start.",
        )

    async def send_evening():
        await app.bot.send_message(
            chat_id=CHAT_ID,
            text="🌙 Evening check-in time! Tap /evening to start.",
        )

    import asyncio

    def run_morning():
        asyncio.run_coroutine_threadsafe(send_morning(), app.bot._application.loop if hasattr(app.bot, '_application') else asyncio.get_event_loop())

    # Use PTB's job queue for thread-safe scheduling instead
    scheduler.shutdown()

def schedule_with_job_queue(app: Application):
    m_hour, m_min = map(int, MORNING_TIME.split(':'))
    e_hour, e_min = map(int, EVENING_TIME.split(':'))

    async def morning_job(context: ContextTypes.DEFAULT_TYPE):
        await context.bot.send_message(
            chat_id=CHAT_ID,
            text="☀️ Morning check-in time! Tap /morning to start.",
        )

    async def evening_job(context: ContextTypes.DEFAULT_TYPE):
        await context.bot.send_message(
            chat_id=CHAT_ID,
            text="🌙 Evening check-in time! Tap /evening to start.",
        )

    import datetime as dt
    app.job_queue.run_daily(morning_job, time=dt.time(m_hour, m_min, tzinfo=TZ))
    app.job_queue.run_daily(evening_job, time=dt.time(e_hour, e_min, tzinfo=TZ))
    log.info(f"Scheduled morning at {MORNING_TIME}, evening at {EVENING_TIME} ({TZ})")

# ── Health check server (required by Render free tier) ────────────────────────

class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'ok')
    def log_message(self, *args):
        pass  # suppress access logs

def start_health_server():
    port = int(os.environ.get('PORT', 8080))
    HTTPServer(('0.0.0.0', port), HealthHandler).serve_forever()

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    threading.Thread(target=start_health_server, daemon=True).start()
    log.info("Health server started")

    app = Application.builder().token(BOT_TOKEN).build()

    morning_handler = ConversationHandler(
        entry_points=[CommandHandler('morning', morning_start)],
        states={
            M_SLEEP_HOURS:    [CallbackQueryHandler(m_sleep_hours,   pattern=r'^sleep:')],
            M_SLEEP_QUALITY:  [CallbackQueryHandler(m_sleep_quality, pattern=r'^sq:')],
            M_MORNING_ENERGY: [CallbackQueryHandler(m_morning_energy,pattern=r'^me:')],
            M_MEDS:           [CallbackQueryHandler(m_meds,          pattern=r'^meds:')],
            M_EXERCISE:       [CallbackQueryHandler(m_exercise,      pattern=r'^ex:')],
            M_EXERCISE_MIN:   [CallbackQueryHandler(m_exercise_min,  pattern=r'^exmin:')],
            M_CAFFEINE:       [CallbackQueryHandler(m_caffeine,      pattern=r'^caffeine:')],
        },
        fallbacks=[CommandHandler('cancel', cancel)],
        per_chat=True,
    )

    evening_handler = ConversationHandler(
        entry_points=[CommandHandler('evening', evening_start)],
        states={
            E_AFTERNOON_ENERGY: [CallbackQueryHandler(e_afternoon_energy, pattern=r'^ae:')],
            E_MOOD:             [CallbackQueryHandler(e_mood,             pattern=r'^mood:')],
            E_FOCUS:            [CallbackQueryHandler(e_focus,            pattern=r'^fq:')],
            E_WIN: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, e_win_text),
                CallbackQueryHandler(e_win_skip, pattern=r'^win:skip'),
            ],
            E_LEFT_OFF: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, e_left_off_text),
                CallbackQueryHandler(e_left_off_skip, pattern=r'^loff:skip'),
            ],
        },
        fallbacks=[CommandHandler('cancel', cancel)],
        per_chat=True,
    )

    app.add_handler(morning_handler)
    app.add_handler(evening_handler)

    schedule_with_job_queue(app)

    log.info("Bot starting with polling...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == '__main__':
    main()
