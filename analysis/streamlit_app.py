"""
Drift — Analysis Layer
Surfaces patterns and insights from your ADHD Daily Log.
"""

import streamlit as st
import pandas as pd
import plotly.graph_objects as go
import plotly.express as px
from anthropic import Anthropic
from notion_client import fetch_logs, fetch_time_audit

# ── Page config ──────────────────────────────────────────────────────────────

st.set_page_config(
    page_title="Drift · Insights",
    page_icon="🌊",
    layout="wide",
    initial_sidebar_state="collapsed",
)

# ── Shared styles ─────────────────────────────────────────────────────────────

ACCENT   = "#7c6af7"
SURFACE  = "#161a24"
BORDER   = "#252a38"
MUTED    = "#6b7280"
SUCCESS  = "#34d399"

st.markdown(f"""
<style>
  .metric-card {{
    background: {SURFACE};
    border: 1px solid {BORDER};
    border-radius: 14px;
    padding: 20px 24px;
    text-align: center;
  }}
  .metric-val {{ font-size: 2rem; font-weight: 700; color: #e8eaf0; }}
  .metric-label {{ font-size: 0.8rem; color: {MUTED}; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }}
  .metric-delta {{ font-size: 0.85rem; margin-top: 6px; }}
  .win-card {{
    background: {SURFACE};
    border-left: 3px solid {ACCENT};
    border-radius: 0 12px 12px 0;
    padding: 14px 18px;
    margin-bottom: 10px;
    font-size: 0.95rem;
  }}
  .win-date {{ font-size: 0.75rem; color: {MUTED}; margin-bottom: 4px; }}
  .section-title {{ font-size: 1.1rem; font-weight: 600; margin-bottom: 16px; color: #e8eaf0; }}
  .insight-box {{
    background: {SURFACE};
    border: 1px solid {BORDER};
    border-radius: 14px;
    padding: 20px 24px;
    line-height: 1.7;
    font-size: 0.95rem;
  }}
  .no-data {{
    text-align: center;
    padding: 60px 20px;
    color: {MUTED};
  }}
</style>
""", unsafe_allow_html=True)

# ── Plotly base layout ────────────────────────────────────────────────────────

def base_layout(title="", height=260):
    return dict(
        title=title,
        height=height,
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font=dict(color="#e8eaf0", size=12),
        margin=dict(l=8, r=8, t=32 if title else 8, b=8),
        xaxis=dict(gridcolor=BORDER, linecolor=BORDER, zeroline=False),
        yaxis=dict(gridcolor=BORDER, linecolor=BORDER, zeroline=False),
    )

# ── Data loading ──────────────────────────────────────────────────────────────

with st.spinner("Loading your logs..."):
    try:
        df = fetch_logs(days_back=90)
    except Exception as e:
        st.error(f"Could not connect to Notion: {e}")
        st.stop()

if df.empty:
    st.markdown("""
    <div class="no-data">
        <h3>No logs yet</h3>
        <p>Start logging from the Drift PWA — insights will appear here after a few days.</p>
    </div>
    """, unsafe_allow_html=True)
    st.stop()

# ── Header ────────────────────────────────────────────────────────────────────

col_title, col_range = st.columns([3, 1])
with col_title:
    st.markdown("## drift. &nbsp;<span style='color:#6b7280;font-size:1rem;font-weight:400'>insights</span>", unsafe_allow_html=True)
with col_range:
    window = st.selectbox("Range", ["7 days", "14 days", "30 days", "All time"],
                          index=0, label_visibility="collapsed")

# Filter to selected window
days_map = {"7 days": 7, "14 days": 14, "30 days": 30, "All time": 9999}
cutoff = pd.Timestamp.now() - pd.Timedelta(days=days_map[window])
view = df[df["date"] >= cutoff].copy()

st.divider()

# ── Tabs ──────────────────────────────────────────────────────────────────────

tab_overview, tab_patterns, tab_wins, tab_ai, tab_time = st.tabs(
    ["Overview", "Patterns", "Win Log", "AI Report", "Time Audit"]
)

# ═══════════════════════════════════════════════════════
# TAB 1 — OVERVIEW
# ═══════════════════════════════════════════════════════

with tab_overview:
    if view.empty:
        st.info("No data in this range yet.")
    else:
        # KPI row
        prev_cutoff = cutoff - pd.Timedelta(days=days_map[window])
        prev = df[(df["date"] >= prev_cutoff) & (df["date"] < cutoff)]

        def avg(col, data=view):
            return data[col].dropna().mean()

        def delta_str(col):
            cur = avg(col, view)
            p = avg(col, prev) if not prev.empty else None
            if p is None or pd.isna(cur) or pd.isna(p) or p == 0:
                return ""
            diff = cur - p
            color = SUCCESS if diff >= 0 else "#f87171"
            arrow = "↑" if diff >= 0 else "↓"
            return f'<div class="metric-delta" style="color:{color}">{arrow} {abs(diff):.1f} vs prior period</div>'

        metrics = [
            ("sleep_hours",    "Avg Sleep",       "hrs"),
            ("focus_quality",  "Avg Focus",        "/ 5"),
            ("mood_eod",       "Avg Mood",         "/ 5"),
            ("morning_energy", "Morning Energy",   "/ 5"),
        ]

        cols = st.columns(len(metrics))
        for col, (key, label, unit) in zip(cols, metrics):
            val = avg(key)
            with col:
                st.markdown(f"""
                <div class="metric-card">
                  <div class="metric-val">{val:.1f}<span style="font-size:1rem;color:{MUTED}">{unit}</span></div>
                  <div class="metric-label">{label}</div>
                  {delta_str(key)}
                </div>
                """, unsafe_allow_html=True)

        st.markdown("<br>", unsafe_allow_html=True)

        # Habit streaks
        c1, c2, c3 = st.columns(3)

        def current_streak(col):
            """Count consecutive days (most recent first) where col is True."""
            recent = view.sort_values("date", ascending=False)
            streak = 0
            for v in recent[col]:
                if v:
                    streak += 1
                else:
                    break
            return streak

        meds_streak = current_streak("meds_taken")
        ex_streak = current_streak("exercise")
        pct_meds = view["meds_taken"].mean() * 100
        pct_ex = view["exercise"].mean() * 100

        with c1:
            st.markdown(f"""
            <div class="metric-card">
              <div class="metric-val" style="color:{ACCENT}">{meds_streak}d</div>
              <div class="metric-label">Meds streak</div>
              <div class="metric-delta" style="color:{MUTED}">{pct_meds:.0f}% of days this period</div>
            </div>""", unsafe_allow_html=True)
        with c2:
            st.markdown(f"""
            <div class="metric-card">
              <div class="metric-val" style="color:{ACCENT}">{ex_streak}d</div>
              <div class="metric-label">Exercise streak</div>
              <div class="metric-delta" style="color:{MUTED}">{pct_ex:.0f}% of days this period</div>
            </div>""", unsafe_allow_html=True)
        with c3:
            avg_caf = avg("caffeine_cups")
            st.markdown(f"""
            <div class="metric-card">
              <div class="metric-val">{avg_caf:.1f}<span style="font-size:1rem;color:{MUTED}"> cups</span></div>
              <div class="metric-label">Avg Caffeine</div>
              <div class="metric-delta" style="color:{MUTED}">per day</div>
            </div>""", unsafe_allow_html=True)

        st.markdown("<br>", unsafe_allow_html=True)

        # Daily focus + mood trend
        st.markdown('<div class="section-title">Focus & Mood over time</div>', unsafe_allow_html=True)

        fig = go.Figure()
        fig.add_trace(go.Scatter(
            x=view["date"], y=view["focus_quality"],
            name="Focus", mode="lines+markers",
            line=dict(color=ACCENT, width=2),
            marker=dict(size=5),
        ))
        fig.add_trace(go.Scatter(
            x=view["date"], y=view["mood_eod"],
            name="Mood", mode="lines+markers",
            line=dict(color=SUCCESS, width=2, dash="dot"),
            marker=dict(size=5),
        ))
        fig.update_layout(**base_layout(height=220))
        fig.update_yaxes(range=[0.5, 5.5], dtick=1)
        st.plotly_chart(fig, use_container_width=True)

# ═══════════════════════════════════════════════════════
# TAB 2 — PATTERNS
# ═══════════════════════════════════════════════════════

with tab_patterns:
    if len(view) < 5:
        st.info("Need at least 5 days of data to show patterns. Keep logging!")
    else:
        st.markdown('<div class="section-title">What predicts your best focus days?</div>', unsafe_allow_html=True)

        factors = {
            "sleep_hours":    "Sleep Hours",
            "sleep_quality":  "Sleep Quality",
            "morning_energy": "Morning Energy",
            "meds_taken":     "Meds Taken",
            "exercise":       "Exercise",
            "caffeine_cups":  "Caffeine",
        }

        # Correlation bar chart
        corr_data = view[list(factors.keys()) + ["focus_quality"]].copy()
        corr_data["meds_taken"] = corr_data["meds_taken"].astype(float)
        corr_data["exercise"] = corr_data["exercise"].astype(float)
        corrs = corr_data.corr()["focus_quality"].drop("focus_quality").dropna()
        corrs = corrs.reindex([k for k in factors.keys() if k in corrs.index])
        corrs.index = [factors[k] for k in corrs.index]

        colors = [ACCENT if v >= 0 else "#f87171" for v in corrs.values]
        fig = go.Figure(go.Bar(
            x=corrs.values, y=corrs.index,
            orientation="h",
            marker_color=colors,
        ))
        fig.update_layout(**base_layout("Correlation with Focus Quality", height=280))
        fig.update_xaxes(range=[-1, 1], zeroline=True, zerolinecolor=BORDER)
        st.plotly_chart(fig, use_container_width=True)

        # Scatter: top positive correlator vs focus
        top_factor = corrs.idxmax()
        top_key = [k for k, v in factors.items() if v == top_factor]
        if top_key:
            k = top_key[0]
            st.markdown(f'<div class="section-title">Sleep Hours vs Focus</div>', unsafe_allow_html=True)
            scatter_df = view[["date", k, "focus_quality", "meds_taken", "exercise"]].dropna(subset=[k, "focus_quality"])

            fig2 = px.scatter(
                scatter_df, x=k, y="focus_quality",
                trendline="ols",
                color_discrete_sequence=[ACCENT],
                labels={k: factors.get(k, k), "focus_quality": "Focus Quality"},
            )
            fig2.update_traces(marker=dict(size=8, opacity=0.8))
            fig2.update_layout(**base_layout(height=260))
            fig2.update_yaxes(range=[0.5, 5.5], dtick=1)
            st.plotly_chart(fig2, use_container_width=True)

        # Meds on vs off
        st.markdown('<div class="section-title">Meds days vs non-meds days</div>', unsafe_allow_html=True)
        meds_comp = view.groupby("meds_taken")[["focus_quality", "mood_eod", "afternoon_energy"]].mean()
        meds_comp.index = ["No meds", "Meds taken"]

        fig3 = go.Figure()
        metrics_comp = {"focus_quality": "Focus", "mood_eod": "Mood", "afternoon_energy": "Afternoon Energy"}
        colors_comp = [ACCENT, SUCCESS, "#f59e0b"]
        for (col, label), color in zip(metrics_comp.items(), colors_comp):
            if col in meds_comp.columns:
                fig3.add_trace(go.Bar(
                    name=label,
                    x=meds_comp.index,
                    y=meds_comp[col],
                    marker_color=color,
                ))
        fig3.update_layout(**base_layout(height=240), barmode="group")
        fig3.update_yaxes(range=[0, 5.5])
        st.plotly_chart(fig3, use_container_width=True)

        # Exercise on vs off
        st.markdown('<div class="section-title">Exercise days vs rest days</div>', unsafe_allow_html=True)
        ex_comp = view.groupby("exercise")[["focus_quality", "mood_eod", "morning_energy"]].mean()
        ex_comp.index = ["No exercise", "Exercised"]

        fig4 = go.Figure()
        for (col, label), color in zip(metrics_comp.items(), colors_comp):
            if col in ex_comp.columns:
                fig4.add_trace(go.Bar(
                    name=label,
                    x=ex_comp.index,
                    y=ex_comp[col],
                    marker_color=color,
                ))
        fig4.update_layout(**base_layout(height=240), barmode="group")
        fig4.update_yaxes(range=[0, 5.5])
        st.plotly_chart(fig4, use_container_width=True)

# ═══════════════════════════════════════════════════════
# TAB 3 — WIN LOG
# ═══════════════════════════════════════════════════════

with tab_wins:
    wins = view[view["win_of_day"].str.strip() != ""][["date", "win_of_day"]].copy()
    wins = wins.sort_values("date", ascending=False)

    if wins.empty:
        st.markdown("""
        <div class="no-data">
            <h4>No wins logged yet in this range</h4>
            <p>Fill in "Win of the Day" in your evening check-in.</p>
        </div>
        """, unsafe_allow_html=True)
    else:
        st.markdown(f'<div class="section-title">{len(wins)} wins logged</div>', unsafe_allow_html=True)

        # Random win surfacer for low-motivation moments
        if st.button("Surprise me with a past win", use_container_width=False):
            random_win = wins.sample(1).iloc[0]
            st.success(f"**{random_win['date'].strftime('%b %d')}** — {random_win['win_of_day']}")

        st.markdown("<br>", unsafe_allow_html=True)

        for _, row in wins.iterrows():
            st.markdown(f"""
            <div class="win-card">
              <div class="win-date">{row['date'].strftime('%A, %b %d')}</div>
              {row['win_of_day']}
            </div>
            """, unsafe_allow_html=True)

# ═══════════════════════════════════════════════════════
# TAB 4 — AI REPORT
# ═══════════════════════════════════════════════════════

with tab_ai:
    st.markdown('<div class="section-title">AI Pattern Report</div>', unsafe_allow_html=True)
    st.caption(f"Based on your last {len(view)} days of data")

    if len(view) < 5:
        st.info("Need at least 5 days of data to generate a report.")
    else:
        if st.button("Generate report", type="primary", use_container_width=False):
            with st.spinner("Analyzing your patterns..."):
                try:
                    # Build a compact data summary for Claude
                    summary_rows = []
                    for _, r in view.iterrows():
                        row_str = (
                            f"{r['date'].strftime('%Y-%m-%d')}: "
                            f"sleep={r.get('sleep_hours', '?')}h (quality={r.get('sleep_quality', '?')}/5), "
                            f"morning_energy={r.get('morning_energy', '?')}/5, "
                            f"meds={'yes' if r.get('meds_taken') else 'no'}, "
                            f"exercise={'yes' if r.get('exercise') else 'no'}"
                            + (f" ({r.get('exercise_minutes', 0):.0f}min)" if r.get('exercise') else "") + ", "
                            f"caffeine={r.get('caffeine_cups', '?')} cups, "
                            f"afternoon_energy={r.get('afternoon_energy', '?')}/5, "
                            f"mood={r.get('mood_eod', '?')}/5, "
                            f"focus={r.get('focus_quality', '?')}/5"
                        )
                        summary_rows.append(row_str)

                    data_block = "\n".join(summary_rows)

                    client = Anthropic(api_key=st.secrets["ANTHROPIC_API_KEY"])
                    response = client.messages.create(
                        model="claude-haiku-4-5-20251001",
                        max_tokens=600,
                        messages=[{
                            "role": "user",
                            "content": f"""You are analyzing daily ADHD self-tracking data.
Here is the data for the past {len(view)} days (all numeric scales are 1–5):

{data_block}

Give 3 concise, specific, actionable observations. Focus on:
- What conditions correlate with the user's best focus days
- Any patterns in energy, sleep, or habits worth highlighting
- One thing the user could try or change based on the data

Be direct and specific. Use actual numbers from the data. No fluff."""
                        }],
                    )

                    report = response.content[0].text
                    st.markdown(f'<div class="insight-box">{report}</div>', unsafe_allow_html=True)

                except Exception as e:
                    st.error(f"Could not generate report: {e}")

        st.markdown("<br>", unsafe_allow_html=True)

        # Raw data expander
        with st.expander("View raw data"):
            display_cols = ["date", "sleep_hours", "sleep_quality", "morning_energy",
                            "meds_taken", "exercise", "caffeine_cups",
                            "afternoon_energy", "mood_eod", "focus_quality"]
            st.dataframe(
                view[display_cols].sort_values("date", ascending=False),
                use_container_width=True,
                hide_index=True,
            )

# ═══════════════════════════════════════════════════════
# TAB 5 — TIME AUDIT
# ═══════════════════════════════════════════════════════

with tab_time:
    ta = fetch_time_audit(days_back=days_map[window])

    if ta.empty:
        if not st.secrets.get("NOTION_TIME_AUDIT_DB_ID", ""):
            st.markdown("""
            <div class="no-data">
                <h4>Time Audit not set up</h4>
                <p>Add <code>NOTION_TIME_AUDIT_DB_ID</code> to your Streamlit secrets,<br>
                then create a Time Audit database in Notion.<br>
                See SETUP.md for the schema.</p>
            </div>
            """, unsafe_allow_html=True)
        else:
            st.markdown("""
            <div class="no-data">
                <h4>No time audit entries yet</h4>
                <p>Use <code>/time</code> in the Drift Telegram bot to log your first entry.</p>
            </div>
            """, unsafe_allow_html=True)
    else:
        ta = ta[ta["date"] >= cutoff].copy()
        ta = ta.dropna(subset=["planned_minutes", "actual_minutes"])

        if ta.empty:
            st.info("No time audit entries in this range.")
        else:
            # KPI row
            total_planned = ta["planned_minutes"].sum()
            total_actual  = ta["actual_minutes"].sum()
            ratio         = total_actual / total_planned if total_planned else 1
            avg_prod      = ta["productivity"].dropna().mean()
            entries       = len(ta)

            c1, c2, c3, c4 = st.columns(4)
            with c1:
                st.markdown(f"""<div class="metric-card">
                  <div class="metric-val">{int(total_actual / 60)}h {int(total_actual % 60)}m</div>
                  <div class="metric-label">Actual time logged</div></div>""", unsafe_allow_html=True)
            with c2:
                color = SUCCESS if ratio <= 1.1 else "#f87171"
                label = "on track" if ratio <= 1.1 else "over estimate"
                st.markdown(f"""<div class="metric-card">
                  <div class="metric-val" style="color:{color}">{ratio:.1f}×</div>
                  <div class="metric-label">Actual / planned ({label})</div></div>""", unsafe_allow_html=True)
            with c3:
                st.markdown(f"""<div class="metric-card">
                  <div class="metric-val">{entries}</div>
                  <div class="metric-label">Tasks logged</div></div>""", unsafe_allow_html=True)
            with c4:
                prod_str = f"{avg_prod:.1f}/5" if not pd.isna(avg_prod) else "—"
                st.markdown(f"""<div class="metric-card">
                  <div class="metric-val">{prod_str}</div>
                  <div class="metric-label">Avg productivity</div></div>""", unsafe_allow_html=True)

            st.markdown("<br>", unsafe_allow_html=True)

            # Planned vs actual by week
            st.markdown('<div class="section-title">Planned vs actual by week</div>', unsafe_allow_html=True)
            ta["week"] = ta["date"].dt.to_period("W").apply(lambda p: p.start_time)
            weekly = ta.groupby("week")[["planned_minutes", "actual_minutes"]].sum().reset_index()
            weekly["planned_h"] = weekly["planned_minutes"] / 60
            weekly["actual_h"]  = weekly["actual_minutes"]  / 60

            fig = go.Figure()
            fig.add_trace(go.Bar(x=weekly["week"], y=weekly["planned_h"], name="Planned", marker_color=BORDER))
            fig.add_trace(go.Bar(x=weekly["week"], y=weekly["actual_h"],  name="Actual",  marker_color=ACCENT))
            fig.update_layout(**base_layout(height=240), barmode="group")
            fig.update_yaxes(title_text="hours")
            st.plotly_chart(fig, use_container_width=True)

            # Estimation accuracy over time
            st.markdown('<div class="section-title">Estimation accuracy per task</div>', unsafe_allow_html=True)
            ta["over_under"] = ta["actual_minutes"] - ta["planned_minutes"]
            colors_oa = [SUCCESS if v <= 0 else "#f87171" for v in ta["over_under"]]
            fig2 = go.Figure(go.Bar(
                x=ta["date"].dt.strftime("%b %d") + " · " + ta["task"].str[:20],
                y=ta["over_under"],
                marker_color=colors_oa,
                text=[f'{int(v):+d}m' for v in ta["over_under"]],
                textposition="outside",
            ))
            fig2.update_layout(**base_layout("Over(+) / Under(−) estimate in minutes", height=280))
            fig2.update_xaxes(tickangle=-35)
            st.plotly_chart(fig2, use_container_width=True)

            # Top tasks by actual time
            st.markdown('<div class="section-title">Where your time actually went</div>', unsafe_allow_html=True)
            by_task = ta.groupby("task")["actual_minutes"].sum().sort_values(ascending=True).tail(10)
            fig3 = go.Figure(go.Bar(
                y=by_task.index,
                x=by_task.values / 60,
                orientation="h",
                marker_color=ACCENT,
            ))
            fig3.update_layout(**base_layout(height=max(200, len(by_task) * 30)))
            fig3.update_xaxes(title_text="hours")
            st.plotly_chart(fig3, use_container_width=True)

            # Raw log
            with st.expander("View raw entries"):
                st.dataframe(
                    ta[["date", "task", "planned_minutes", "actual_minutes", "productivity"]]
                      .sort_values("date", ascending=False),
                    use_container_width=True,
                    hide_index=True,
                )
