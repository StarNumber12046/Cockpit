import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { type Fr24Flight } from "@cockpit/fr24";
import { isEmergencySquawk } from "@cockpit/shared";
import { api } from "../lib/convex";

type SquawkObservation = {
  fr24Id: string;
  icao24: string;
  squawk: string;
  callsign?: string;
  flightNumber?: string;
  positionTime: number;
  onGround: boolean;
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
  const watching = useRef(new Set<string>());
  const cleared = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;

    const emergencies: SquawkObservation[] = [];
    const clearances: SquawkObservation[] = [];

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
      for (const report of emergencies) {
        reported.current.add(reportKey(report.fr24Id, report.squawk));
        watching.current.add(report.fr24Id);
      }

      void reportSquawks({ reports: emergencies }).catch(() => {
        for (const report of emergencies) {
          reported.current.delete(reportKey(report.fr24Id, report.squawk));
          watching.current.delete(report.fr24Id);
        }
      });
    }

    if (clearances.length === 0) return;

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