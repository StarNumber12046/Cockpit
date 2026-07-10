/** Correlation bag used to join FR24 live identity with Convex product data. */
export type CorrelationKeys = {
  fr24Id?: string;
  icao24?: string;
  callsign?: string;
  flightNumber?: string;
};

export type Severity = "info" | "warning" | "critical";

export type AcarsCategory =
  | "position"
  | "weather"
  | "ops"
  | "emergency"
  | "system"
  | "other";

export type AlertType =
  | "squawk"
  | "altitude"
  | "diversion"
  | "delay"
  | "acars"
  | "manual"
  | "other";

export type FlightStatus =
  | "scheduled"
  | "departed"
  | "enroute"
  | "approaching"
  | "landed"
  | "diverted"
  | "cancelled"
  | "unknown";
