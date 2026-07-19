import { DEFAULT_HUB, getDefaultBounds } from "@cockpit/fr24";

/** Poll interval for Home live list (ms). */
export const FLIGHT_POLL_MS = 15_000;

/** Wait after the last pan/zoom event before updating FR24 feed bounds. */
export const MAP_BOUNDS_SETTLE_MS = 600;

/** Default hub region for v1 (KORD). */
export const HUB = DEFAULT_HUB;

/** Precomputed default bounds string for feed requests. */
export const DEFAULT_BOUNDS = getDefaultBounds();

export const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL ?? "";
