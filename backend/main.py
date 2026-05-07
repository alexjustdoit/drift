"""Drift FastAPI backend — Notion proxy + AI endpoints."""

from datetime import datetime
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import notion
import ai

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


# ── Health ────────────────────────────────────────────────────────────────────

@app.get('/health')
def health():
    return {'status': 'ok', 'ts': datetime.utcnow().isoformat()}
