/** D15: the display zone is the browser's zone unless settings override it. */
export function resolveDisplayZone(setting: string | "auto"): string {
  if (setting !== "auto") return setting;
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

const ianaCache = new Map<string, boolean>();

/** True if the runtime knows `zone` as an IANA time zone. */
export function isIanaZone(zone: string): boolean {
  let ok = ianaCache.get(zone);
  if (ok === undefined) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: zone });
      ok = zone.length > 0;
    } catch {
      ok = false;
    }
    ianaCache.set(zone, ok);
  }
  return ok;
}

/**
 * Common Windows zone names (as Outlook writes them in TZID) → IANA, from the CLDR
 * windowsZones mapping (territory "001"). Deliberately small: anything else falls back
 * to the file's VTIMEZONE (D15).
 */
export const WINDOWS_ZONES: Readonly<Record<string, string>> = {
  "Dateline Standard Time": "Etc/GMT+12",
  "Hawaiian Standard Time": "Pacific/Honolulu",
  "Alaskan Standard Time": "America/Anchorage",
  "Pacific Standard Time": "America/Los_Angeles",
  "US Mountain Standard Time": "America/Phoenix",
  "Mountain Standard Time": "America/Denver",
  "Central Standard Time": "America/Chicago",
  "Central Standard Time (Mexico)": "America/Mexico_City",
  "Central America Standard Time": "America/Guatemala",
  "Eastern Standard Time": "America/New_York",
  "SA Pacific Standard Time": "America/Bogota",
  "Atlantic Standard Time": "America/Halifax",
  "Newfoundland Standard Time": "America/St_Johns",
  "E. South America Standard Time": "America/Sao_Paulo",
  "Argentina Standard Time": "America/Argentina/Buenos_Aires",
  UTC: "UTC",
  "GMT Standard Time": "Europe/London",
  "Greenwich Standard Time": "Atlantic/Reykjavik",
  "W. Europe Standard Time": "Europe/Berlin",
  "Central Europe Standard Time": "Europe/Budapest",
  "Romance Standard Time": "Europe/Paris",
  "Central European Standard Time": "Europe/Warsaw",
  "GTB Standard Time": "Europe/Bucharest",
  "FLE Standard Time": "Europe/Helsinki",
  "E. Europe Standard Time": "Europe/Chisinau",
  "South Africa Standard Time": "Africa/Johannesburg",
  "Israel Standard Time": "Asia/Jerusalem",
  "Russian Standard Time": "Europe/Moscow",
  "Arabian Standard Time": "Asia/Dubai",
  "India Standard Time": "Asia/Kolkata",
  "SE Asia Standard Time": "Asia/Bangkok",
  "China Standard Time": "Asia/Shanghai",
  "Singapore Standard Time": "Asia/Singapore",
  "Taipei Standard Time": "Asia/Taipei",
  "Tokyo Standard Time": "Asia/Tokyo",
  "Korea Standard Time": "Asia/Seoul",
  "W. Australia Standard Time": "Australia/Perth",
  "Cen. Australia Standard Time": "Australia/Adelaide",
  "E. Australia Standard Time": "Australia/Brisbane",
  "AUS Eastern Standard Time": "Australia/Sydney",
  "New Zealand Standard Time": "Pacific/Auckland",
};

export type TzidResolution = { zone: string; via: "iana" | "windows" } | { zone: null; via: "unknown" };

/** D15: an IANA name is used directly; a common Windows name is mapped; anything else is unknown. */
export function resolveTzid(tzid: string): TzidResolution {
  const name = tzid.replace(/^"|"$/g, "").trim();
  if (isIanaZone(name) && name.includes("/")) return { zone: name, via: "iana" };
  if (name === "UTC" || name === "Etc/UTC") return { zone: "UTC", via: "iana" };
  const mapped = WINDOWS_ZONES[name];
  if (mapped) return { zone: mapped, via: "windows" };
  return { zone: null, via: "unknown" };
}
