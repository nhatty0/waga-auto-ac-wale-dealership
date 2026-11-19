import type { GatePass, LotIntake, Vehicle, VehicleHandover } from "@/types";

/** "3-A 12345 aa" and "3-A12345AA" are the same plate. */
export const normalizePlate = (p?: string | null) => (p || "").toUpperCase().replace(/[\s\-–_.]/g, "");

/** Backend datetimes are naive UTC; treat a missing zone as UTC. */
export const parseApiDate = (s?: string | null): Date | null => {
  if (!s) return null;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  return isNaN(d.getTime()) ? null : d;
};

/** Local calendar day (YYYY-MM-DD) for date-filter matching. */
export const localDayKey = (s?: string | null) => {
  const d = parseApiDate(s);
  if (!d) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

export const displayDate = (s?: string | null) => {
  const d = parseApiDate(s);
  return d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
};

/**
 * The day key ReceivingSheetPrint (Form 1) uses for an intake. It groups by the UTC
 * date of received_date, so a reprint must select the same key to show the same sheet.
 */
export const receivingSheetDayKey = (intake: LotIntake) => {
  try {
    return new Date(intake.received_date).toISOString().split("T")[0];
  } catch {
    return "";
  }
};

export const latestGatePass = (intake?: LotIntake | null): GatePass | null =>
  intake?.gate_passes && intake.gate_passes.length > 0 ? intake.gate_passes[intake.gate_passes.length - 1] : null;

/** Handover contract for a lot car: linked showroom vehicle first, then same plate. Newest wins. */
export function findHandoverForIntake(intake: LotIntake, handovers: VehicleHandover[]): VehicleHandover | null {
  const plate = normalizePlate(intake.plate_number);
  const matches = handovers.filter(
    (h) =>
      (intake.published_vehicle_id != null && h.vehicle_id === intake.published_vehicle_id) ||
      (plate !== "" && normalizePlate(h.plate_number) === plate)
  );
  return newestHandover(matches);
}

/** Intake record behind a showroom vehicle (when it was published from the lot desk). */
export const findIntakeForVehicle = (v: Vehicle, intakes: LotIntake[]) =>
  intakes.find((i) => i.published_vehicle_id === v.id) || null;

export function findHandoverForVehicle(
  v: Vehicle,
  handovers: VehicleHandover[],
  intake: LotIntake | null
): VehicleHandover | null {
  const direct = newestHandover(handovers.filter((h) => h.vehicle_id === v.id));
  return direct || (intake ? findHandoverForIntake(intake, handovers) : null);
}

function newestHandover(list: VehicleHandover[]): VehicleHandover | null {
  if (list.length === 0) return null;
  return [...list].sort((a, b) => (parseApiDate(b.date)?.getTime() ?? 0) - (parseApiDate(a.date)?.getTime() ?? 0) || b.id - a.id)[0];
}

export function isSuperadminUser(user?: { role?: string | null; phone_number?: string | null } | null) {
  if (!user) return false;
  const phone = (user.phone_number || "").replace(/\D/g, "");
  return user.role === "superadmin" || ["251911646628", "251918032065"].some((p) => phone.endsWith(p));
}
