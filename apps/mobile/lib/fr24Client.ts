import { Platform } from "react-native";
import { FR24_HEADERS, Fr24Client } from "@cockpit/fr24";
import { debugLog } from "./debug";
import { fr24Fetch } from "./fr24Fetch";
import { usesFr24EdgeProxy } from "./fr24Proxy";

/** sec-fetch-* can read as non-browser on some native stacks; keep core browser headers. */
const NATIVE_FR24_HEADERS: Record<string, string> = {
  accept: FR24_HEADERS.accept,
  "accept-language": FR24_HEADERS["accept-language"],
  "cache-control": FR24_HEADERS["cache-control"],
  origin: FR24_HEADERS.origin,
  referer: FR24_HEADERS.referer,
  "user-agent": FR24_HEADERS["user-agent"],
};

debugLog("fr24", `client platform=${Platform.OS} transport=fetch+cronet`, {
  headerKeys:
    Platform.OS === "web"
      ? Object.keys(FR24_HEADERS)
      : Object.keys(NATIVE_FR24_HEADERS),
  edgeProxy: usesFr24EdgeProxy(),
});

/** App FR24 client — instrumented fetch; lean headers on native. */
export const fr24 = new Fr24Client({
  fetch: Platform.OS === "web" ? undefined : fr24Fetch,
  headers: Platform.OS === "web" ? undefined : NATIVE_FR24_HEADERS,
});
