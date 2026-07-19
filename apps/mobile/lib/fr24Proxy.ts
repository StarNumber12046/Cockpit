/** Optional edge worker — see scripts/fr24-edge-worker.js */
export const FR24_EDGE_PROXY_URL =
  process.env.EXPO_PUBLIC_FR24_PROXY_URL?.trim() ?? "";

const FR24_HOSTS = [
  "data-cloud.flightradar24.com",
  "data-live.flightradar24.com",
  "www.flightradar24.com",
];

export function fr24UrlViaEdgeProxy(url: string): string {
  if (!FR24_EDGE_PROXY_URL) return url;
  if (!FR24_HOSTS.some((host) => url.includes(host))) return url;
  const base = FR24_EDGE_PROXY_URL.replace(/\/$/, "");
  return `${base}?url=${encodeURIComponent(url)}`;
}

export function usesFr24EdgeProxy(): boolean {
  return Boolean(FR24_EDGE_PROXY_URL);
}