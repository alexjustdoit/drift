"""Drift FastAPI backend — Notion proxy + AI endpoints."""

import asyncio
import json
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

import requests

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pywebpush import webpush, WebPushException
from apscheduler.schedulers.background import BackgroundScheduler
import pytz

import notion
import ai

VAPID_PRIVATE_KEY = os.getenv('VAPID_PRIVATE_KEY', '')
VAPID_PUBLIC_KEY = os.getenv('VAPID_PUBLIC_KEY', '')
VAPID_EMAIL = os.getenv('VAPID_EMAIL', 'mailto:admin@example.com')
PUSH_SUB_FILE = os.path.join(os.path.dirname(__file__), 'push_sub.json')
TODOIST_API_TOKEN = os.getenv('TODOIST_API_TOKEN', '')

app = FastAPI(title='Drift API')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)

# Initialize scheduler
scheduler = BackgroundScheduler()
scheduler.start()


@app.on_event('startup')
def startup():
    _load_subscription()


@app.on_event('shutdown')
def shutdown():
    scheduler.shutdown()


# ── Models ────────────────────────────────────────────────────────────────────

class LogEntry(BaseModel):
    date: str
    sleep_hours: Optional[float] = None
    sleep_quality: Optional[int] = None
    morning_energy: Optional[int] = None
    meds_taken: Optional[bool] = None
    exercise: Optional[bool] = None
    exercise_minutes: Optional[int] = None
    caffeine_cups: Optional[float] = None
    midday_energy: Optional[int] = None
    midday_mood: Optional[int] = None
    working_on: Optional[str] = None
    afternoon_energy: Optional[int] = None
    mood_eod: Optional[int] = None
    focus_quality: Optional[int] = None
    win_of_day: Optional[str] = None
    where_left_off: Optional[str] = None
    notes: Optional[str] = None


class CaptureEntry(BaseModel):
    text: str
    date: Optional[str] = None


class BreakdownRequest(BaseModel):
    task: str


class TimeAuditEntry(BaseModel):
    task: str
    date: Optional[str] = None
    planned_minutes: int
    actual_minutes: int
    productivity: Optional[int] = None


class TodoistTasksRequest(BaseModel):
    tasks: List[str]


# ── Log endpoints ─────────────────────────────────────────────────────────────

@app.post('/log')
def log_entry(entry: LogEntry):
    data = entry.model_dump(exclude_none=True)
    notion.upsert_log(data)
    streak = notion.calculate_streak(entry.date)
    return {'ok': True, 'streak': streak}


@app.get('/yesterday')
def yesterday():
    return {'text': notion.get_last_left_off()}


@app.get('/logs')
def get_logs(days: int = Query(90, ge=1, le=365)):
    return notion.fetch_logs(days)


# ── Capture endpoints ─────────────────────────────────────────────────────────

@app.post('/capture')
def capture(entry: CaptureEntry):
    notion.save_capture(entry.text, entry.date)
    return {'ok': True}


@app.get('/captures')
def get_captures(limit: int = Query(20, ge=1, le=100)):
    return notion.fetch_captures(limit)


@app.get('/captures/surface')
def surface_captures():
    captures = notion.fetch_captures(50)
    insight = ai.surface_captures(captures)
    return {'insight': insight}


@app.patch('/capture/{page_id}/archive')
def archive_capture(page_id: str):
    notion.archive_capture(page_id)
    return {'ok': True}


@app.post('/capture/{page_id}/extract-tasks')
def extract_tasks(page_id: str):
    captures = notion.fetch_capture_by_id(page_id)
    if not captures:
        raise HTTPException(status_code=404, detail='Capture not found')
    tasks = ai.extract_tasks(captures['text'])
    return {'tasks': tasks}


# ── Todoist endpoints ─────────────────────────────────────────────────────────

@app.post('/todoist/tasks')
def add_todoist_tasks(req: TodoistTasksRequest):
    if not TODOIST_API_TOKEN:
        raise HTTPException(status_code=503, detail='Todoist not configured')
    headers = {'Authorization': f'Bearer {TODOIST_API_TOKEN}', 'Content-Type': 'application/json'}
    failed = []
    for task in req.tasks:
        r = requests.post(
            'https://api.todoist.com/rest/v2/tasks',
            headers=headers,
            json={'content': task},
        )
        if not r.ok:
            failed.append(task)
    if failed:
        raise HTTPException(status_code=502, detail=f'Failed to add: {failed}')
    return {'ok': True, 'added': len(req.tasks)}


# ── AI endpoints ──────────────────────────────────────────────────────────────

@app.post('/breakdown')
def breakdown(req: BreakdownRequest):
    try:
        steps = ai.breakdown_task(req.task)
    except Exception:
        raise HTTPException(status_code=500, detail='AI breakdown failed')
    return {'steps': steps}


@app.get('/ai-report')
def ai_report(days: int = Query(30, ge=7, le=365)):
    logs = notion.fetch_logs(days)
    report = ai.generate_report(logs)
    return {'report': report}


# ── Time audit endpoints ──────────────────────────────────────────────────────

@app.post('/time-audit')
def post_time_audit(entry: TimeAuditEntry):
    notion.log_time_audit(entry.model_dump(exclude_none=True))
    return {'ok': True}


@app.get('/time-audit')
def get_time_audit(days: int = Query(90, ge=1, le=365)):
    return notion.fetch_time_audit(days)


# ── Focus session sync ────────────────────────────────────────────────────────

class FocusSession(BaseModel):
    task: str
    phase: str  # 'running' | 'paused'
    end_time_ms: Optional[float] = None
    total_seconds: int
    remaining_seconds: Optional[int] = None


_active_session: Optional[dict] = None


@app.post('/focus/session')
def set_focus_session(session: FocusSession):
    global _active_session
    _active_session = session.model_dump()
    return {'ok': True}


@app.get('/focus/session')
def get_focus_session():
    return _active_session or {}


@app.delete('/focus/session')
def clear_focus_session():
    global _active_session
    _active_session = None
    return {'ok': True}


# ── Push notification endpoints ───────────────────────────────────────────────

class PushSubscription(BaseModel):
    endpoint: str
    keys: Dict[str, str]
    expirationTime: Optional[Any] = None


class PushSubscribeRequest(BaseModel):
    subscription: PushSubscription
    timezone: str


class TimerPushRequest(BaseModel):
    end_time_ms: float
    task: str
    subscription: PushSubscription


# Holds the single pending timer task (single-user app)
_pending_push_task: Optional[asyncio.Task] = None

# Store subscriptions with timezone for daily reminders
_stored_subscription: Optional[Dict] = None
_stored_timezone: Optional[str] = None


def _persist_subscription() -> None:
    try:
        with open(PUSH_SUB_FILE, 'w') as f:
            json.dump({'subscription': _stored_subscription, 'timezone': _stored_timezone}, f)
    except Exception:
        pass


def _load_subscription() -> None:
    global _stored_subscription, _stored_timezone
    try:
        with open(PUSH_SUB_FILE) as f:
            data = json.load(f)
        _stored_subscription = data.get('subscription')
        _stored_timezone = data.get('timezone')
        if _stored_subscription and _stored_timezone:
            _schedule_daily_reminders()
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        pass


def _send_push(subscription: PushSubscription, title: str, body: str) -> None:
    if not VAPID_PRIVATE_KEY:
        return
    try:
        webpush(
            subscription_info={'endpoint': subscription.endpoint, 'keys': subscription.keys},
            data=json.dumps({'title': title, 'body': body, 'url': '/focus'}),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={'sub': VAPID_EMAIL},
        )
    except WebPushException:
        pass


def _send_daily_reminder(title: str, body: str) -> None:
    """Send a reminder push. Called by scheduled jobs."""
    global _stored_subscription
    if not _stored_subscription:
        return
    try:
        webpush(
            subscription_info={'endpoint': _stored_subscription['endpoint'], 'keys': _stored_subscription['keys']},
            data=json.dumps({'title': title, 'body': body, 'url': '/log'}),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={'sub': VAPID_EMAIL},
        )
    except WebPushException:
        pass


def _schedule_daily_reminders() -> None:
    """Schedule 9am morning and 10pm evening reminders in the user's timezone."""
    global _stored_timezone
    if not _stored_timezone:
        return
    try:
        tz = pytz.timezone(_stored_timezone)
        scheduler.add_job(
            lambda: _send_daily_reminder('☀️ Time for your daily log', 'Check in on sleep, energy, meds, and mood.'),
            'cron', hour=19, minute=5, timezone=tz, id='reminder_morning', replace_existing=True
        )
        scheduler.add_job(
            lambda: _send_daily_reminder('🌙 Evening check-in ready', 'Log your movement, caffeine, wins, and where you left off.'),
            'cron', hour=19, minute=6, timezone=tz, id='reminder_evening', replace_existing=True
        )
    except Exception:
        pass


@app.post('/push/subscribe')
def push_subscribe(req: PushSubscribeRequest):
    global _stored_subscription, _stored_timezone
    _stored_subscription = req.subscription.model_dump()
    _stored_timezone = req.timezone
    _persist_subscription()
    _schedule_daily_reminders()
    return {'ok': True}


@app.post('/push/timer')
async def push_timer(req: TimerPushRequest):
    global _pending_push_task
    if _pending_push_task and not _pending_push_task.done():
        _pending_push_task.cancel()

    delay = max(0, (req.end_time_ms - datetime.utcnow().timestamp() * 1000) / 1000)

    async def _fire():
        await asyncio.sleep(delay)
        _send_push(req.subscription, 'Session complete 🎉', req.task)

    _pending_push_task = asyncio.create_task(_fire())
    return {'ok': True, 'fires_in_seconds': round(delay)}


@app.post('/push/cancel')
async def push_cancel():
    global _pending_push_task
    if _pending_push_task and not _pending_push_task.done():
        _pending_push_task.cancel()
    return {'ok': True}


# ── Health ────────────────────────────────────────────────────────────────────

@app.get('/health')
def health():
    return {'status': 'ok', 'ts': datetime.utcnow().isoformat()}
