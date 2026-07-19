import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { type Fr24Flight } from "@cockpit/fr24";
import { isEmergencySquawk } from "@cockpit/shared";
import { api } from "../lib/convex";
import { debugLog } from "../lib/debug";

type SquawkObservation = {
  fr24Id: string;
  icao24: string;
  squawk: string;
  callsign?: string;
  flightNumber?: string;
  positionTime: number;
  onGround: boolean;
  missingFromFeed?: boolean;
};

type WatchedFlight = {
  icao24: string;
  callsign?: string;
  flightNumber?: string;
};

function reportKey(fr24Id: string, squawk: string): string {
  return `${fr24Id}:${squawk}`;
}

function forgetFr24Id(set: Set<string>, fr24Id: string): void {
  for (const key of set) {
    if (key.startsWith(`${fr24Id}:`)) {
      set.delete(key);
    }
  }
}

/**
 * Report airborne emergency squawks to Convex and clear them when they end.
 * Server re-verifies both paths against FR24 before creating/removing alerts.
 */
export function useSquawkReporter(flights: Fr24Flight[], enabled = true) {
  const reportSquawks = useMutation(api.alerts.reportSquawks);
  const reportSquawkClearances = useMutation(api.alerts.reportSquawkClearances);
  const reported = useRef(new Set<string>());
  const watching = useRef(new Map<string, WatchedFlight>());
  const cleared = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;

    const emergencies: SquawkObservation[] = [];
    const clearances: SquawkObservation[] = [];

    const seenFr24Ids = new Set(flights.map((f) => f.fr24Id));

    for (const [fr24Id, identity] of watching.current) {
      if (seenFr24Ids.has(fr24Id) || cleared.current.has(fr24Id)) continue;

      debugLog("squawk", "flight disappeared from feed, reporting clearance", {
        fr24Id,
        icao24: identity.icao24,
      });

      clearances.push({
        fr24Id,
        icao24: identity.icao24,
        squawk: "",
        callsign: identity.callsign,
        flightNumber: identity.flightNumber,
        positionTime: Date.now(),
        onGround: true,
        missingFromFeed: true,
      });
      cleared.current.add(fr24Id);
    }

    for (const flight of flights) {
      const emergency = isEmergencySquawk(flight.squawk) && !flight.onGround;
      const observation: SquawkObservation = {
        fr24Id: flight.fr24Id,
        icao24: flight.icao24,
        squawk: flight.squawk,
        callsign: flight.callsign || undefined,
        flightNumber: flight.flightNumber || undefined,
        positionTime: flight.time,
        onGround: flight.onGround,
      };

      if (emergency) {
        const key = reportKey(flight.fr24Id, flight.squawk);
        if (!reported.current.has(key)) {
          emergencies.push(observation);
        }
        cleared.current.delete(flight.fr24Id);
        continue;
      }

      if (!watching.current.has(flight.fr24Id)) continue;
      if (cleared.current.has(flight.fr24Id)) continue;

      clearances.push(observation);
      cleared.current.add(flight.fr24Id);
    }

    if (emergencies.length > 0) {
      debugLog("squawk", `reporting ${emergencies.length} emergency squawk(s)`, {
        fr24Ids: emergencies.map((e) => e.fr24Id),
      });

      for (const report of emergencies) {
        reported.current.add(reportKey(report.fr24Id, report.squawk));
        watching.current.set(report.fr24Id, {
          icao24: report.icao24,
          callsign: report.callsign,
          flightNumber: report.flightNumber,
        });
      }

      void reportSquawks({ reports: emergencies }).catch(() => {
        for (const report of emergencies) {
          reported.current.delete(reportKey(report.fr24Id, report.squawk));
          watching.current.delete(report.fr24Id);
        }
      });
    }

    if (clearances.length === 0) return;

    debugLog("squawk", `reporting ${clearances.length} clearance(s)`, {
      fr24Ids: clearances.map((c) => c.fr24Id),
      missingFromFeed: clearances.some((c) => c.missingFromFeed),
    });

    void reportSquawkClearances({ clearances })
      .then(() => {
        for (const report of clearances) {
          watching.current.delete(report.fr24Id);
          forgetFr24Id(reported.current, report.fr24Id);
        }
      })
      .catch(() => {
        for (const report of clearances) {
          cleared.current.delete(report.fr24Id);
        }
      });
  }, [enabled, flights, reportSquawkClearances, reportSquawks]);
}
