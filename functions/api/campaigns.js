function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function parseDivision(name) {
  const m = String(name || "").match(/\(D(\d+)\)/i);
  return m ? `D${m[1]}` : "Nezařazeno";
}

function normalizeDivision(q) {
  const s = (q || "").trim();
  if (!s || s.toLowerCase() === "all" || s === "Vše") return "Vše";
  if (/^D\d+$/i.test(s)) return s.toUpperCase();
  if (s.toLowerCase() === "nezařazeno") return "Nezařazeno";
  return "Vše";
}

function normalizePeriod(p) {
  const v = String(p || "").toLowerCase().trim();
  if (v === "7" || v === "7d") return { days: 7, date_preset: "last_7d" };
  if (v === "90" || v === "90d") return { days: 90, date_preset: "last_90d" };
  if (v === "180" || v === "180d") return { days: 180, date_preset: "last_180d" };
if (v === "365" || v === "365d" || v === "1y") return { days: 365, date_preset: "last_365d" };
  return { days: 30, date_preset: "last_30d" };
}

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function pickResult(actions) {
  // jednoduchý „results“: preferuj lead/complete_registration/purchase, jinak první akce
  if (!Array.isArray(actions)) return 0;
  const prefer = ["lead", "complete_registration", "purchase", "offsite_conversion", "link_click"];
  for (const k of prefer) {
    const hit = actions.find(a => a && a.action_type === k);
    if (hit) return num(hit.value);
  }
  const first = actions[0];
  return first ? num(first.value) : 0;
}

export async function onRequestGet({ request, env }) {
  const token = env.META_ACCESS_TOKEN;
  const id = env.META_AD_ACCOUNT_ID;

  if (!token) return json({ ok: false, error: "Missing META_ACCESS_TOKEN" }, 500);
  if (!id) return json({ ok: false, error: "Missing META_AD_ACCOUNT_ID" }, 500);

  const urlIn = new URL(request.url);
  const division = normalizeDivision(urlIn.searchParams.get("division"));
  const period = normalizePeriod(urlIn.searchParams.get("period"));
  const limit = Math.min(Math.max(parseInt(urlIn.searchParams.get("limit") || "100", 10), 1), 500);

  const accountId = id.startsWith("act_") ? id : `act_${id}`;

  // Insights: vrací rovnou metriky na úrovni campaign
  const insightsUrl =
    `https://graph.facebook.com/v20.0/${accountId}/insights` +
    `?level=campaign` +
    `&fields=campaign_id,campaign_name,date_start,date_stop,spend,impressions,clicks,reach,ctr,cpc,actions` +
    `&date_preset=${period.date_preset}` +
    `&limit=${limit}` +
    `&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(insightsUrl);
  const data = await res.json();
  if (!res.ok) return json({ ok: false, status: res.status, meta: data }, res.status);

  const rows = (data.data || []).map(r => {
    const name = r.campaign_name || "";
    const div = parseDivision(name);
    const spend = num(r.spend);
    const impressions = parseInt(r.impressions || "0", 10) || 0;
    const clicks = parseInt(r.clicks || "0", 10) || 0;
    const reach = parseInt(r.reach || "0", 10) || 0;

    // Meta někdy vrací ctr/cpc jako string; když chybí, dopočítáme
    let ctr = num(r.ctr);
    if (!ctr && impressions) ctr = (clicks / impressions) * 100;

    let cpc = num(r.cpc);
    if (!cpc && clicks) cpc = spend / clicks;

    const actions = Array.isArray(r.actions) ? r.actions : [];
    const results = pickResult(actions);

    return {
      campaign_id: r.campaign_id,
      campaign_name: name,
      division: div,
      spend,
      impressions,
      clicks,
      reach,
      ctr,
      cpc,
      results,
      actions, // pro debug / pozdější detail
      date_start: r.date_start || null,
date_stop:  r.date_stop  || null,
    };
  });

  const filtered = division === "Vše" ? rows : rows.filter(r => r.division === division);

  // Souhrn pro KPI
  const sum = filtered.reduce(
    (a, r) => {
      a.spend += r.spend;
      a.impressions += r.impressions;
      a.clicks += r.clicks;
      a.reach += r.reach;
      a.results += r.results;
      return a;
    },
    { spend: 0, impressions: 0, clicks: 0, reach: 0, results: 0 }
  );
  const aggCtr = sum.impressions ? (sum.clicks / sum.impressions) * 100 : 0;
  const aggCpc = sum.clicks ? sum.spend / sum.clicks : 0;

  return json({
    ok: true,
    accountId,
    period,
    division,
    kpi: { ...sum, ctr: aggCtr, cpc: aggCpc },
    campaigns: filtered.sort((a, b) => b.spend - a.spend),
    paging: data.paging || null,
  });
}
