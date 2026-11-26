"use client";

import React, { useState } from "react";
import { Archive, Calendar, Car, Clock, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Appointment, AppointmentStatus, Vehicle } from "@/types";
import { getApiBaseUrl } from "@/lib/api";

/** "Pending" is the stored value for New (no data rewrite for older rows). */
const STATUSES: { value: AppointmentStatus; label: string; tone: string }[] = [
  { value: "Pending", label: "New · አዲስ", tone: "border-amber-500/50 text-amber-300 bg-amber-500/10" },
  { value: "Confirmed", label: "Confirmed · ተረጋግጧል", tone: "border-sky-500/50 text-sky-300 bg-sky-500/10" },
  { value: "Done", label: "Done · ተጠናቋል", tone: "border-emerald-500/50 text-emerald-300 bg-emerald-500/10" },
  { value: "Cancelled", label: "Cancelled · ተሰርዟል", tone: "border-zinc-600 text-zinc-400 bg-zinc-800" },
  { value: "No-show", label: "No-show · አልመጣም", tone: "border-red-500/50 text-red-300 bg-red-500/10" },
];
const OPEN_STATUSES = new Set(["Pending", "Confirmed"]);

type Filter = "upcoming" | "past" | "archived";

/** Today in Addis Ababa as YYYY-MM-DD (appointment dates are stored as ISO dates). */
function todayAddis(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Addis_Ababa" }).format(new Date());
}

/** Upcoming = still open (New/Confirmed) and today or later. Everything else not archived is Past. */
export function isUpcoming(a: Appointment, today = todayAddis()): boolean {
  if (a.archived_at) return false;
  const isoDate = /^\d{4}-\d{2}-\d{2}/.test(a.date || "") ? a.date.slice(0, 10) : null;
  return OPEN_STATUSES.has(a.status || "Pending") && (isoDate === null || isoDate >= today);
}

/** Tab badge: archived appointments don't count. */
export function activeAppointmentCount(list: Appointment[]): number {
  return list.filter((a) => !a.archived_at).length;
}

export default function AppointmentsPanel({
  appointments,
  setAppointments,
  vehicles,
  isSuperadmin,
  getAuthToken,
  onUnauthorized,
  showToast,
}: {
  appointments: Appointment[];
  setAppointments: React.Dispatch<React.SetStateAction<Appointment[]>>;
  vehicles: Vehicle[];
  isSuperadmin: boolean;
  getAuthToken: () => string | null;
  onUnauthorized: (msg?: string) => void;
  showToast: (msg: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [busyId, setBusyId] = useState<number | null>(null);

  const today = todayAddis();
  const upcoming = appointments
    .filter((a) => isUpcoming(a, today))
    .sort((x, y) => `${x.date} ${x.time_slot}`.localeCompare(`${y.date} ${y.time_slot}`));
  const past = appointments
    .filter((a) => !a.archived_at && !isUpcoming(a, today))
    .sort((x, y) => `${y.date} ${y.time_slot}`.localeCompare(`${x.date} ${x.time_slot}`));
  const archived = appointments
    .filter((a) => a.archived_at)
    .sort((x, y) => (y.archived_at || "").localeCompare(x.archived_at || ""));
  const shown = filter === "upcoming" ? upcoming : filter === "past" ? past : archived;

  const call = async (id: number, path: string, method: string, body?: unknown): Promise<Response | null> => {
    setBusyId(id);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/admin/appointments/${id}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 401) {
        const err = await res.json().catch(() => ({}));
        onUnauthorized(err?.detail);
        return null;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail || `Request failed (${res.status})`);
      }
      return res;
    } catch (e) {
      alert((e as Error)?.message || "Something went wrong");
      return null;
    } finally {
      setBusyId(null);
    }
  };

  const replace = (updated: Appointment) =>
    setAppointments((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));

  const changeStatus = async (a: Appointment, status: AppointmentStatus) => {
    const res = await call(a.id, "/status", "PATCH", { status });
    if (res) {
      replace(await res.json());
      showToast(`#${a.id} → ${STATUSES.find((s) => s.value === status)?.label ?? status}`);
    }
  };

  const archive = async (a: Appointment) => {
    const res = await call(a.id, "/archive", "POST");
    if (res) {
      replace(await res.json());
      showToast(`#${a.id} ወደ ማህደር ገብቷል · Archived`);
    }
  };

  const restore = async (a: Appointment) => {
    const res = await call(a.id, "/restore", "POST");
    if (res) {
      replace(await res.json());
      showToast(`#${a.id} ተመልሷል · Restored`);
    }
  };

  const deleteForever = async (a: Appointment) => {
    if (
      !window.confirm(
        `Permanently delete appointment #${a.id} (${a.customer_name})? This cannot be undone.\n\nቀጠሮውን እስከመጨረሻው መሰረዝ ይፈልጋሉ? ሊመለስ አይችልም።`
      )
    )
      return;
    const res = await call(a.id, "", "DELETE");
    if (res) {
      setAppointments((prev) => prev.filter((x) => x.id !== a.id));
      showToast(`#${a.id} ተሰርዟል · Deleted`);
    }
  };

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: "upcoming", label: "Upcoming · የሚመጡ", count: upcoming.length },
    { key: "past", label: "Past · ያለፉ", count: past.length },
    { key: "archived", label: "Archived · ማህደር", count: archived.length },
  ];

  const empty =
    filter === "upcoming"
      ? "No upcoming appointments. · የሚመጣ ቀጠሮ የለም።"
      : filter === "past"
      ? "No past appointments. · ያለፈ ቀጠሮ የለም።"
      : "Nothing archived. · በማህደር ውስጥ ምንም የለም።";

  return (
    <div className="space-y-3">
      <div role="group" aria-label="Filter appointments" className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setFilter(c.key)}
            aria-pressed={filter === c.key}
            data-appt-filter={c.key}
            className={`shrink-0 h-10 px-3.5 rounded-full text-xs font-semibold border transition whitespace-nowrap ${
              filter === c.key
                ? "bg-amber-500 border-amber-500 text-black"
                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700"
            }`}
          >
            {c.label} ({c.count})
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-zinc-500 text-xs text-center py-10">{empty}</p>
      ) : (
        shown.map((a) => {
          const matchedCar = vehicles.find((v) => v.id === a.vehicle_id);
          const vehicleDisplay =
            a.vehicle_title ||
            (matchedCar
              ? `${matchedCar.year} ${matchedCar.make} ${matchedCar.model}`
              : a.vehicle_id
              ? `Vehicle #${a.vehicle_id}`
              : "General Showroom Inquiry");
          const statusValue = (STATUSES.some((s) => s.value === a.status) ? a.status : "Pending") as AppointmentStatus;
          const tone = STATUSES.find((s) => s.value === statusValue)!.tone;
          const busy = busyId === a.id;

          return (
            <div
              key={a.id}
              data-appointment-id={a.id}
              className={`bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2.5 ${a.archived_at ? "opacity-80" : ""}`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="font-bold text-sm text-white break-words min-w-0">{a.customer_name}</h3>
                    <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">#{a.id}</span>
                  </div>
                  <p className="text-sm sm:text-xs text-amber-400 font-medium flex flex-wrap items-center gap-x-2">
                    <a href={`tel:${a.phone_number}`} className="inline-flex items-center min-h-[44px] sm:min-h-0">
                      📞 {a.phone_number}
                    </a>
                    <span className="text-zinc-500">•</span>
                    <span className="text-zinc-300 font-normal">{a.preferred_channel}</span>
                  </p>
                  <div className="flex items-center gap-1.5 text-xs text-amber-300 font-semibold bg-black/40 border border-zinc-800/80 px-2 py-1 rounded-lg w-fit max-w-full mt-1">
                    <Car size={13} className="text-amber-400 shrink-0" />
                    <span className="break-words min-w-0">{vehicleDisplay}</span>
                  </div>
                </div>
                <span className="text-[11px] font-semibold bg-zinc-800 border border-zinc-700/60 px-2.5 py-1 rounded-lg text-zinc-300 shrink-0 self-start">
                  {a.appointment_type}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400 pt-2 border-t border-zinc-800/60">
                <span className="flex items-center gap-1.5">
                  <Calendar size={13} className="text-amber-400" /> {a.date}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock size={13} className="text-amber-400" /> {a.time_slot}
                </span>
              </div>

              {a.notes && (
                <p className="text-xs text-zinc-400 italic bg-zinc-950/60 p-2 rounded-lg border border-zinc-800/40 break-words">
                  &quot;{a.notes}&quot;
                </p>
              )}

              {a.archived_at && (
                <p className="text-[11px] text-zinc-500">
                  Archived {new Date(a.archived_at).toLocaleDateString()}
                  {a.archived_by ? ` by ${a.archived_by}` : ""}
                </p>
              )}

              {/* Actions: always visible, full-width on phones (360px). */}
              <div className="flex gap-2 pt-1">
                {!a.archived_at ? (
                  <>
                    <label className="flex-1 min-w-0">
                      <span className="sr-only">Status for appointment #{a.id}</span>
                      <select
                        value={statusValue}
                        disabled={busy}
                        onChange={(e) => changeStatus(a, e.target.value as AppointmentStatus)}
                        data-appt-status={a.id}
                        className={`w-full h-11 rounded-xl border px-2.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-amber-500/40 disabled:opacity-60 ${tone}`}
                      >
                        {STATUSES.map((s) => (
                          <option key={s.value} value={s.value} className="bg-zinc-900 text-white">
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => archive(a)}
                      disabled={busy}
                      data-appt-archive={a.id}
                      className="shrink-0 h-11 px-3.5 rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-200 hover:border-zinc-500 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-60"
                    >
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
                      Archive
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => restore(a)}
                      disabled={busy}
                      data-appt-restore={a.id}
                      className="flex-1 h-11 px-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60"
                    >
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                      Restore · መልስ
                    </button>
                    {isSuperadmin && (
                      <button
                        type="button"
                        onClick={() => deleteForever(a)}
                        disabled={busy}
                        data-appt-delete={a.id}
                        className="flex-1 h-11 px-3.5 rounded-xl border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60"
                      >
                        <Trash2 size={14} />
                        Delete forever
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
