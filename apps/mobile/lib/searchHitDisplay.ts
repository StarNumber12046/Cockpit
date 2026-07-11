import type {
  Fr24Flight,
  Fr24FlightDetails,
  Fr24SearchResultItem,
} from "@cockpit/fr24";
import { formatAltitude, formatFlightLabel } from "@cockpit/shared";
import type { AirlineIdentity } from "./media";

export type SearchHitDisplay = {
  callsign: string;
  aircraftCode: string | null;
  airline: string;
  altitudeText: string | null;
  identity: AirlineIdentity;
};

function fieldsFromDetail(detail: Fr24FlightDetails | null | undefined) {
  if (!detail) return null;
  const aircraftCode = detail.aircraft?.model?.code?.trim().toUpperCase() || "";
  return {
    airline: detail.airline?.name?.trim() || detail.airline?.short?.trim() || "",
    altitude: detail.trail?.[0]?.alt,
    aircraftCode: aircraftCode || null,
    airlineIcao: detail.airline?.code?.icao,
    airlineIata: detail.airline?.code?.iata,
    callsign: detail.identification?.callsign,
    flightNumber: detail.identification?.number?.default,
  };
}

export function resolveSearchHitDisplay(
  item: Fr24SearchResultItem,
  onMapFlight?: Fr24Flight | null,
  detail?: Fr24FlightDetails | null,
): SearchHitDisplay {
  const fromDetail = fieldsFromDetail(detail);

  const callsign = formatFlightLabel({
    callsign:
      fromDetail?.callsign ?? item.callsign ?? onMapFlight?.callsign,
    flightNumber:
      fromDetail?.flightNumber ??
      item.flightNumber ??
      onMapFlight?.flightNumber,
    fr24Id: item.fr24Id,
    id: item.id,
  });

  const airline = item.airline?.trim() || fromDetail?.airline || "";
  const altitude =
    item.altitude ?? onMapFlight?.altitude ?? fromDetail?.altitude;
  const altitudeText =
    altitude != null && !Number.isNaN(altitude) ? formatAltitude(altitude) : null;
  const aircraftCode =
    onMapFlight?.aircraftCode?.trim().toUpperCase() ||
    fromDetail?.aircraftCode ||
    null;

  const identity: AirlineIdentity = {
    airlineIcao:
      fromDetail?.airlineIcao ??
      item.airlineIcao ??
      onMapFlight?.airlineIcao,
    airlineIata: fromDetail?.airlineIata ?? item.airlineIata,
    flightNumber:
      fromDetail?.flightNumber ??
      item.flightNumber ??
      onMapFlight?.flightNumber ??
      item.label,
  };

  return { callsign, aircraftCode, airline, altitudeText, identity };
}