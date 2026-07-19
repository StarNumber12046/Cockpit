/** Dev-only structured logs — stripped from production bundles. */
export function debugLog(
  tag: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  if (!__DEV__) return;
  if (extra !== undefined) {
    console.log(`[cockpit:${tag}] ${message}`, extra);
    return;
  }
  console.log(`[cockpit:${tag}] ${message}`);
}

export function debugWarn(
  tag: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  if (!__DEV__) return;
  if (extra !== undefined) {
    console.warn(`[cockpit:${tag}] ${message}`, extra);
    return;
  }
  console.warn(`[cockpit:${tag}] ${message}`);
}