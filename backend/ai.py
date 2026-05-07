"""Claude API calls for Drift."""

import json
import os
import anthropic

_client = anthropic.Anthropic(api_key=os.environ['ANTHROPIC_API_KEY'])
_MODEL  = 'claude-haiku-4-5-20251001'


def breakdown_task(task: str) -> list[str]:
    msg = _client.messages.create(
        model=_MODEL,
        max_tokens=1024,
        messages=[{
            'role': 'user',
            'content': (
                'Break this task into 5–8 concrete micro-steps. '
                'Each step must be completable in under 5 minutes — small enough that starting feels effortless. '
                'Return ONLY a JSON array of strings, no other text.\n\n'
                f'Task: {task}'
            ),
        }],
    )
    return json.loads(msg.content[0].text)


def generate_report(logs: list[dict]) -> str:
    if not logs:
        return 'Not enough data yet — keep logging and check back after a few days.'

    recent = logs[-30:]
    msg = _client.messages.create(
        model=_MODEL,
        max_tokens=1024,
        messages=[{
            'role': 'user',
            'content': (
                'Analyze this ADHD daily log data. Give 2–3 specific, actionable observations. '
                'Focus on correlations (e.g. "your best focus days follow 7+ hrs sleep + morning exercise"). '
                'Reference actual numbers. Be direct. No fluff.\n\n'
                f'Data (last {len(recent)} days):\n{json.dumps(recent, default=str)}'
            ),
        }],
    )
    return msg.content[0].text


def surface_captures(captures: list[dict]) -> str:
    if not captures:
        return 'No captures yet.'

    texts = [c['text'] for c in captures]
    msg = _client.messages.create(
        model=_MODEL,
        max_tokens=512,
        messages=[{
            'role': 'user',
            'content': (
                'These are brain dump notes captured over time. '
                'Identify 2–3 themes or recurring concerns worth paying attention to. '
                'Be specific and concise.\n\n'
                + '\n'.join(f'- {t}' for t in texts)
            ),
        }],
    )
    return msg.content[0].text
