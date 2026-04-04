"""Fetches and parses data from the ADHD Daily Log Notion database."""

import streamlit as st
import requests
import pandas as pd
from datetime import datetime, date

NOTION_VERSION = "2022-06-28"


def _headers():
    return {
        "Authorization": f"Bearer {st.secrets['NOTION_TOKEN']}",
        "Content-Type": "application/json",
        "Notion-Version": NOTION_VERSION,
    }


@st.cache_data(ttl=300)  # refresh every 5 minutes
def fetch_logs(days_back: int = 90) -> pd.DataFrame:
    """Fetch up to `days_back` days of log entries. Returns a DataFrame."""
    db_id = st.secrets["NOTION_DB_ID"]
    url = f"https://api.notion.com/v1/databases/{db_id}/query"

    cutoff = pd.Timestamp.now() - pd.Timedelta(days=days_back)
    payload = {
        "filter": {
            "property": "Date",
            "date": {"on_or_after": cutoff.strftime("%Y-%m-%d")},
        },
        "sorts": [{"property": "Date", "direction": "ascending"}],
        "page_size": 100,
    }

    rows = []
    while True:
        res = requests.post(url, headers=_headers(), json=payload)
        res.raise_for_status()
        data = res.json()
        for page in data.get("results", []):
            rows.append(_parse_page(page))
        if not data.get("has_more"):
            break
        payload["start_cursor"] = data["next_cursor"]

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").reset_index(drop=True)
    return df


def _parse_page(page: dict) -> dict:
    props = page["properties"]

    def num(key):
        v = props.get(key, {}).get("number")
        return float(v) if v is not None else None

    def check(key):
        return props.get(key, {}).get("checkbox", False)

    def text(key):
        items = props.get(key, {}).get("rich_text", [])
        return items[0]["plain_text"] if items else ""

    def date_val(key):
        d = props.get(key, {}).get("date")
        return d["start"] if d else None

    return {
        "date":             date_val("Date"),
        "sleep_hours":      num("Sleep Hours"),
        "sleep_quality":    num("Sleep Quality"),
        "morning_energy":   num("Morning Energy"),
        "meds_taken":       check("Meds Taken"),
        "exercise":         check("Exercise"),
        "exercise_minutes": num("Exercise Minutes"),
        "caffeine_cups":    num("Caffeine Cups"),
        "midday_energy":    num("Midday Energy"),
        "midday_mood":      num("Midday Mood"),
        "working_on":       text("Working On"),
        "afternoon_energy": num("Afternoon Energy"),
        "mood_eod":         num("Mood EOD"),
        "focus_quality":    num("Focus Quality"),
        "win_of_day":       text("Win of the Day"),
        "where_left_off":   text("Where I Left Off"),
        "notes":            text("Notes"),
    }


@st.cache_data(ttl=300)
def fetch_time_audit(days_back: int = 90) -> pd.DataFrame:
    """Fetch time audit entries. Returns empty DataFrame if DB not configured."""
    db_id = st.secrets.get("NOTION_TIME_AUDIT_DB_ID", "")
    if not db_id:
        return pd.DataFrame()

    cutoff = pd.Timestamp.now() - pd.Timedelta(days=days_back)
    payload = {
        "filter": {"property": "Date", "date": {"on_or_after": cutoff.strftime("%Y-%m-%d")}},
        "sorts": [{"property": "Date", "direction": "ascending"}],
        "page_size": 100,
    }

    rows = []
    url = f"https://api.notion.com/v1/databases/{db_id}/query"
    while True:
        res = requests.post(url, headers=_headers(), json=payload)
        res.raise_for_status()
        data = res.json()
        for page in data.get("results", []):
            props = page["properties"]
            def num(key): v = props.get(key, {}).get("number"); return float(v) if v is not None else None
            def title(): items = props.get("Name", {}).get("title", []); return items[0]["plain_text"] if items else ""
            def dv(key): d = props.get(key, {}).get("date"); return d["start"] if d else None
            rows.append({
                "date":            dv("Date"),
                "task":            title(),
                "planned_minutes": num("Planned Minutes"),
                "actual_minutes":  num("Actual Minutes"),
                "productivity":    num("Productivity"),
            })
        if not data.get("has_more"):
            break
        payload["start_cursor"] = data["next_cursor"]

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    return df.sort_values("date").reset_index(drop=True)
