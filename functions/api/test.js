export async function onRequestGet() {
  return new Response(JSON.stringify({ ok: true, ts: new Date().toISOString() }, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
