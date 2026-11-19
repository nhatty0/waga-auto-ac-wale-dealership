/**
 * Mileage display. `null`/`undefined` means the admin left the field empty, so we
 * show nothing at all (never a made-up "0 km"). A real 0 the admin typed shows "0 km".
 */
export function hasMileage(m: number | null | undefined): m is number {
  return typeof m === "number" && Number.isFinite(m);
}

export function formatMileage(m: number | null | undefined): string | null {
  return hasMileage(m) ? `${m.toLocaleString()} km` : null;
}

/** Form input → API value: "" (or junk) → null, otherwise a non-negative integer. */
export function parseMileageInput(raw: string): number | null {
  const s = raw.trim().replace(/[,\s]/g, "");
  if (s === "") return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
