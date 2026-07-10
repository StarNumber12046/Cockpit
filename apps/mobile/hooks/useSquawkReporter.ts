import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { fr24, type Fr24Flight } from "@cockpit/fr24";
import { isEmergencySquawk, parseFlightStartedAtMs } from "@cockpit/shared";
import { api } from "../lib/convex";

/**
 * Persist verified emergency squawks to Convex.
 * Fetches FR24 detail once per aircraft to obtain departure time for verification.
 */
export function useSquawkReporter(flights: Fr24Flight[], enabled = true) {
  const reportSquawks = useMutation(api.alerts.reportSquawks);
  const inFlight = useRef(new Set<string>());
  const reported = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;

    const emergencies = flights.filter(
      (f) => isEmergencySquawk(f.squawk) && !f.onGround,
    );
    if (emergencies.length === 0) return;

    let cancelled = false;

    void (async () => {
      const reports: Array<{
        fr24Id: string;
        icao24: string;
        squawk: string;
        callsign?: string;
        flightNumber?: string;
        positionTime: number;
        onGround: boolean;
        flightStartedAt: number;
      }> = [];

      for (const flight of emergencies) {
        const key = `${flight.fr24Id}:${flight.squawk}`;
        if (reported.current.has(key) || inFlight.current.has(key)) continue;
        inFlight.current.add(key);

        try {
          let flightStartedAt: number | undefined;
          try {
            const detail = await fr24.getFlightDetails(flight.fr24Id);
            flightStartedAt = parseFlightStartedAtMs(detail);
          } catch {
            continue;
          }

          if (flightStartedAt == null) continue;

          const positionTimeMs =
            flight.time < 1e12 ? flight.time * 1000 : flight.time;
          if (positionTimeMs < flightStartedAt) continue;

          reports.push({
            fr24Id: flight.fr24Id,
            icao24: flight.icao24,
            squawk: flight.squawk,
            callsign: flight.callsign || undefined,
            flightNumber: flight.flightNumber || undefined,
            positionTime: flight.time,
            onGround: flight.onGround,
            flightStartedAt,
          });
          reported.current.add(key);
        } finally {
          inFlight.current.delete(key);
        }
      }

      if (cancelled || reports.length === 0) return;

      try {
        await reportSquawks({ reports });
      } catch {
        for (const report of reports) {
          reported.current.delete(`${report.fr24Id}:${report.squawk}`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, flights, reportSquawks]);
}