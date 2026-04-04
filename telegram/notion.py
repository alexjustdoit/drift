"""All Notion API interactions for the Drift Telegram bot."""

import os
import requests
from datetime import datetime, timedelta

NOTION_TOKEN          = os.environ['NOTION_TOKEN']
NOTION_DB_ID          = os.environ['NOTION_DB_ID']
NOTION_TIME_DB_ID     = os.environ.get('NOTION_TIME_AUDIT_DB_ID', '')

HEADERS = {
    'Authorization': f'Bearer {NOTION_TOKEN}',
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28',
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _query(db_id: str, payload: dict) -> list:
    res = requests.post(
        f'https://api.notion.com/v1/databases/{db_id}/query',
        headers=HEADERS, json=payload,
    )
    res.raise_for_status()
    return res.json().get('results', [])


def _create_page(db_id: str, properties: dict):
    requests.post(
        'https://api.notion.com/v1/pages',
        headers=HEADERS,
        json={'parent': {'database_id': db_id}, 'properties': properties},
    )


def _patch_page(page_id: str, properties: dict):
    requests.patch(
        f'https://api.notion.com/v1/pages/{page_id}',
        headers=HEADERS, json={'properties': properties},
    )


# ── Daily log ─────────────────────────────────────────────────────────────────

def find_page_by_date(date_str: str) -> dict | None:
    results = _query(NOTION_DB_ID, {
        'filter': {'property': 'Date', 'date': {'equals': date_str}},
    })
    return results[0] if results else None


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
    return props


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


def get_last_left_off(tz) -> str | None:
    try:
        cutoff = (datetime.now(tz) - timedelta(days=7)).strftime('%Y-%m-%d')
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


def get_week_stats(tz) -> dict | None:
    """Aggregate stats for the last 7 days. Returns None if no data."""
    try:
        cutoff = (datetime.now(tz) - timedelta(days=7)).strftime('%Y-%m-%d')
        results = _query(NOTION_DB_ID, {
            'filter': {'property': 'Date', 'date': {'on_or_after': cutoff}},
            'sorts': [{'property': 'Date', 'direction': 'ascending'}],
            'page_size': 7,
        })
        if not results:
            return None

        def num(page, key):
            return page['properties'].get(key, {}).get('number')

        def check(page, key):
            return page['properties'].get(key, {}).get('checkbox', False)

        def text_items(page, key):
            items = page['properties'].get(key, {}).get('rich_text', [])
            return items[0]['plain_text'].strip() if items else ''

        days_logged = len(results)
        sleep_vals  = [v for p in results if (v := num(p, 'Sleep Hours')) is not None]
        focus_vals  = [v for p in results if (v := num(p, 'Focus Quality')) is not None]
        mood_vals   = [v for p in results if (v := num(p, 'Mood EOD')) is not None]
        days_meds   = sum(1 for p in results if check(p, 'Meds Taken'))
        days_ex     = sum(1 for p in results if check(p, 'Exercise'))
        wins        = [text_items(p, 'Win of the Day') for p in results]
        wins        = [w for w in wins if w]

        # Best day: highest combined focus + mood
        best_day = None
        best_score = -1
        for page in results:
            f = num(page, 'Focus Quality') or 0
            m = num(page, 'Mood EOD') or 0
            if f + m > best_score:
                best_score = f + m
                d = page['properties'].get('Date', {}).get('date', {}).get('start', '')
                if d:
                    best_day = (datetime.strptime(d, '%Y-%m-%d').strftime('%A'), round(f), round(m))

        import random
        return {
            'days_logged':  days_logged,
            'avg_sleep':    round(sum(sleep_vals) / len(sleep_vals), 1) if sleep_vals else None,
            'avg_focus':    round(sum(focus_vals) / len(focus_vals), 1) if focus_vals else None,
            'avg_mood':     round(sum(mood_vals)  / len(mood_vals),  1) if mood_vals  else None,
            'days_meds':    days_meds,
            'days_ex':      days_ex,
            'best_day':     best_day,
            'random_win':   random.choice(wins) if wins else None,
        }
    except Exception:
        return None


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
