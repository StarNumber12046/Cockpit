/**
 * Optional Cloudflare Worker — faster FR24 proxy than Convex (edge + 10s cache).
 * Deploy: npx wrangler deploy scripts/fr24-edge-worker.js --name cockpit-fr24
 * App env: EXPO_PUBLIC_FR24_PROXY_URL=https://cockpit-fr24.<your>.workers.dev
 */
const FR24_HEADERS = {
  accept: "application/json, text/javascript, */*; q=0.01",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "max-age=0",
  origin: "https://www.flightradar24.com",
  referer: "https://www.flightradar24.com/",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

const ALLOWED_HOSTS = new Set([
  "data-cloud.flightradar24.com",
  "data-live.flightradar24.com",
  "www.flightradar24.com",
]);

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const target = incoming.searchParams.get("url");
    if (!target) {
      return new Response("Missing url query param", { status: 400 });
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return new Response("Invalid url", { status: 400 });
    }

    if (!ALLOWED_HOSTS.has(targetUrl.hostname)) {
      return new Response("Host not allowed", { status: 403 });
    }

    const upstream = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: FR24_HEADERS,
      cf: { cacheTtl: 10, cacheEverything: true },
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=10",
      },
    });
  },
};