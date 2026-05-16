// Cloudflare Worker entry point.
//
// Serves the static app through the ASSETS binding and handles the
// /api/sync endpoint by reusing the shared sync logic. This lets the
// project run as a Cloudflare Worker (workers.dev) as well as a
// Cloudflare Pages project.

import { onRequestGet, onRequestPost, onRequestOptions } from './functions/api/sync.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/sync') {
      const ctx = { request, env };
      if (request.method === 'GET') return onRequestGet(ctx);
      if (request.method === 'POST') return onRequestPost(ctx);
      if (request.method === 'OPTIONS') return onRequestOptions(ctx);
      return new Response(JSON.stringify({ error: 'method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // everything else is a static file
    return env.ASSETS.fetch(request);
  }
};
