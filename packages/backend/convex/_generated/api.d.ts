/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as acars from "../acars.js";
import type * as acarsExplain from "../acarsExplain.js";
import type * as acarsLive from "../acarsLive.js";
import type * as alerts from "../alerts.js";
import type * as crons from "../crons.js";
import type * as flightSessions from "../flightSessions.js";
import type * as lib_airframesClient from "../lib/airframesClient.js";
import type * as lib_alertCreate from "../lib/alertCreate.js";
import type * as lib_correlation from "../lib/correlation.js";
import type * as lib_flightSession from "../lib/flightSession.js";
import type * as lib_llmStream from "../lib/llmStream.js";
import type * as lib_squawkVerify from "../lib/squawkVerify.js";
import type * as seed from "../seed.js";
import type * as tracked from "../tracked.js";
import type * as trackedPoll from "../trackedPoll.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  acars: typeof acars;
  acarsExplain: typeof acarsExplain;
  acarsLive: typeof acarsLive;
  alerts: typeof alerts;
  crons: typeof crons;
  flightSessions: typeof flightSessions;
  "lib/airframesClient": typeof lib_airframesClient;
  "lib/alertCreate": typeof lib_alertCreate;
  "lib/correlation": typeof lib_correlation;
  "lib/flightSession": typeof lib_flightSession;
  "lib/llmStream": typeof lib_llmStream;
  "lib/squawkVerify": typeof lib_squawkVerify;
  seed: typeof seed;
  tracked: typeof tracked;
  trackedPoll: typeof trackedPoll;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
