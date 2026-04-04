// Returns the most recent non-empty "Where I Left Off" entry
// Called by the PWA morning flow to surface yesterday's context

const NOTION_TOKEN   = process.env.NOTION_TOKEN;
const NOTION_DB_ID   = process.env.NOTION_DB_ID;
const NOTION_VERSION = '2022-06-28';

const notionHeaders = {
  'Authorization': `Bearer ${NOTION_TOKEN}`,
  'Content-Type': 'application/json',
  'Notion-Version': NOTION_VERSION,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Fetch last 7 days, sorted newest first
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    const response = await fetch(`https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`, {
      method: 'POST',
      headers: notionHeaders,
      body: JSON.stringify({
        filter: {
          property: 'Date',
          date: { on_or_after: cutoff.toISOString().split('T')[0] },
        },
        sorts: [{ property: 'Date', direction: 'descending' }],
        page_size: 7,
      }),
    });

    const data = await response.json();

    // Find the most recent entry with non-empty "Where I Left Off"
    for (const page of data.results ?? []) {
      const items = page.properties?.['Where I Left Off']?.rich_text ?? [];
      const text = items[0]?.plain_text?.trim();
      if (text) {
        const date = page.properties?.Date?.date?.start;
        return res.status(200).json({ text, date });
      }
    }

    res.status(200).json({ text: null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
