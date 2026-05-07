# Drift Backlog

Features considered and deliberately deferred. Revisit after v2 is in regular use.

## Queued

- **Body double mode** (`/focus`) — Declare what you're working on and for how long; bot checks in at the end with a prompt to reflect. Mimics having someone in the room. Could write focus sessions to Notion for pattern analysis.
- **Task breakdown** (`/breakdown`) — Paste a daunting task; AI splits it into micro-steps. Goblin Tools style. Reduces task paralysis at the moment of initiation.
- **Brain dump / working memory** (`/capture`) — Quick free-text capture to a separate Notion DB (no structure required). AI periodically resurfaces items ("you mentioned X three times this week"). Externalizes the things that loop in your head.

## Deferred

- **Custom fields** — Let the user add their own tracking properties to the daily log. Probably overkill for personal use; the current schema covers what matters.
- **Monthly / quarterly retrospectives** — AI report already does this on demand with the "All time" range selector. Not worth automating separately.
- **CSV export** — Notion's built-in export handles this. No need to build it.
- **Multiple users** — Personal app, not a product.
- **iOS push notifications** — Web Push API is complex to implement and maintain. Telegram bot covers the nudge use case.
- **Adaptive check-in** — Skipping fields the user always rates the same, etc. Over-engineered for current scale.
