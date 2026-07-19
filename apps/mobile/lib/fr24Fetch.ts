import { Fr24Error } from "@cockpit/fr24";
import { debugLog, debugWarn } from "./debug";
import { fr24UrlViaEdgeProxy, usesFr24EdgeProxy } from "./fr24Proxy";

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function headersForLog(init?: RequestInit): Record<string, string> {
  const out: Record<string, string> = {};
  const headers = init?.headers;
  if (!headers) return out;

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }

  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      out[key] = value;
    }
    return out;
  }

  for (const [key, value] of Object.entries(headers)) {
    if (value != null) out[key] = String(value);
  }
  return out;
}

function queryForLog(url: string): Record<string, string> {
  try {
    const params = new URL(url).searchParams;
    const out: Record<string, string> = {};
    for (const key of ["bounds", "limit", "maxage", "airline"]) {
      const value = params.get(key);
      if (value) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function summarizeFr24Body(text: string): Record<string, unknown> {
  const summary: Record<string, unknown> = { bytes: text.length };

  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const flightKeys = Object.keys(json).filter((k) => /^\d/.test(k));
    summary.full_count = json.full_count;
    summary.version = json.version;
    summary.flightKeys = flightKeys.length;
    if (flightKeys.length > 0) {
      summary.sampleIds = flightKeys.slice(0, 3);
    }
  } catch {
    summary.parseError = true;
  }

  // Log full body for small responses; truncate large feed payloads.
  summary.body =
    text.length <= 2048 ? text : `${text.slice(0, 600)}…(+${text.length - 600} bytes)`;

  return summary;
}

function isSoftBlockedFeed(text: string): boolean {
  if (text.length > 256) return false;
  if (!text.includes("full_count")) return false;
  return !/"\d[a-f0-9]{6,}"/i.test(text);
}

/** Instrumented fetch for FR24 — logs request/response details in dev. */
export const fr24Fetch: typeof fetch = async (input, init) => {
  const url = resolveUrl(input);
  const started = Date.now();
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "unknown";
    }
  })();

  const reqHeaders = headersForLog(init);
  const reqQuery = queryForLog(url);

  const proxiedUrl = fr24UrlViaEdgeProxy(url);
  const viaProxy = proxiedUrl !== url;

  debugLog("fr24-http", `→ ${init?.method ?? "GET"} ${host}`, {
    path: url.split("?")[0]?.split(host)[1] ?? url,
    query: reqQuery,
    headers: viaProxy ? "(edge proxy)" : reqHeaders,
    viaProxy,
    edgeProxyConfigured: usesFr24EdgeProxy(),
  });

  // Worker adds browser headers server-side.
  const response = await fetch(
    proxiedUrl,
    viaProxy ? { method: init?.method ?? "GET", signal: init?.signal } : init,
  );
  const ms = Date.now() - started;

  const resHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    resHeaders[key] = value;
  });

  const clone = response.clone();
  const text = await clone.text();
  const body = summarizeFr24Body(text);

  if (response.status >= 400) {
    debugWarn("fr24-http", `← ${response.status} ${host} (${ms}ms)`, {
      query: reqQuery,
      responseHeaders: resHeaders,
      ...body,
    });
    return response;
  }

  if (isSoftBlockedFeed(text)) {
    debugWarn("fr24-http", `← ${response.status} soft-block ${host} (${ms}ms)`, {
      query: reqQuery,
      requestHeaders: reqHeaders,
      responseHeaders: resHeaders,
      ...body,
    });
    if (url.includes("/feed.js")) {
      throw new Fr24Error(
        "FR24 soft-blocked this native client (TLS/fingerprint)",
        "blocked",
      );
    }
  } else {
    debugLog("fr24-http", `← ${response.status} ${host} (${ms}ms)`, {
      query: reqQuery,
      responseHeaders: resHeaders,
      ...body,
    });
  }

  return response;
};