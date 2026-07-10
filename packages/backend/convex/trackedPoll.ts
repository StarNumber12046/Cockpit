import { internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";

type PollResult = {
  polled: number;
  refreshed: number;
  alertsCreated: number;
};

/** Background ACARS refresh for tracked flights (feeds alert pipeline). */
export const pollTrackedAcars = internalAction({
  args: {},
  handler: async (ctx): Promise<PollResult> => {
    const rows = await ctx.runQuery(internal.tracked.listForPoll);
    let refreshed = 0;
    let alertsCreated = 0;

    for (const row of rows) {
      if (!row.icao24 && !row.callsign && !row.flightNumber) continue;

      const result = await ctx.runAction(api.acarsLive.refreshForFlight, {
        fr24Id: row.fr24Id,
        icao24: row.icao24,
        callsign: row.callsign,
        flightNumber: row.flightNumber,
        limit: 25,
        flightStartedAt: row.flightStartedAt,
      });

      if (result.ok) {
        refreshed += 1;
        alertsCreated += result.alertsCreated ?? 0;
      }
    }

    return { polled: rows.length, refreshed, alertsCreated };
  },
});