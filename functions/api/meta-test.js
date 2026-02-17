function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function onRequestGet({ env }) {
  const token = env.META_ACCESS_TOKEN;
  const id = env.META_AD_ACCOUNT_ID;

  if (!token) return json({ ok: false, error: "Missing META_ACCESS_TOKEN" }, 500);
  if (!id) return json({ ok: false, error: "Missing META_AD_ACCOUNT_ID" }, 500);

  const accountId = id.startsWith("act_") ? id : `act_${id}`;
  const url =
    `https://graph.facebook.com/v20.0/${accountId}/campaigns` +
    `?fields=id,name` +
    `&limit=50` +
    `&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) return json({ ok: false, status: res.status, meta: data }, res.status);
  return json({ ok: true, accountId, campaigns: data.data || [] });
}
