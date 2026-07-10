/** Default hub for v1 demos: Chicago O'Hare (KORD). */
export const DEFAULT_HUB = {
  name: "Chicago O'Hare (KORD)",
  latitude: 41.9742,
  longitude: -87.9073,
  /** Radius in meters around the hub (~80 km). */
  radiusMeters: 80_000,
} as const;

export const URLS = {
  feed: "https://data-cloud.flightradar24.com/zones/fcgi/feed.js",
  details: "https://data-live.flightradar24.com/clickhandler/",
  search: "https://www.flightradar24.com/v1/search/web/find",
  zones: "https://www.flightradar24.com/js/zones.js.php",
} as const;

/** Browser-like headers mirrored from FlightRadarAPI core.js. */
export const FR24_HEADERS: Record<string, string> = {
  accept: "application/json, text/javascript, */*; q=0.01",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "max-age=0",
  origin: "https://www.flightradar24.com",
  referer: "https://www.flightradar24.com/",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-site",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

/** Default Real-Time Tracker query flags (subset of FlightTrackerConfig). */
export const DEFAULT_TRACKER_PARAMS: Record<string, string> = {
  faa: "1",
  satellite: "1",
  mlat: "1",
  flarm: "1",
  adsb: "1",
  gnd: "1",
  air: "1",
  vehicles: "0",
  estimated: "1",
  maxage: "14400",
  gliders: "0",
  stats: "0",
  // Keep moderate — Android custom map markers get expensive past ~80–100.
  limit: "100",
};

/**
 * Static major zones (subset) for offline / fallback bounds.
 * Full dynamic list is available via `getZones()` when network allows.
 */
export const STATIC_ZONES: Record<
  string,
  { tl_y: number; tl_x: number; br_y: number; br_x: number }
> = {
  europe: { tl_y: 72.57, tl_x: -16.96, br_y: 33.57, br_x: 53.05 },
  northamerica: { tl_y: 75, tl_x: -180, br_y: 3, br_x: -52 },
  southamerica: { tl_y: 16, tl_x: -96, br_y: -59, br_x: -25 },
  asia: { tl_y: 75, tl_x: 25, br_y: -12, br_x: 180 },
  oceania: { tl_y: 10, tl_x: 90, br_y: -55, br_x: 180 },
  africa: { tl_y: 39, tl_x: -30, br_y: -40, br_x: 60 },
};
