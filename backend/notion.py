"""Notion API client for the Drift backend."""

import os
import requests
from datetime import datetime, timedelta
from typing import Optional

NOTION_TOKEN      = os.environ['NOTION_TOKEN']
NOTION_DB_ID      = os.environ['NOTION_DB_ID']
NOTION_TIME_DB_ID = os.environ.get('NOTION_TIME_AUDIT_DB_ID', '')
NOTION_CAP_DB_ID  = os.environ.get('NOTION_CAPTURE_DB_ID', '')
NOTION_VERSION    = '2022-06-28'

HEADERS = {
    'Authorization': f'Bearer {NOTION_TOKEN}',
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
}


# ── Core helpers ──────────────────────────────────────────────────────────────

def _query(db_id: str, payload: dict) -> list:
    res = requests.post(
        f'https://api.notion.com/v1/databases/{db_id}/query',
        headers=HEADERS, json=payload,
    )
    res.raise_for_status()
    return res.json().get('results', [])


def _query_all(db_id: str, payload: dict) -> list:
    """Paginate through all results."""
    rows = []
    while True:
        res = requests.post(
            f'https://api.notion.com/v1/databases/{db_id}/query',
            headers=HEADERS, json=payload,
        )
        res.raise_for_status()
        data = res.json()
        rows.extend(data.get('results', []))
        if not data.get('has_more'):
            break
        payload['start_cursor'] = data['next_cursor']
    return rows


def _create_page(db_id: str, properties: dict):
    requests.post(
        'https://api.notion.com/v1/pages',
        headers=HEADERS,
        json={'parent': {'database_id': db_id}, 'properties': properties},
    ).raise_for_status()


def _patch_page(page_id: str, properties: dict):
    requests.patch(
        f'https://api.notion.com/v1/pages/{page_id}',
        headers=HEADERS, json={'properties': properties},
    ).raise_for_status()


# ── Daily log ─────────────────────────────────────────────────────────────────

def _parse_log_page(page: dict) -> dict:
    props = page['properties']

    def num(key):
        v = props.get(key, {}).get('number')
        return float(v) if v is not None else None

    def check(key):
        return props.get(key, {}).get('checkbox', False)

    def text(key):
        items = props.get(key, {}).get('rich_text', [])
        return items[0]['plain_text'] if items else ''

    def date_val(key):
        d = props.get(key, {}).get('date')
        return d['start'] if d else None

    return {
        'date':             date_val('Date'),
        'sleep_hours':      num('Sleep Hours'),
        'sleep_quality':    num('Sleep Quality'),
        'morning_energy':   num('Morning Energy'),
        'meds_taken':       check('Meds Taken'),
        'exercise':         check('Exercise'),
        'exercise_minutes': num('Exercise Minutes'),
        'caffeine_cups':    num('Caffeine Cups'),
        'midday_energy':    num('Midday Energy'),
        'midday_mood':      num('Midday Mood'),
        'working_on':       text('Working On'),
        'afternoon_energy': num('Afternoon Energy'),
        'mood_eod':         num('Mood EOD'),
        'focus_quality':    num('Focus Quality'),
        'win_of_day':       text('Win of the Day'),
        'where_left_off':   text('Where I Left Off'),
        'notes':            text('Notes'),
    }


def build_log_properties(data: dict) -> dict:
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
    if 'midday_energy' in data:
        props['Midday Energy'] = {'number': data['midday_energy']}
    if 'midday_mood' in data:
        props['Midday Mood'] = {'number': data['midday_mood']}
    if 'working_on' in data:
        props['Working On'] = {'rich_text': [{'text': {'content': data['working_on']}}]}
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
    if 'notes' in data:
        props['Notes'] = {'rich_text': [{'text': {'content': data['notes']}}]}
    return props


def find_page_by_date(date_str: str) -> Optional[dict]:
    results = _query(NOTION_DB_ID, {
        'filter': {'property': 'Date', 'date': {'equals': date_str}},
    })
    return results[0] if results else None


def upsert_log(data: dict):
    date_str = data.get('date', datetime.now().strftime('%Y-%m-%d'))
    props = build_log_properties(data)
    existing = find_page_by_date(date_str)
    if existing:
        _patch_page(existing['id'], props)
    else:
        _create_page(NOTION_DB_ID, {
            'Name': {'title': [{'text': {'content': date_str}}]},
            **props,
        })


def calculate_streak(date_str: str) -> int:
    try:
        cutoff = (datetime.strptime(date_str, '%Y-%m-%d') - timedelta(days=60)).strftime('%Y-%m-%d')
        results = _query(NOTION_DB_ID, {
            'filter': {'property': 'Date', 'date': {'on_or_after': cutoff}},
            'sorts': [{'property': 'Date', 'direction': 'descending'}],
            'page_size': 60,
        })
        dates = {
            p['properties']['Date']['date']['start']
            for p in results
            if p['properties'].get('Date', {}).get('date')
        }
        streak, check = 0, datetime.strptime(date_str, '%Y-%m-%d')
        while check.strftime('%Y-%m-%d') in dates:
            streak += 1
            check -= timedelta(days=1)
        return streak
    except Exception:
        return 0


def get_last_left_off() -> Optional[str]:
    try:
        cutoff = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
        results = _query(NOTION_DB_ID, {
            'filter': {'property': 'Date', 'date': {'on_or_after': cutoff}},
            'sorts': [{'property': 'Date', 'direction': 'descending'}],
            'page_size': 7,
        })
        for page in results:
            items = page['properties'].get('Where I Left Off', {}).get('rich_text', [])
            text = items[0]['plain_text'].strip() if items else ''
            if text:
                return text
    except Exception:
        pass
    return None


def fetch_logs(days_back: int = 90) -> list[dict]:
    cutoff = (datetime.now() - timedelta(days=days_back)).strftime('%Y-%m-%d')
    pages = _query_all(NOTION_DB_ID, {
        'filter': {'property': 'Date', 'date': {'on_or_after': cutoff}},
        'sorts': [{'property': 'Date', 'direction': 'ascending'}],
        'page_size': 100,
    })
    return [_parse_log_page(p) for p in pages]


# ── Capture (brain dump) ──────────────────────────────────────────────────────

def save_capture(text: str, date_str: Optional[str] = None):
    if not NOTION_CAP_DB_ID:
        raise RuntimeError('NOTION_CAPTURE_DB_ID not configured')
    date_str = date_str or datetime.now().strftime('%Y-%m-%d')
    _create_page(NOTION_CAP_DB_ID, {
        'Name':     {'title': [{'text': {'content': text[:100]}}]},
        'Date':     {'date': {'start': date_str}},
        'Full Text': {'rich_text': [{'text': {'content': text}}]},
        'Surfaced': {'checkbox': False},
    })


def fetch_captures(limit: int = 20) -> list[dict]:
    if not NOTION_CAP_DB_ID:
        return []
    results = _query(NOTION_CAP_DB_ID, {
        'sorts': [{'property': 'Date', 'direction': 'descending'}],
        'page_size': limit,
    })
    out = []
    for page in results:
        props = page['properties']
        items = props.get('Full Text', {}).get('rich_text', [])
        text = items[0]['plain_text'] if items else ''
        d = props.get('Date', {}).get('date', {})
        out.append({
            'id':       page['id'],
            'text':     text,
            'date':     d.get('start', ''),
            'surfaced': props.get('Surfaced', {}).get('checkbox', False),
        })
    return out


# ── Time audit ────────────────────────────────────────────────────────────────

def log_time_audit(data: dict):
    if not NOTION_TIME_DB_ID:
        raise RuntimeError('NOTION_TIME_AUDIT_DB_ID not configured')
    date_str = data.get('date', datetime.now().strftime('%Y-%m-%d'))
    props = {
        'Name':            {'title': [{'text': {'content': data.get('task', '')}}]},
        'Date':            {'date': {'start': date_str}},
        'Planned Minutes': {'number': data['planned_minutes']},
        'Actual Minutes':  {'number': data['actual_minutes']},
    }
    if 'productivity' in data:
        props['Productivity'] = {'number': data['productivity']}
    _create_page(NOTION_TIME_DB_ID, props)


def fetch_time_audit(days_back: int = 90) -> list[dict]:
    if not NOTION_TIME_DB_ID:
        return []
    cutoff = (datetime.now() - timedelta(days=days_back)).strftime('%Y-%m-%d')
    pages = _query_all(NOTION_TIME_DB_ID, {
        'filter': {'property': 'Date', 'date': {'on_or_after': cutoff}},
        'sorts': [{'property': 'Date', 'direction': 'ascending'}],
        'page_size': 100,
    })
    out = []
    for page in pages:
        props = page['properties']
        def num(key):
            v = props.get(key, {}).get('number')
            return float(v) if v is not None else None
        title_items = props.get('Name', {}).get('title', [])
        d = props.get('Date', {}).get('date', {})
        out.append({
            'date':            d.get('start', ''),
            'task':            title_items[0]['plain_text'] if title_items else '',
            'planned_minutes': num('Planned Minutes'),
            'actual_minutes':  num('Actual Minutes'),
            'productivity':    num('Productivity'),
        })
    return out
