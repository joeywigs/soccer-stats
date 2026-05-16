// Cloudflare Pages Function — handles /api/sync
//
// Stores one JSON snapshot per "sync code" in a KV namespace bound as SOCCER_KV.
// The sync code is the shared secret: the KV key is a SHA-256 hash of it, and
// any request must present the code in the X-Sync-Code header.
//
//   GET  /api/sync   -> returns the stored snapshot, or the literal `null`
//   POST /api/sync   -> stores the JSON body as the snapshot

const KEY_PREFIX = 'soccer-stats:v1:';
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB safety cap

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Code'
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

function codeFrom(request) {
  return (request.headers.get('X-Sync-Code') || '').trim().toLowerCase();
}

async function keyFor(code) {
  const bytes = new TextEncoder().encode(KEY_PREFIX + code);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet(context) {
  const code = codeFrom(context.request);
  if (code.length < 6) return json({ error: 'missing or too-short sync code' }, 400);
  const stored = await context.env.SOCCER_KV.get(await keyFor(code));
  return new Response(stored || 'null', {
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

export async function onRequestPost(context) {
  const code = codeFrom(context.request);
  if (code.length < 6) return json({ error: 'missing or too-short sync code' }, 400);

  const body = await context.request.text();
  if (body.length > MAX_BYTES) return json({ error: 'snapshot too large' }, 413);

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (e) {
    return json({ error: 'body is not valid JSON' }, 400);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return json({ error: 'snapshot must be a JSON object' }, 400);
  }

  await context.env.SOCCER_KV.put(await keyFor(code), body);
  return json({ ok: true, savedAt: Date.now() });
}
