import { useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import type { Fr24Flight } from "@cockpit/fr24";

type Sample = {
  lat: number;
  lon: number;
  hdg: number;
};

type Anim = {
  from: Sample;
  to: Sample;
  start: number;
  duration: number;
};

/** Ease-out so motion settles instead of stopping hard. */
function easeOutQuad(t: number): number {
  return t * (2 - t);
}

/** Shortest-path heading blend (degrees). */
function lerpHeading(a: number, b: number, t: number): number {
  const d = ((b - a + 540) % 360) - 180;
  return (((a + d * t) % 360) + 360) % 360;
}

/**
 * How often to push smoothed positions into React.
 * Android Map Markers pay a heavy native cost per coordinate update — keep
 * this lower than iOS to avoid heap pressure / AIRMapMarker OOM crashes.
 */
const PAINT_MS = Platform.OS === "android" ? 150 : 66;

function isFiniteSample(lat: number, lon: number, hdg: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(hdg);
}

/**
 * Interpolate flight lat/lon/heading between FR24 poll snaps so markers and
 * badge overlays glide instead of teleporting every ~15s.
 */
export function useSmoothedFlights(
  flights: Fr24Flight[],
  /** How long a poll-to-poll jump is stretched (ms). */
  durationMs = 2800,
): Fr24Flight[] {
  const displayRef = useRef<Map<string, Sample>>(new Map());
  const animRef = useRef<Map<string, Anim>>(new Map());
  const targetsRef = useRef(flights);
  targetsRef.current = flights;

  const [frame, setFrame] = useState(0);

  // When the feed updates, start lerps from wherever the glyph is now.
  useEffect(() => {
    const now = Date.now();
    const live = new Set<string>();

    for (const f of flights) {
      if (!isFiniteSample(f.latitude, f.longitude, f.heading)) continue;
      live.add(f.fr24Id);
      const current = displayRef.current.get(f.fr24Id);
      if (!current) {
        displayRef.current.set(f.fr24Id, {
          lat: f.latitude,
          lon: f.longitude,
          hdg: f.heading,
        });
        continue;
      }

      const moved =
        Math.abs(current.lat - f.latitude) > 1e-7 ||
        Math.abs(current.lon - f.longitude) > 1e-7 ||
        Math.abs(current.hdg - f.heading) > 0.5;

      if (!moved) continue;

      animRef.current.set(f.fr24Id, {
        from: { ...current },
        to: {
          lat: f.latitude,
          lon: f.longitude,
          hdg: f.heading,
        },
        start: now,
        duration: durationMs,
      });
    }

    for (const id of [...displayRef.current.keys()]) {
      if (!live.has(id)) {
        displayRef.current.delete(id);
        animRef.current.delete(id);
      }
    }
  }, [flights, durationMs]);

  // Drive lerps + light dead-reckoning; paint at PAINT_MS (not every frame).
  useEffect(() => {
    let raf = 0;
    let lastSim = 0;
    let lastEmit = 0;

    const loop = (ts: number) => {
      const now = Date.now();
      const dt = lastSim ? Math.min((ts - lastSim) / 1000, 0.12) : 0;
      lastSim = ts;
      let dirty = false;

      for (const [id, anim] of animRef.current) {
        const t = Math.min(1, (now - anim.start) / anim.duration);
        const e = easeOutQuad(t);
        const lat = anim.from.lat + (anim.to.lat - anim.from.lat) * e;
        const lon = anim.from.lon + (anim.to.lon - anim.from.lon) * e;
        const hdg = lerpHeading(anim.from.hdg, anim.to.hdg, e);
        if (!isFiniteSample(lat, lon, hdg)) {
          animRef.current.delete(id);
          continue;
        }
        displayRef.current.set(id, { lat, lon, hdg });
        dirty = true;
        if (t >= 1) animRef.current.delete(id);
      }

      // Creep airborne traffic between polls so they don't freeze for 15s.
      if (dt > 0) {
        for (const f of targetsRef.current) {
          if (animRef.current.has(f.fr24Id)) continue;
          if (f.onGround || f.groundSpeed < 40) continue;
          const sample = displayRef.current.get(f.fr24Id);
          if (!sample) continue;

          const mps = f.groundSpeed * 0.514444;
          const distM = mps * dt;
          if (distM < 0.08) continue;

          const moved = offsetLatLon(sample.lat, sample.lon, sample.hdg, distM);
          if (!isFiniteSample(moved.lat, moved.lon, sample.hdg)) continue;
          displayRef.current.set(f.fr24Id, {
            lat: moved.lat,
            lon: moved.lon,
            hdg: sample.hdg,
          });
          dirty = true;
        }
      }

      if (dirty && now - lastEmit >= PAINT_MS) {
        lastEmit = now;
        setFrame((n) => n + 1);
      }
      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return useMemo(() => {
    return flights.map((f) => {
      const d = displayRef.current.get(f.fr24Id);
      if (!d || !isFiniteSample(d.lat, d.lon, d.hdg)) return f;
      return {
        ...f,
        latitude: d.lat,
        longitude: d.lon,
        heading: d.hdg,
      };
    });
    // frame bumps when display samples change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flights, frame]);
}

/** Move `distM` meters from lat/lon along heading (degrees). */
function offsetLatLon(
  lat: number,
  lon: number,
  headingDeg: number,
  distM: number,
): { lat: number; lon: number } {
  const R = 6_371_000;
  const d = distM / R;
  const brng = (headingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const sinLat1 = Math.sin(lat1);
  const cosLat1 = Math.cos(lat1);
  const sinD = Math.sin(d);
  const cosD = Math.cos(d);

  const lat2 = Math.asin(sinLat1 * cosD + cosLat1 * sinD * Math.cos(brng));
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * sinD * cosLat1,
      cosD - sinLat1 * Math.sin(lat2),
    );

  return {
    lat: (lat2 * 180) / Math.PI,
    lon: (((lon2 * 180) / Math.PI + 540) % 360) - 180,
  };
}
