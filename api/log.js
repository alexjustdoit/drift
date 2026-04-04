// Vercel serverless function — proxies Notion writes, keeps token server-side
// Deployed automatically by Vercel from the /api directory

const NOTION_TOKEN   = process.env.NOTION_TOKEN;
const NOTION_DB_ID   = process.env.NOTION_DB_ID;
const NOTION_VERSION = '2022-06-28';

const notionHeaders = {
  'Authorization': `Bearer ${NOTION_TOKEN}`,
  'Content-Type': 'application/json',
  'Notion-Version': NOTION_VERSION,
};

// Query for today's existing page
async function findTodayPage(dateStr) {
  const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {
    method: 'POST',
    headers: notionHeaders,
    body: JSON.stringify({
      filter: {
        property: 'Date',
        date: { equals: dateStr },
      },
    }),
  });
  const data = await res.json();
  return data.results?.[0] ?? null;
}

// Build Notion properties object from incoming body
// Only include fields that are present (supports partial morning / evening updates)
function buildProperties(body) {
  const props = {};

  if (body.date !== undefined)
    props['Date'] = { date: { start: body.date } };

  if (body.sleepHours !== undefined)
    props['Sleep Hours'] = { number: body.sleepHours };

  if (body.sleepQuality !== undefined)
    props['Sleep Quality'] = { number: body.sleepQuality };

  if (body.morningEnergy !== undefined)
    props['Morning Energy'] = { number: body.morningEnergy };

  if (body.medsTaken !== undefined)
    props['Meds Taken'] = { checkbox: body.medsTaken };

  if (body.exercise !== undefined)
    props['Exercise'] = { checkbox: body.exercise };

  if (body.exerciseMinutes !== undefined)
    props['Exercise Minutes'] = { number: body.exerciseMinutes };

  if (body.caffeineCups !== undefined)
    props['Caffeine Cups'] = { number: body.caffeineCups };

  if (body.middayEnergy !== undefined)
    props['Midday Energy'] = { number: body.middayEnergy };

  if (body.middayMood !== undefined)
    props['Midday Mood'] = { number: body.middayMood };

  if (body.workingOn !== undefined)
    props['Working On'] = { rich_text: [{ text: { content: body.workingOn } }] };

  if (body.afternoonEnergy !== undefined)
    props['Afternoon Energy'] = { number: body.afternoonEnergy };

  if (body.moodEOD !== undefined)
    props['Mood EOD'] = { number: body.moodEOD };

  if (body.focusQuality !== undefined)
    props['Focus Quality'] = { number: body.focusQuality };

  if (body.winOfDay !== undefined)
    props['Win of the Day'] = { rich_text: [{ text: { content: body.winOfDay } }] };

  if (body.whereLeftOff !== undefined)
    props['Where I Left Off'] = { rich_text: [{ text: { content: body.whereLeftOff } }] };

  if (body.notes !== undefined)
    props['Notes'] = { rich_text: [{ text: { content: body.notes } }] };

  return props;
}

async function calculateStreak(loggedDate) {
  try {
    const cutoff = new Date(loggedDate);
    cutoff.setDate(cutoff.getDate() - 60);

    const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {
      method: 'POST',
      headers: notionHeaders,
      body: JSON.stringify({
        filter: {
          property: 'Date',
          date: { on_or_after: cutoff.toISOString().split('T')[0] },
        },
        sorts: [{ property: 'Date', direction: 'descending' }],
        page_size: 60,
      }),
    });
    const data = await res.json();

    const dateSet = new Set(
      (data.results ?? []).map(p => p.properties?.Date?.date?.start).filter(Boolean)
    );

    let streak = 0;
    const check = new Date(loggedDate + 'T12:00:00Z');
    while (dateSet.has(check.toISOString().split('T')[0])) {
      streak++;
      check.setDate(check.getDate() - 1);
    }
    return streak;
  } catch {
    return 0;
  }
}

export default async function handler(req, res) {
  // CORS — allow GitHub Pages origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body;
    if (!body?.date) return res.status(400).json({ error: 'date required' });

    const properties = buildProperties(body);
    const existing = await findTodayPage(body.date);

    if (existing) {
      // Patch existing page
      await fetch(`https://api.notion.com/v1/pages/${existing.id}`, {
        method: 'PATCH',
        headers: notionHeaders,
        body: JSON.stringify({ properties }),
      });
    } else {
      // Create new page
      await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: notionHeaders,
        body: JSON.stringify({
          parent: { database_id: NOTION_DB_ID },
          properties: {
            Name: { title: [{ text: { content: body.date } }] },
            ...properties,
          },
        }),
      });
    }

    const streak = await calculateStreak(body.date);
    res.status(200).json({ ok: true, streak });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
