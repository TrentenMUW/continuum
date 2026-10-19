/** D15: the display zone is the browser's zone unless settings override it. */
export function resolveDisplayZone(setting: string | "auto"): string {
  if (setting !== "auto") return setting;
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
