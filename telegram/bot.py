"""
Drift Telegram Bot
Sends scheduled check-in prompts and logs to Notion.
All numeric inputs are fully tap-based.

Commands:
  /morning  — morning check-in
  /evening  — evening check-in
  /now      — quick mid-day energy + mood snapshot
  /time     — log planned vs actual time for a task
  /cancel   — cancel current flow
"""

import os
import logging
import threading
import datetime as dt
from http.server import HTTPServer, BaseHTTPRequestHandler

import pytz
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, CallbackQueryHandler,
    MessageHandler, ConversationHandler, filters, ContextTypes,
)
from notion import (
    upsert_log, calculate_streak, get_last_left_off,
    get_week_stats, log_time_audit,
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────

BOT_TOKEN    = os.environ['TELEGRAM_BOT_TOKEN']
CHAT_ID      = int(os.environ['TELEGRAM_CHAT_ID'])
MORNING_TIME = os.environ.get('MORNING_TIME', '08:00')
EVENING_TIME = os.environ.get('EVENING_TIME', '20:00')
DIGEST_DAY   = int(os.environ.get('DIGEST_DAY', '6'))    # 0=Mon … 6=Sun
DIGEST_TIME  = os.environ.get('DIGEST_TIME', '18:00')
TZ           = pytz.timezone(os.environ.get('TIMEZONE', 'America/New_York'))

# ── Conversation states ───────────────────────────────────────────────────────

# Morning (0–6)
M_SLEEP_HOURS, M_SLEEP_QUALITY, M_MORNING_ENERGY, M_MEDS, M_EXERCISE, M_EXERCISE_MIN, M_CAFFEINE = range(7)

# Evening (10–14)
E_AFTERNOON_ENERGY, E_MOOD, E_FOCUS, E_WIN, E_LEFT_OFF = range(10, 15)

# Quick log (20–22)
N_ENERGY, N_MOOD, N_WORKING = range(20, 23)

# Time audit (30–33)
T_TASK, T_PLANNED, T_ACTUAL, T_PRODUCTIVITY = range(30, 34)

# ── Keyboard helpers ──────────────────────────────────────────────────────────

def rating_kb(prefix):
    return InlineKeyboardMarkup([[
        InlineKeyboardButton(str(i), callback_data=f'{prefix}:{i}') for i in range(1, 6)
    ]])

def yesno_kb(prefix):
    return InlineKeyboardMarkup([[
        InlineKeyboardButton('Yes', callback_data=f'{prefix}:yes'),
        InlineKeyboardButton('No',  callback_data=f'{prefix}:no'),
    ]])

def skip_kb(prefix):
    return InlineKeyboardMarkup([[InlineKeyboardButton('Skip', callback_data=f'{prefix}:skip')]])

def sleep_kb():
    r1 = [InlineKeyboardButton(f'{h}h', callback_data=f'sleep:{h}') for h in [4.0, 5.0, 6.0, 6.5, 7.0]]
    r2 = [InlineKeyboardButton(f'{h}h', callback_data=f'sleep:{h}') for h in [7.5, 8.0, 8.5, 9.0, 10.0]]
    return InlineKeyboardMarkup([r1, r2])

def caffeine_kb():
    return InlineKeyboardMarkup([[
        InlineKeyboardButton(str(i), callback_data=f'caf:{i}') for i in [0, 1, 2, 3, 4]
    ]])

def ex_min_kb():
    return InlineKeyboardMarkup([[
        InlineKeyboardButton(f'{m}m', callback_data=f'exmin:{m}') for m in [15, 20, 30, 45, 60, 90]
    ]])

def duration_kb(prefix):
    r1 = [InlineKeyboardButton(f'{m}m', callback_data=f'{prefix}:{m}') for m in [15, 25, 30, 45]]
    r2 = [InlineKeyboardButton(f'{m}m', callback_data=f'{prefix}:{m}') for m in [60, 90, 120]]
    return InlineKeyboardMarkup([r1, r2])

# ── Shared utils ──────────────────────────────────────────────────────────────

def today() -> str:
    return dt.datetime.now(TZ).strftime('%Y-%m-%d')

async def send(update: Update, text: str, **kwargs):
    await update.effective_chat.send_message(text, parse_mode='Markdown', **kwargs)

async def edit(update: Update, text: str):
    await update.callback_query.edit_message_text(text, parse_mode='Markdown')

async def finish_and_log(update: Update, context: ContextTypes.DEFAULT_TYPE, mode: str):
    context.user_data['date'] = context.user_data.get('date', today())
    upsert_log(context.user_data)
    streak = calculate_streak(context.user_data['date'])
    streak_line = f'\n🔥 *{streak} day streak*' if streak > 1 else ''
    suffix = 'See you tonight.' if mode == 'morning' else 'Good night.'
    await send(update, f'Logged. ✓{streak_line}\n\n{suffix}')
    return ConversationHandler.END

# ── Morning flow ──────────────────────────────────────────────────────────────

async def morning_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.clear()
    left_off = get_last_left_off(TZ)
    if left_off:
        await send(update, f'☀️ *Good morning!*\n\n_Yesterday you left off:_\n{left_off}')
    else:
        await send(update, '☀️ *Good morning!* Time for your morning check-in.')
    await send(update, 'How many hours did you sleep?', reply_markup=sleep_kb())
    return M_SLEEP_HOURS

async def m_sleep_hours(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    v = float(q.data.split(':')[1]); context.user_data['sleep_hours'] = v
    await edit(update, f'Sleep: *{v}h* ✓')
    await send(update, 'Sleep quality?', reply_markup=rating_kb('sq'))
    return M_SLEEP_QUALITY

async def m_sleep_quality(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    v = int(q.data.split(':')[1]); context.user_data['sleep_quality'] = v
    await edit(update, f'Sleep quality: *{v}/5* ✓')
    await send(update, 'Morning energy right now?', reply_markup=rating_kb('me'))
    return M_MORNING_ENERGY

async def m_morning_energy(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    v = int(q.data.split(':')[1]); context.user_data['morning_energy'] = v
    await edit(update, f'Morning energy: *{v}/5* ✓')
    await send(update, 'Meds taken?', reply_markup=yesno_kb('meds'))
    return M_MEDS

async def m_meds(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    v = q.data.split(':')[1] == 'yes'; context.user_data['meds_taken'] = v
    await edit(update, f'Meds: *{"Yes" if v else "No"}* ✓')
    await send(update, 'Exercise this morning?', reply_markup=yesno_kb('ex'))
    return M_EXERCISE

async def m_exercise(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    v = q.data.split(':')[1] == 'yes'; context.user_data['exercise'] = v
    await edit(update, f'Exercise: *{"Yes" if v else "No"}* ✓')
    if v:
        await send(update, 'How many minutes?', reply_markup=ex_min_kb())
        return M_EXERCISE_MIN
    context.user_data['exercise_minutes'] = 0
    await send(update, 'Caffeine so far?', reply_markup=caffeine_kb())
    return M_CAFFEINE

async def m_exercise_min(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    v = int(q.data.split(':')[1]); context.user_data['exercise_minutes'] = v
    await edit(update, f'Exercise: *{v} min* ✓')
    await send(update, 'Caffeine so far?', reply_markup=caffeine_kb())
    return M_CAFFEINE

async def m_caffeine(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    v = int(q.data.split(':')[1]); context.user_data['caffeine_cups'] = v
    await edit(update, f'Caffeine: *{v} cup{"s" if v != 1 else ""}* ✓')
    return await finish_and_log(update, context, 'morning')

# ── Evening flow ──────────────────────────────────────────────────────────────

async def evening_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.clear()
    await send(update, '🌙 *Evening check-in.* Afternoon energy?', reply_markup=rating_kb('ae'))
    return E_AFTERNOON_ENERGY

async def e_afternoon_energy(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    v = int(q.data.split(':')[1]); context.user_data['afternoon_energy'] = v
    await edit(update, f'Afternoon energy: *{v}/5* ✓')
    await send(update, 'Mood at end of day?', reply_markup=rating_kb('mood'))
    return E_MOOD

async def e_mood(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    v = int(q.data.split(':')[1]); context.user_data['mood_eod'] = v
    await edit(update, f'Mood: *{v}/5* ✓')
    await send(update, 'Focus quality today?', reply_markup=rating_kb('fq'))
    return E_FOCUS

async def e_focus(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    v = int(q.data.split(':')[1]); context.user_data['focus_quality'] = v
    await edit(update, f'Focus: *{v}/5* ✓')
    await send(update, 'Win of the day? _(or skip)_', reply_markup=skip_kb('win'))
    return E_WIN

async def e_win_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['win_of_day'] = update.message.text.strip()
    await send(update, 'Where are you leaving off? _(or skip)_', reply_markup=skip_kb('loff'))
    return E_LEFT_OFF

async def e_win_skip(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    await edit(update, 'Win: _skipped_')
    await send(update, 'Where are you leaving off? _(or skip)_', reply_markup=skip_kb('loff'))
    return E_LEFT_OFF

async def e_left_off_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['where_left_off'] = update.message.text.strip()
    return await finish_and_log(update, context, 'evening')

async def e_left_off_skip(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    await edit(update, 'Left off: _skipped_')
    return await finish_and_log(update, context, 'evening')

# ── Quick log (/now) ──────────────────────────────────────────────────────────

async def now_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.clear()
    await send(update, '⚡ *Quick check-in.* Energy right now?', reply_markup=rating_kb('ne'))
    return N_ENERGY

async def n_energy(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    v = int(q.data.split(':')[1]); context.user_data['midday_energy'] = v
    await edit(update, f'Energy: *{v}/5* ✓')
    await send(update, 'Mood?', reply_markup=rating_kb('nm'))
    return N_MOOD

async def n_mood(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    v = int(q.data.split(':')[1]); context.user_data['midday_mood'] = v
    await edit(update, f'Mood: *{v}/5* ✓')
    await send(update, 'What are you working on? _(or skip)_', reply_markup=skip_kb('nw'))
    return N_WORKING

async def n_working_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['working_on'] = update.message.text.strip()
    context.user_data['date'] = today()
    upsert_log(context.user_data)
    await send(update, 'Logged. ✓')
    return ConversationHandler.END

async def n_working_skip(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    await edit(update, 'Working on: _skipped_')
    context.user_data['date'] = today()
    upsert_log(context.user_data)
    await send(update, 'Logged. ✓')
    return ConversationHandler.END

# ── Time audit (/time) ────────────────────────────────────────────────────────

async def time_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not os.environ.get('NOTION_TIME_AUDIT_DB_ID'):
        await send(update, '⚠️ Time audit not set up yet. Add `NOTION_TIME_AUDIT_DB_ID` to your Render env vars.')
        return ConversationHandler.END
    context.user_data.clear()
    await send(update, '⏱ *Time audit.* What were you working on?')
    return T_TASK

async def t_task(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data['task'] = update.message.text.strip()
    await send(update, 'How long did you *plan* to spend?', reply_markup=duration_kb('tp'))
    return T_PLANNED

async def t_planned(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    v = int(q.data.split(':')[1]); context.user_data['planned_minutes'] = v
    await edit(update, f'Planned: *{v} min* ✓')
    await send(update, 'How long did you *actually* spend?', reply_markup=duration_kb('ta'))
    return T_ACTUAL

async def t_actual(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    v = int(q.data.split(':')[1]); context.user_data['actual_minutes'] = v
    await edit(update, f'Actual: *{v} min* ✓')
    await send(update, 'How productive was it? _(or skip)_', reply_markup=InlineKeyboardMarkup([[
        InlineKeyboardButton(str(i), callback_data=f'tp2:{i}') for i in range(1, 6)
    ], [InlineKeyboardButton('Skip', callback_data='tp2:skip')]]))
    return T_PRODUCTIVITY

async def t_productivity(update: Update, context: ContextTypes.DEFAULT_TYPE):
    q = update.callback_query; await q.answer()
    val = q.data.split(':')[1]
    if val != 'skip':
        context.user_data['productivity'] = int(val)
    context.user_data['date'] = today()
    log_time_audit(context.user_data)
    planned = context.user_data['planned_minutes']
    actual  = context.user_data['actual_minutes']
    diff    = actual - planned
    diff_str = f'+{diff}' if diff > 0 else str(diff)
    await edit(update, f'Logged. ✓ _{planned}min planned → {actual}min actual ({diff_str}min)_')
    return ConversationHandler.END

# ── Start / Help ──────────────────────────────────────────────────────────────

HELP_TEXT = (
    '👋 *Drift — ADHD daily companion*\n\n'
    'Available commands:\n\n'
    '/morning — morning check\\-in \\(sleep, energy, meds, exercise\\)\n'
    '/evening — evening check\\-in \\(mood, focus, win of the day\\)\n'
    '/now — quick mid\\-day energy \\+ mood snapshot\n'
    '/time — log planned vs actual time for a task\n'
    '/help — show this message\n'
    '/cancel — cancel the current flow'
)

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.effective_chat.send_message(HELP_TEXT, parse_mode='MarkdownV2')

async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.effective_chat.send_message(HELP_TEXT, parse_mode='MarkdownV2')

# ── Cancel ────────────────────────────────────────────────────────────────────

async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await send(update, 'Cancelled. Use /morning, /evening, /now, or /time to start again.')
    return ConversationHandler.END

# ── Weekly digest ─────────────────────────────────────────────────────────────

async def send_weekly_digest(context: ContextTypes.DEFAULT_TYPE):
    stats = get_week_stats(TZ)
    if not stats:
        return

    lines = ['📊 *Week in review*\n']
    lines.append(f'📅 Logged {stats["days_logged"]}/7 days')
    if stats['avg_sleep']:
        lines.append(f'😴 Avg sleep: {stats["avg_sleep"]}h')
    if stats['avg_focus']:
        lines.append(f'🎯 Avg focus: {stats["avg_focus"]}/5')
    if stats['avg_mood']:
        lines.append(f'😊 Avg mood: {stats["avg_mood"]}/5')
    lines.append(f'💊 Meds: {stats["days_meds"]}/7 days')
    lines.append(f'🏃 Exercise: {stats["days_ex"]}/7 days')

    if stats['best_day']:
        day, focus, mood = stats['best_day']
        lines.append(f'\n✨ Best day: {day} (focus {focus}, mood {mood})')

    if stats['random_win']:
        lines.append(f'\n🏆 Win: _{stats["random_win"]}_')

    await context.bot.send_message(
        chat_id=CHAT_ID,
        text='\n'.join(lines),
        parse_mode='Markdown',
    )

# ── Scheduling ────────────────────────────────────────────────────────────────

def schedule_jobs(app: Application):
    m_h, m_m = map(int, MORNING_TIME.split(':'))
    e_h, e_m = map(int, EVENING_TIME.split(':'))
    d_h, d_m = map(int, DIGEST_TIME.split(':'))

    days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']

    async def morning_nudge(ctx): await ctx.bot.send_message(CHAT_ID, '☀️ Morning check-in time! /morning')
    async def evening_nudge(ctx): await ctx.bot.send_message(CHAT_ID, '🌙 Evening check-in time! /evening')

    app.job_queue.run_daily(morning_nudge, dt.time(m_h, m_m, tzinfo=TZ))
    app.job_queue.run_daily(evening_nudge, dt.time(e_h, e_m, tzinfo=TZ))
    app.job_queue.run_daily(
        send_weekly_digest,
        dt.time(d_h, d_m, tzinfo=TZ),
        days=(DIGEST_DAY,),
    )
    log.info(f'Scheduled: morning {MORNING_TIME}, evening {EVENING_TIME}, digest {days[DIGEST_DAY]} {DIGEST_TIME} ({TZ})')

# ── Health server ─────────────────────────────────────────────────────────────

class _Health(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
    def log_message(self, *a): pass

def start_health_server():
    HTTPServer(('0.0.0.0', int(os.environ.get('PORT', 8080))), _Health).serve_forever()

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    threading.Thread(target=start_health_server, daemon=True).start()

    app = Application.builder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler('start', start))
    app.add_handler(CommandHandler('help', help_cmd))

    app.add_handler(ConversationHandler(
        entry_points=[CommandHandler('morning', morning_start)],
        states={
            M_SLEEP_HOURS:    [CallbackQueryHandler(m_sleep_hours,    pattern=r'^sleep:')],
            M_SLEEP_QUALITY:  [CallbackQueryHandler(m_sleep_quality,  pattern=r'^sq:')],
            M_MORNING_ENERGY: [CallbackQueryHandler(m_morning_energy, pattern=r'^me:')],
            M_MEDS:           [CallbackQueryHandler(m_meds,           pattern=r'^meds:')],
            M_EXERCISE:       [CallbackQueryHandler(m_exercise,       pattern=r'^ex:')],
            M_EXERCISE_MIN:   [CallbackQueryHandler(m_exercise_min,   pattern=r'^exmin:')],
            M_CAFFEINE:       [CallbackQueryHandler(m_caffeine,       pattern=r'^caf:')],
        },
        fallbacks=[CommandHandler('cancel', cancel)],
    ))

    app.add_handler(ConversationHandler(
        entry_points=[CommandHandler('evening', evening_start)],
        states={
            E_AFTERNOON_ENERGY: [CallbackQueryHandler(e_afternoon_energy, pattern=r'^ae:')],
            E_MOOD:             [CallbackQueryHandler(e_mood,             pattern=r'^mood:')],
            E_FOCUS:            [CallbackQueryHandler(e_focus,            pattern=r'^fq:')],
            E_WIN:  [MessageHandler(filters.TEXT & ~filters.COMMAND, e_win_text),
                     CallbackQueryHandler(e_win_skip,       pattern=r'^win:skip')],
            E_LEFT_OFF: [MessageHandler(filters.TEXT & ~filters.COMMAND, e_left_off_text),
                         CallbackQueryHandler(e_left_off_skip, pattern=r'^loff:skip')],
        },
        fallbacks=[CommandHandler('cancel', cancel)],
    ))

    app.add_handler(ConversationHandler(
        entry_points=[CommandHandler('now', now_start)],
        states={
            N_ENERGY:  [CallbackQueryHandler(n_energy,       pattern=r'^ne:')],
            N_MOOD:    [CallbackQueryHandler(n_mood,         pattern=r'^nm:')],
            N_WORKING: [MessageHandler(filters.TEXT & ~filters.COMMAND, n_working_text),
                        CallbackQueryHandler(n_working_skip, pattern=r'^nw:skip')],
        },
        fallbacks=[CommandHandler('cancel', cancel)],
    ))

    app.add_handler(ConversationHandler(
        entry_points=[CommandHandler('time', time_start)],
        states={
            T_TASK:         [MessageHandler(filters.TEXT & ~filters.COMMAND, t_task)],
            T_PLANNED:      [CallbackQueryHandler(t_planned,      pattern=r'^tp:')],
            T_ACTUAL:       [CallbackQueryHandler(t_actual,       pattern=r'^ta:')],
            T_PRODUCTIVITY: [CallbackQueryHandler(t_productivity, pattern=r'^tp2:')],
        },
        fallbacks=[CommandHandler('cancel', cancel)],
    ))

    schedule_jobs(app)
    log.info('Drift bot starting...')
    app.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == '__main__':
    main()
