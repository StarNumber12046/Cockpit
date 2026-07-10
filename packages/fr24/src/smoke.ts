/**
 * Optional Node smoke test (run with network):
 *   pnpm --filter @cockpit/fr24 exec tsx src/smoke.ts
 *
 * Verifies feed → sample detail against live FR24 (educational use only).
 */
import { Fr24Client, getDefaultBounds } from "./index";

async function main() {
  const client = new Fr24Client({ maxRetries: 1, timeoutMs: 20_000 });
  const bounds = getDefaultBounds();
  console.log("bounds", bounds);

  const flights = await client.getFlights(bounds, { limit: 50 });
  console.log("flights", flights.length);
  if (flights[0]) {
    console.log("sample", {
      id: flights[0].fr24Id,
      callsign: flights[0].callsign,
      route: `${flights[0].originAirportIata}->${flights[0].destinationAirportIata}`,
    });
    const detail = await client.getFlightDetails(flights[0].fr24Id);
    console.log("detail keys", Object.keys(detail).slice(0, 12));
  }

  const search = await client.search("UAL", 5);
  console.log("search live", search.live.length, "airport", search.airport.length);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
