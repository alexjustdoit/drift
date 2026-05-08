"""Drift FastAPI backend — Notion proxy + AI endpoints."""

import asyncio
import json
import os
from datetime import datetime
from typing import Any, Dict, Optional

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pywebpush import webpush, WebPushException

import notion
import ai

VAPID_PRIVATE_KEY = os.getenv('VAPID_PRIVATE_KEY', '')
VAPID_PUBLIC_KEY = os.getenv('VAPID_PUBLIC_KEY', '')
VAPID_EMAIL = os.getenv('VAPID_EMAIL', 'mailto:admin@example.com')

app = FastAPI(title='Drift API')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)


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


class TimerPushRequest(BaseModel):
    end_time_ms: float
    task: str
    subscription: PushSubscription


# Holds the single pending timer task (single-user app)
_pending_push_task: Optional[asyncio.Task] = None


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


@app.post('/push/subscribe')
def push_subscribe(sub: PushSubscription):
    # Just validates the subscription is well-formed; we use the one sent with /push/timer
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
