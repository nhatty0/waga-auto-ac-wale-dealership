"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Copy, Send, X } from "lucide-react";
import { RentalBooking, StaffUser, Task, TaskType, Vehicle } from "@/types";
import { getApiBaseUrl } from "@/lib/api";

export const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: "rental_delivery", label: "🚚 Rental delivery · ማድረስ" },
  { value: "rental_pickup", label: "↩️ Rental pickup · መመለስ" },
  { value: "inspection", label: "🔍 Car check / inspection · ፍተሻ" },
  { value: "move_car", label: "🅿️ Move car · ማዛወር" },
  { value: "other", label: "📋 Other · ሌላ" },
];

const getToken = () =>
  typeof window === "undefined" ? null : localStorage.getItem("dealer_token") || localStorage.getItem("token");

export async function taskApi(path: string, init?: RequestInit) {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() || ""}`, ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body?.detail === "string" ? body.detail : `Request failed (${res.status})`);
  return body;
}

/** "2026-11-28T10:00" in Addis time from an ISO/UTC timestamp. */
function addisInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
  if (isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() + 3 * 3600 * 1000);
  return local.toISOString().slice(0, 16);
}

const carName = (v?: Vehicle | null) => (v ? `${v.year} ${v.make} ${v.model}` : "");

interface Props {
  /** Edit this task; omit to create. */
  task?: Task | null;
  /** Create from a rental booking ("Assign driver"): pre-filled delivery task. */
  booking?: RentalBooking | null;
  onClose: () => void;
  onSaved: (t: Task) => void;
}

export function CopyMessage({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      data-copy-message
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="w-full h-11 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm font-bold flex items-center justify-center gap-1.5"
    >
      {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
      {copied ? "Copied · ተቀድቷል" : "Copy message · መልእክቱን ቅዳ"}
    </button>
  );
}

export default function TaskForm({ task, booking, onClose, onSaved }: Props) {
  const editing = !!task;
  const [people, setPeople] = useState<StaffUser[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [rentals, setRentals] = useState<RentalBooking[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Task | null>(null);

  const [f, setF] = useState(() => ({
    task_type: (task?.task_type ?? (booking ? "rental_delivery" : "move_car")) as TaskType,
    vehicle_id: task?.vehicle_id ?? booking?.vehicle_id ?? null,
    vehicle_label: task?.vehicle_label ?? "",
    assigned_user_id: task?.assigned_user_id ?? booking?.assigned_user_id ?? null,
    scheduled_at: task?.scheduled_at ?? addisInput(booking?.start_date),
    location:
      task?.location ??
      (booking ? (booking.delivery_type === "doorstep_delivery" ? booking.delivery_address || "" : "ከሾውሩም / Showroom pickup") : ""),
    customer_name: task?.customer_name ?? booking?.customer_name ?? "",
    customer_phone: task?.customer_phone ?? booking?.customer_phone ?? "",
    notes: task?.notes ?? "",
    rental_booking_id: task?.rental_booking_id ?? booking?.id ?? null,
  }));

  useEffect(() => {
    let alive = true;
    Promise.all([
      taskApi("/api/superadmin/staff").catch(() => []),
      taskApi("/api/admin/vehicles").catch(() => []),
      taskApi("/api/admin/rentals").catch(() => []),
    ]).then(([s, v, r]) => {
      if (!alive) return;
      setPeople((Array.isArray(s) ? s : []).filter((u: StaffUser) => !u.is_superadmin && u.is_active));
      setVehicles(Array.isArray(v) ? v : []);
      setRentals(Array.isArray(r) ? r : []);
    });
    return () => {
      alive = false;
    };
  }, []);

  const isRental = f.task_type === "rental_delivery" || f.task_type === "rental_pickup";
  // Drivers first for rental/move tasks; everyone active can be picked.
  const sortedPeople = useMemo(() => {
    const isDriver = (u: StaffUser) => (u.field_roles ?? []).includes("driver");
    return [...people].sort((a, b) => Number(isDriver(b)) - Number(isDriver(a)) || (a.full_name || "").localeCompare(b.full_name || ""));
  }, [people]);
  const person = people.find((p) => p.id === f.assigned_user_id) || null;
  const notLinked = !!person && !person.telegram_linked;

  const pickBooking = (id: number | null) => {
    const b = rentals.find((x) => x.id === id) || null;
    setF((prev) => ({
      ...prev,
      rental_booking_id: id,
      ...(b
        ? {
            task_type: prev.task_type === "rental_pickup" ? "rental_pickup" : "rental_delivery",
            vehicle_id: prev.vehicle_id ?? b.vehicle_id,
            customer_name: prev.customer_name || b.customer_name,
            customer_phone: prev.customer_phone || b.customer_phone,
            location: prev.location || (b.delivery_type === "doorstep_delivery" ? b.delivery_address || "" : "ከሾውሩም / Showroom pickup"),
            scheduled_at: prev.scheduled_at || addisInput(prev.task_type === "rental_pickup" ? b.end_date : b.start_date),
            assigned_user_id: prev.assigned_user_id ?? b.assigned_user_id ?? null,
          }
        : {}),
    }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.assigned_user_id) {
      setError("Pick who does it. / ማን እንደሚሰራው ይምረጡ።");
      return;
    }
    if (isRental && person && !(person.field_roles ?? []).includes("driver")) {
      if (!confirm(`${person.full_name} doesn't have the Driver role. Assign anyway?`)) return;
    }
    if (notLinked && !confirm(`${person?.full_name} hasn't linked Telegram, so nothing will be sent automatically.\n\nSave anyway? You can copy the message and send it yourself.`)) return;
    setSaving(true);
    setError(null);
    try {
      const body = JSON.stringify({ ...f, vehicle_label: f.vehicle_id ? null : f.vehicle_label, send: true });
      const saved: Task = editing
        ? await taskApi(`/api/superadmin/tasks/${task!.id}`, { method: "PUT", body })
        : await taskApi("/api/superadmin/tasks", { method: "POST", body });
      onSaved(saved);
      if (saved.telegram && !saved.telegram.sent && !editing) setResult(saved);
      else onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full h-11 px-3.5 bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl text-base sm:text-sm text-white focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full sm:max-w-lg max-h-[94dvh] overflow-y-auto bg-zinc-900 border-t sm:border border-zinc-800 rounded-t-3xl sm:rounded-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-white">
            {result ? "Saved, not sent" : editing ? `Edit task #${task!.id}` : booking ? `Assign driver · booking #${booking.id}` : "New task · አዲስ ስራ"}
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="h-11 w-11 -mr-2 flex items-center justify-center text-zinc-400">
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div className="space-y-3" data-task-not-sent>
            <p className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>Task #{result.id} saved. {result.telegram?.reason}</span>
            </p>
            <pre className="whitespace-pre-wrap text-xs text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-xl p-3 max-h-60 overflow-y-auto">{result.copy_text}</pre>
            <CopyMessage text={result.copy_text} />
            <button type="button" onClick={onClose} className="w-full h-11 rounded-xl bg-amber-500 text-black text-sm font-black">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={save} className="space-y-3.5">
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">ዓይነት (Type)</span>
              <select value={f.task_type} onChange={(e) => setF({ ...f, task_type: e.target.value as TaskType })} className={input} data-task-type>
                {TASK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">ማን ይሰራዋል (Assigned to) *</span>
              <select
                value={f.assigned_user_id ?? ""}
                onChange={(e) => setF({ ...f, assigned_user_id: e.target.value ? Number(e.target.value) : null })}
                className={input}
                data-task-person
              >
                <option value="">— Pick a person —</option>
                {sortedPeople.map((u) => {
                  const r = u.field_roles ?? [];
                  const tag = r.includes("driver") ? "Driver" : r.includes("gatekeeper") ? "Gatekeeper" : "Staff";
                  return (
                    <option key={u.id} value={u.id}>
                      {u.full_name || u.phone_number} · {tag}
                      {u.telegram_linked ? "" : " · no Telegram"}
                    </option>
                  );
                })}
              </select>
              {notLinked && (
                <span className="flex gap-1.5 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg p-2" data-task-unlinked-warning>
                  <AlertTriangle size={13} className="shrink-0 mt-px" />
                  {person?.full_name} hasn&apos;t linked Telegram: nothing is sent automatically. After saving you can copy the message. (Team → Link Telegram)
                </span>
              )}
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">ኪራይ (Linked rental booking, optional)</span>
              <select
                value={f.rental_booking_id ?? ""}
                onChange={(e) => pickBooking(e.target.value ? Number(e.target.value) : null)}
                className={input}
                disabled={!!booking}
              >
                <option value="">— None —</option>
                {(booking && !rentals.some((r) => r.id === booking.id) ? [booking, ...rentals] : rentals).map((r) => (
                  <option key={r.id} value={r.id}>
                    #{r.id} · {r.customer_name} · {carName(r.vehicle) || `Vehicle #${r.vehicle_id}`}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">መኪና (Vehicle)</span>
              <select
                value={f.vehicle_id ?? ""}
                onChange={(e) => setF({ ...f, vehicle_id: e.target.value ? Number(e.target.value) : null })}
                className={input}
                data-task-vehicle
              >
                <option value="">— Not in the list / none —</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {carName(v)}
                    {v.exterior_color ? ` · ${v.exterior_color}` : ""} (#{v.id})
                  </option>
                ))}
              </select>
              {!f.vehicle_id && (
                <input
                  value={f.vehicle_label}
                  onChange={(e) => setF({ ...f, vehicle_label: e.target.value })}
                  placeholder="Or type it: Toyota Vitz 2015, plate 3-A12345"
                  className={input}
                />
              )}
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">ቀን እና ሰዓት (Date & time)</span>
                <input type="datetime-local" value={f.scheduled_at} onChange={(e) => setF({ ...f, scheduled_at: e.target.value })} className={input} data-task-when />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">ቦታ (Location / address)</span>
                <input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Bole, near Edna Mall" className={input} data-task-location />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">ደንበኛ (Customer, optional)</span>
                <input value={f.customer_name} onChange={(e) => setF({ ...f, customer_name: e.target.value })} className={input} />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">የደንበኛ ስልክ (Customer phone)</span>
                <input value={f.customer_phone} onChange={(e) => setF({ ...f, customer_phone: e.target.value })} inputMode="tel" className={`${input} font-mono`} />
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">ማስታወሻ (Notes)</span>
              <textarea
                value={f.notes}
                onChange={(e) => setF({ ...f, notes: e.target.value })}
                rows={3}
                className="w-full px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl text-base sm:text-sm text-white focus:outline-none"
              />
            </label>

            {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">{error}</p>}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button type="button" onClick={onClose} className="h-12 rounded-xl bg-zinc-800 text-zinc-200 text-sm font-bold">
                Cancel
              </button>
              <button type="submit" disabled={saving} data-task-save className="h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-black disabled:opacity-60 flex items-center justify-center gap-1.5">
                <Send size={15} />
                {saving ? "Saving…" : editing ? "Save" : notLinked ? "Save" : "Save & send"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
