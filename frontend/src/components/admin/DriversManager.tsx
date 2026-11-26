"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, RotateCw, Trash2, UserCheck, X } from "lucide-react";
import { Driver } from "@/types";
import { getApiBaseUrl } from "@/lib/api";

interface DriverForm {
  id: number | null;
  full_name: string;
  phone_number: string;
  license_number: string;
  is_active: boolean;
}

const EMPTY: DriverForm = { id: null, full_name: "", phone_number: "", license_number: "", is_active: true };

const getToken = () =>
  typeof window === "undefined" ? null : localStorage.getItem("dealer_token") || localStorage.getItem("token");

/**
 * Owner-only driver roster (/superadmin -> Staff). Staff with the Rentals permission only see the
 * roster in /admin and assign drivers to bookings; adding, editing and removing happens here.
 * Drivers don't log in. A driver who already has bookings is deactivated instead of deleted, so
 * the booking history keeps its driver.
 */
export default function DriversManager() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [form, setForm] = useState<DriverForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3500);
  };

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(`${getApiBaseUrl()}/api/admin/drivers${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() || ""}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof body?.detail === "string" ? body.detail : "Request failed");
    return body;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api("");
      setDrivers(Array.isArray(list) ? list : []);
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    // Data fetch on mount; the state update happens after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const upsert = (d: Driver) =>
    setDrivers((prev) => (prev.some((x) => x.id === d.id) ? prev.map((x) => (x.id === d.id ? d : x)) : [...prev, d]));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (!form.full_name.trim() || !form.phone_number.trim()) {
      setError("Name and phone are required. / ስም እና ስልክ ያስገቡ።");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = JSON.stringify({
        full_name: form.full_name.trim(),
        phone_number: form.phone_number.trim(),
        license_number: form.license_number.trim(),
        is_active: form.is_active,
      });
      const saved: Driver = form.id ? await api(`/${form.id}`, { method: "PUT", body }) : await api("", { method: "POST", body });
      upsert(saved);
      flash(form.id ? "Driver updated" : `${saved.full_name} added to the roster`);
      setForm(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (d: Driver) => {
    setBusyId(d.id);
    try {
      upsert(await api(`/${d.id}`, { method: "PUT", body: JSON.stringify({ is_active: !d.is_active }) }));
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (d: Driver) => {
    if (!confirm(`Remove driver ${d.full_name}?\n\nIf they already have bookings they are switched off instead, so the booking history stays.\n\nአሽከርካሪውን ማስወገድ ይፈልጋሉ?`)) return;
    setBusyId(d.id);
    try {
      const r = await api(`/${d.id}`, { method: "DELETE" });
      if (String(r?.message || "").includes("deactivated")) {
        upsert({ ...d, is_active: false });
        flash(`${d.full_name} has bookings, so they were switched off instead`);
      } else {
        setDrivers((prev) => prev.filter((x) => x.id !== d.id));
        flash(`${d.full_name} removed`);
      }
    } catch (e) {
      flash((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4 pt-6 border-t border-zinc-800/80" id="drivers">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <UserCheck size={18} className="text-amber-400 shrink-0" /> አሽከርካሪዎች (Drivers)
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {drivers.filter((d) => d.is_active).length} active · staff with Rentals assign them to bookings
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={load}
            aria-label="Refresh drivers"
            className="h-11 w-11 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center justify-center"
          >
            <RotateCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            type="button"
            data-driver-add
            onClick={() => {
              setError(null);
              setForm({ ...EMPTY });
            }}
            className="h-11 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold flex items-center gap-1.5"
          >
            <Plus size={16} /> Add
          </button>
        </div>
      </div>

      {notice && (
        <p role="status" className="text-xs font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
          {notice}
        </p>
      )}

      {loading && drivers.length === 0 ? (
        <div className="py-8 flex justify-center">
          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : drivers.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">No drivers yet. Tap Add to register the first one.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {drivers.map((d) => (
            <li
              key={d.id}
              data-driver-id={d.id}
              className={`min-w-0 rounded-2xl border p-4 space-y-3 ${d.is_active ? "bg-zinc-900 border-zinc-800" : "bg-zinc-950 border-zinc-900 opacity-70"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-white truncate">{d.full_name}</p>
                  <a href={`tel:${d.phone_number}`} className="text-xs text-zinc-400 font-mono tabular-nums">
                    {d.phone_number}
                  </a>
                  {d.license_number && <p className="text-[11px] text-zinc-500">መንጃ ፍቃድ: {d.license_number}</p>}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={d.is_active}
                  aria-label={`${d.is_active ? "Deactivate" : "Activate"} ${d.full_name}`}
                  disabled={busyId === d.id}
                  onClick={() => toggleActive(d)}
                  className="shrink-0 h-11 flex items-center gap-2 text-[11px] font-bold disabled:opacity-50"
                >
                  <span className={d.is_active ? "text-emerald-400" : "text-zinc-500"}>{d.is_active ? "Active" : "Off"}</span>
                  <span className={`relative w-11 h-6 rounded-full transition ${d.is_active ? "bg-emerald-500" : "bg-zinc-700"}`}>
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${d.is_active ? "left-[22px]" : "left-0.5"}`} />
                  </span>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setForm({
                      id: d.id,
                      full_name: d.full_name,
                      phone_number: d.phone_number,
                      license_number: d.license_number || "",
                      is_active: d.is_active,
                    });
                  }}
                  className="h-11 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Pencil size={14} /> Edit
                </button>
                <button
                  type="button"
                  disabled={busyId === d.id}
                  onClick={() => remove(d)}
                  data-driver-remove={d.id}
                  className="h-11 rounded-xl bg-zinc-950 hover:bg-red-500/15 border border-red-500/40 text-red-400 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 size={14} /> Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {form && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true">
          <form
            onSubmit={save}
            className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-zinc-900 border-t sm:border border-zinc-800 rounded-t-3xl sm:rounded-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-white">{form.id ? "Edit driver" : "Add driver"}</h3>
              <button type="button" onClick={() => setForm(null)} aria-label="Close" className="h-11 w-11 -mr-2 flex items-center justify-center text-zinc-400">
                <X size={18} />
              </button>
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">ሙሉ ስም (Name) *</span>
              <input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
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
                className="w-full h-11 px-3.5 bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl text-base sm:text-sm text-white font-mono focus:outline-none"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">መንጃ ፍቃድ (Licence no.)</span>
              <input
                value={form.license_number}
                onChange={(e) => setForm({ ...form, license_number: e.target.value })}
                className="w-full h-11 px-3.5 bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl text-base sm:text-sm text-white focus:outline-none"
              />
            </label>
            <label className="flex items-center justify-between gap-3 min-h-12 px-3.5 rounded-xl bg-zinc-950 border border-zinc-800 cursor-pointer">
              <span className="text-sm font-bold text-white">Active (can be assigned)</span>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="w-5 h-5 accent-emerald-500"
              />
            </label>
            {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3">{error}</p>}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button type="button" onClick={() => setForm(null)} className="h-12 rounded-xl bg-zinc-800 text-zinc-200 text-sm font-bold">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-black disabled:opacity-60">
                {saving ? "Saving…" : form.id ? "Save" : "Add driver"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
