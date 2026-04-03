export default {
  async fetch(request) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (url.pathname === "/coming-soon") {
      try {
        const res = await fetch("https://littlesleepies.com/pages/coming-soon", {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          },
        });
        if (!res.ok) return new Response(JSON.stringify({ error: `Upstream ${res.status}` }), { status: 502, headers: corsHeaders });
        const html = await res.text();
        const intel = parseDropIntel(html);
        return new Response(JSON.stringify(intel), { headers: { ...corsHeaders, "Cache-Control": "no-store" } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
      }
    }

    if (url.pathname === "/proxy") {
      const target = url.searchParams.get("url");
      if (!target || !target.startsWith("https://littlesleepies.com/")) {
        return new Response(JSON.stringify({ error: "Invalid target" }), { status: 400, headers: corsHeaders });
      }
      try {
        const res = await fetch(target, { headers: { "User-Agent": "Mozilla/5.0" } });
        const body = await res.text();
        return new Response(body, {
          headers: { ...corsHeaders, "Content-Type": res.headers.get("Content-Type") || "application/json", "Cache-Control": "no-store" },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
      }
    }

    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: corsHeaders });
  },
};

function parseDropIntel(html) {
  const intel = { scraped_at: new Date().toISOString(), drops: [] };

  const datePattern = /launches?\s+\w+\s+(\d{1,2}\/\d{1,2})(?:\/(\d{2,4}))?\s+at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*(PT|ET|PST|EST)/gi;
  const dateMatches = [...html.matchAll(datePattern)];

  const itemPattern = /###\s+([^\n]+)\n+####\s+([^\n]+)\n+\$[\d.]+/g;
  const rawItems = [...html.matchAll(itemPattern)];

  const seen = new Set();
  const items = [];
  rawItems.forEach(m => {
    const full = `${m[1].trim()} ${m[2].trim()}`;
    if (!seen.has(full)) { seen.add(full); items.push({ name: m[1].trim(), type: m[2].trim(), full }); }
  });

  let collectionName = "Upcoming Drop";
  const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
  if (ogTitle) collectionName = ogTitle[1].replace(/–.*/, '').trim();

  let dropDate = null, dropHour = 9, dropMin = 0, dropTimezone = "PT", dropTimeLocal = "9am";

  if (dateMatches.length) {
    const m = dateMatches[0];
    const [month, day] = m[1].split('/').map(Number);
    const year = m[2] ? (m[2].length === 2 ? `20${m[2]}` : m[2]) : new Date().getFullYear().toString();
    dropDate = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    dropTimeLocal = m[3].trim();
    dropTimezone = m[4].replace('PST','PT').replace('EST','ET');
    const tMatch = dropTimeLocal.match(/(\d+)(?::(\d+))?\s*(am|pm)/i);
    if (tMatch) {
      dropHour = parseInt(tMatch[1]);
      dropMin = parseInt(tMatch[2] || '0');
      if (tMatch[3].toLowerCase() === 'pm' && dropHour !== 12) dropHour += 12;
      if (tMatch[3].toLowerCase() === 'am' && dropHour === 12) dropHour = 0;
    }
  }

  const HIGH_VALUE_KEYWORDS = ['blanket', 'zippy', 'two-piece', 'lovey', 'shorty zippy'];
  const snipe_targets = items
    .filter(i => HIGH_VALUE_KEYWORDS.some(k => i.full.toLowerCase().includes(k)))
    .map(i => ({
      keyword: i.full.toLowerCase(),
      priority: i.full.toLowerCase().includes('blanket') ? 'HIGH' : i.full.toLowerCase().includes('lovey') ? 'MEDIUM' : 'NORMAL',
    }));

  intel.drops.push({ name: collectionName, date: dropDate, time_local: dropTimeLocal, timezone: dropTimezone, drop_hour: dropHour, drop_min: dropMin, items, snipe_targets, raw_item_count: items.length });
  return intel;
}
