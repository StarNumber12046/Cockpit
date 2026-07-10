import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "poll tracked ACARS",
  { minutes: 3 },
  internal.trackedPoll.pollTrackedAcars,
);

export default crons;