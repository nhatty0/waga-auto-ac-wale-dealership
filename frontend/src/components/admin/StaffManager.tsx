"use client";

import { useCallback, useEffect, useState } from "react";
import { Car, Calendar, Key, Pencil, Plus, ShieldCheck, UserX, Users, X, RotateCw } from "lucide-react";
import { STAFF_PERMISSIONS, StaffPermission, StaffUser } from "@/types";
import { getApiBaseUrl } from "@/lib/api";

const PERMISSION_INFO: Record<StaffPermission, { label: string; am: string; hint: string; icon: typeof Car }> = {
  vehicles: { label: "Vehicles", am: "መኪኖች", hint: "Post, edit and delete listings", icon: Car },
  appointments: { label: "Appointments", am: "ቀጠሮዎች", hint: "Test drives & visits", icon: Calendar },
  rentals: { label: "Rentals", am: "ኪራይ", hint: "Bookings + drivers", icon: Key },
};

interface StaffForm {
  id: number | null;
  full_name: string;
  phone_number: string;
  permissions: StaffPermission[];
  is_active: boolean;
}

const EMPTY_FORM: StaffForm = { id: null, full_name: "", phone_number: "", permissions: [], is_active: true };

const displayPhone = (p: string) => {
  const d = (p || "").replace(/\D/g, "");
  return /^251\d{9}$/.test(d) ? `0${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}` : p;
};

const getToken = () =>
  typeof window === "undefined" ? null : localStorage.getItem("dealer_token") || localStorage.getItem("token");

/**
 * Owner-only staff list (/superadmin -> Staff): cards with name, phone, permission chips and
 * an Active toggle; Add / Edit / Deactivate. Staff are never hard-deleted (their names stay on
 * intake records, gate passes and handover contracts). The backend enforces every rule.
 */
export default function StaffManager() {
  const [toast, setToast] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const onToast = useCallback((text: string, type: "success" | "error" = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  }, []);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [form, setForm] = useState<StaffForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const api = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(`${getApiBaseUrl()}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() || ""}`, ...(init?.headers || {}) },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body?.detail === "string" ? body.detail : "Request failed");
      return body;
    },
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list: StaffUser[] = await api("/api/superadmin/staff");
      setStaff(Array.isArray(list) ? list : []);
    } catch (e) {
      onToast((e as Error).message || "Could not load staff", "error");
    } finally {
      setLoading(false);
    }
  }, [api, onToast]);

  useEffect(() => {
    // Data fetch on mount; the state update happens after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const upsert = (u: StaffUser) => setStaff((prev) => (prev.some((s) => s.id === u.id) ? prev.map((s) => (s.id === u.id ? u : s)) : [u, ...prev]));

  const toggleActive = async (u: StaffUser) => {
    setBusyId(u.id);
    try {
      const updated: StaffUser = await api(`/api/superadmin/staff/${u.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !u.is_active }),
      });
      upsert(updated);
      onToast(updated.is_active ? `${updated.full_name || "Staff"} can log in again` : `${updated.full_name || "Staff"} deactivated: blocked immediately`);
    } catch (e) {
      onToast((e as Error).message, "error");
    } finally {
      setBusyId(null);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (!form.full_name.trim() || !form.phone_number.trim()) {
      setFormError("Name and phone are required. / ስም እና ስልክ ያስገቡ።");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = JSON.stringify({
        full_name: form.full_name.trim(),
        phone_number: form.phone_number.trim(),
        permissions: form.permissions,
        is_active: form.is_active,
      });
      const saved: StaffUser = form.id
        ? await api(`/api/superadmin/staff/${form.id}`, { method: "PUT", body })
        : await api("/api/superadmin/staff", { method: "POST", body });
      upsert(saved);
      onToast(form.id ? "Staff member updated" : `${saved.full_name} added. They can now log in with ${displayPhone(saved.phone_number)}`);
      setForm(null);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const togglePerm = (p: StaffPermission) =>
    setForm((f) => (f ? { ...f, permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p] } : f));

  const activeCount = staff.filter((s) => !s.is_superadmin && s.is_active).length;

  return (
    <section className="space-y-4">
      {toast && (
        <div
          role="status"
          className={`fixed left-4 right-4 sm:left-auto sm:right-6 bottom-6 z-[60] sm:max-w-sm px-4 py-3 rounded-xl border text-sm font-semibold shadow-2xl bg-zinc-900 ${
            toast.type === "success" ? "text-emerald-300 border-emerald-500/30" : "text-rose-300 border-rose-500/30"
          }`}
        >
          {toast.text}
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <Users size={18} className="text-amber-400 shrink-0" /> ሰራተኞች (Staff)
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {activeCount} active · only these numbers (and owners) can log in
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={load}
            aria-label="Refresh staff list"
            className="h-11 w-11 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center justify-center"
          >
            <RotateCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setForm({ ...EMPTY_FORM });
            }}
            className="h-11 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold flex items-center gap-1.5"
          >
            <Plus size={16} /> Add
          </button>
        </div>
      </div>

      {loading && staff.length === 0 ? (
        <div className="py-12 flex justify-center">
          <div className="w-7 h-7 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : staff.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">No staff yet. Tap Add to register the first one.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {staff.map((u) => (
            <li
              key={u.id}
              className={`min-w-0 rounded-2xl border p-4 space-y-3 ${u.is_active ? "bg-zinc-900 border-zinc-800" : "bg-zinc-950 border-zinc-900 opacity-70"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-white truncate">{u.full_name || "Unnamed"}</p>
                  <a href={`tel:+${u.phone_number}`} className="text-xs text-zinc-400 font-mono tabular-nums">
                    {displayPhone(u.phone_number)}
                  </a>
                </div>
                {u.is_superadmin ? (
                  <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-300 text-[11px] font-bold">
                    <ShieldCheck size={12} /> Owner
                  </span>
                ) : (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={u.is_active}
                    aria-label={`${u.is_active ? "Deactivate" : "Activate"} ${u.full_name || u.phone_number}`}
                    disabled={busyId === u.id}
                    onClick={() => toggleActive(u)}
                    className="shrink-0 h-11 flex items-center gap-2 text-[11px] font-bold disabled:opacity-50"
                  >
                    <span className={u.is_active ? "text-emerald-400" : "text-zinc-500"}>{u.is_active ? "Active" : "Off"}</span>
                    <span className={`relative w-11 h-6 rounded-full transition ${u.is_active ? "bg-emerald-500" : "bg-zinc-700"}`}>
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${u.is_active ? "left-[22px]" : "left-0.5"}`} />
                    </span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {u.is_superadmin ? (
                  <span className="px-2 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-[11px] font-semibold">Everything</span>
                ) : u.permissions.length === 0 ? (
                  <span className="px-2 py-1 rounded-lg bg-zinc-800/60 text-zinc-500 text-[11px] font-semibold">No access yet</span>
                ) : (
                  u.permissions.map((p) => {
                    const Info = PERMISSION_INFO[p];
                    return (
                      <span key={p} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] font-semibold">
                        <Info.icon size={12} /> {Info.label}
                      </span>
                    );
                  })
                )}
              </div>

              {!u.is_superadmin && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormError(null);
                      setForm({ id: u.id, full_name: u.full_name || "", phone_number: displayPhone(u.phone_number), permissions: [...u.permissions], is_active: u.is_active });
                    }}
                    className="h-11 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <Pencil size={14} /> Edit
                  </button>
                  {u.is_active ? (
                    <button
                      type="button"
                      disabled={busyId === u.id}
                      onClick={() => {
                        if (confirm(`Deactivate ${u.full_name || u.phone_number}? They are logged out on their next action. Their records stay.`)) toggleActive(u);
                      }}
                      className="h-11 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <UserX size={14} /> Deactivate
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === u.id}
                      onClick={() => toggleActive(u)}
                      className="h-11 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold disabled:opacity-50"
                    >
                      Reactivate
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Add / Edit sheet: full-width bottom sheet on phones, centered dialog from sm up */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true">
          <form
            onSubmit={save}
            className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-zinc-900 border-t sm:border border-zinc-800 rounded-t-3xl sm:rounded-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-white">{form.id ? "Edit staff" : "Add staff"}</h3>
              <button type="button" onClick={() => setForm(null)} aria-label="Close" className="h-11 w-11 -mr-2 flex items-center justify-center text-zinc-400">
                <X size={18} />
              </button>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">ሙሉ ስም (Name) *</span>
              <input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="e.g. Dawit Tadesse"
                autoComplete="name"
                className="w-full h-11 px-3.5 bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl text-base sm:text-sm text-white focus:outline-none"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">ስልክ (Phone) *</span>
              <input
                value={form.phone_number}
                onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                placeholder="09XX XXX XXX"
                inputMode="tel"
                autoComplete="tel"
                className="w-full h-11 px-3.5 bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl text-base sm:text-sm text-white font-mono focus:outline-none"
              />
              <span className="block text-[11px] text-zinc-500">They log in at /admin with this number (code by SMS).</span>
            </label>

            <fieldset className="space-y-2">
              <legend className="text-xs font-bold text-zinc-300 mb-1.5">ፈቃዶች (Permissions)</legend>
              {STAFF_PERMISSIONS.map((p) => {
                const Info = PERMISSION_INFO[p];
                const on = form.permissions.includes(p);
                return (
                  <label
                    key={p}
                    className={`flex items-center gap-3 min-h-12 px-3.5 py-2 rounded-xl border cursor-pointer transition ${on ? "bg-amber-500/10 border-amber-500/40" : "bg-zinc-950 border-zinc-800"}`}
                  >
                    <input type="checkbox" checked={on} onChange={() => togglePerm(p)} className="w-5 h-5 accent-amber-500 shrink-0" />
                    <Info.icon size={16} className={on ? "text-amber-400" : "text-zinc-500"} />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-white">
                        {Info.label} <span className="text-zinc-500 font-normal">· {Info.am}</span>
                      </span>
                      <span className="block text-[11px] text-zinc-400">{Info.hint}</span>
                    </span>
                  </label>
                );
              })}
              <p className="text-[11px] text-zinc-500">Settings, Lot &amp; Gate Pass, Documents and Staff are always owner-only.</p>
            </fieldset>

            <label className="flex items-center justify-between gap-3 min-h-12 px-3.5 rounded-xl bg-zinc-950 border border-zinc-800 cursor-pointer">
              <span className="text-sm font-bold text-white">Active (can log in)</span>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="w-5 h-5 accent-emerald-500"
              />
            </label>

            {formError && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">{formError}</p>}

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button type="button" onClick={() => setForm(null)} className="h-12 rounded-xl bg-zinc-800 text-zinc-200 text-sm font-bold">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-black disabled:opacity-60">
                {saving ? "Saving…" : form.id ? "Save" : "Add staff"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
