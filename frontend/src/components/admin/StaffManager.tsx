"use client";

import { useCallback, useEffect, useState } from "react";
import { Car, Calendar, DoorOpen, FileText, Key, PackageCheck, Pencil, Plus, Send, ShieldCheck, Trash2, Truck, UserX, Users, X, RotateCw, Unlink, Smartphone } from "lucide-react";
import QrLinkModal from "@/components/QrLinkModal";
import StaffDocumentsSheet from "@/components/documents/StaffDocumentsSheet";
import { docApi } from "@/lib/docCenter";
import { FIELD_ROLES, FieldRole, StaffUser, WEB_PERMISSIONS, WebPermission } from "@/types";
import { getApiBaseUrl } from "@/lib/api";

const WEB_INFO: Record<WebPermission, { label: string; am: string; hint: string; icon: typeof Car }> = {
  vehicles: { label: "Vehicles", am: "መኪኖች", hint: "Post, edit and delete listings", icon: Car },
  appointments: { label: "Appointments", am: "ቀጠሮዎች", hint: "Test drives & visits", icon: Calendar },
  rentals: { label: "Rentals", am: "ኪራይ", hint: "Bookings + assign drivers", icon: Key },
};

const ROLE_INFO: Record<FieldRole, { label: string; am: string; hint: string; icon: typeof Car }> = {
  driver: { label: "Driver", am: "ሹፌር", hint: "Gets delivery / move tasks in Telegram; can be assigned to rentals", icon: Truck },
  gatekeeper: { label: "Gatekeeper", am: "በር ጥበቃ", hint: "Gets gate passes in Telegram and confirms cars leaving", icon: DoorOpen },
};

interface StaffForm {
  id: number | null;
  full_name: string;
  phone_number: string;
  permissions: WebPermission[];
  field_roles: FieldRole[];
  is_active: boolean;
}

const EMPTY_FORM: StaffForm = { id: null, full_name: "", phone_number: "", permissions: [], field_roles: [], is_active: true };

const displayPhone = (p: string) => {
  const d = (p || "").replace(/\D/g, "");
  return /^251\d{9}$/.test(d) ? `0${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}` : p;
};

const getToken = () =>
  typeof window === "undefined" ? null : localStorage.getItem("dealer_token") || localStorage.getItem("token");

const webPerms = (u: StaffUser): WebPermission[] =>
  u.web_permissions ?? (u.permissions.filter((p) => p !== "gate") as WebPermission[]);
const roles = (u: StaffUser): FieldRole[] =>
  u.field_roles ?? (u.permissions.includes("gate") ? ["gatekeeper"] : []);

/**
 * Owner-only Team list (/superadmin -> Team). One person = website permissions (Vehicles,
 * Appointments, Rentals) + field roles (Driver, Gatekeeper). Field-only people can't log in to the
 * website: their work arrives in Telegram. Deactivate keeps the account; Remove deletes it for good
 * (names already printed on documents are stored as text, so those keep them). The backend
 * enforces every rule.
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

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() || ""}`, ...(init?.headers || {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof body?.detail === "string" ? body.detail : "Request failed");
    return body;
  }, []);

  const [meId, setMeId] = useState<number | null>(null);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  // Staff documents per member (Team card: "Documents (n)" and "Holding N items").
  const [docStats, setDocStats] = useState<Record<string, { documents: number; holding: number }>>({});
  const [docsFor, setDocsFor] = useState<StaffUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, me, stats] = await Promise.all([
        api("/api/superadmin/staff"),
        api("/api/admin/me").catch(() => null),
        docApi<Record<string, { documents: number; holding: number }>>("/staff-summary").catch(() => ({})),
      ]);
      setStaff(Array.isArray(list) ? list : []);
      setDocStats(stats || {});
      if (me?.id) setMeId(me.id);
    } catch (e) {
      onToast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }, [api, onToast]);

  useEffect(() => {
    // Data fetch on mount; the state update happens after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const [tgLink, setTgLink] = useState<{ user: StaffUser; url: string; expires: string } | null>(null);

  const linkTelegram = async (u: StaffUser) => {
    setBusyId(u.id);
    try {
      const r = await api(`/api/superadmin/staff/${u.id}/telegram-link`, { method: "POST" });
      if (!r?.url || !/^https:\/\/t\.me\/[A-Za-z][A-Za-z0-9_]{3,31}\?start=/.test(r.url)) {
        throw new Error("Bot username not configured. Check Settings → Telegram status.");
      }
      setTgLink({ user: u, url: r.url, expires: r.expires_at });
    } catch (e) {
      onToast((e as Error).message, "error");
    } finally {
      setBusyId(null);
    }
  };

  const unlinkTelegram = async (u: StaffUser) => {
    if (!confirm(`Unlink Telegram for ${u.full_name || displayPhone(u.phone_number)}? Tasks and gate passes stop reaching them until they link again.`)) return;
    setBusyId(u.id);
    try {
      await api(`/api/superadmin/staff/${u.id}/telegram`, { method: "DELETE" });
      upsert({ ...u, telegram_linked: false });
      onToast("Telegram unlinked");
    } catch (e) {
      onToast((e as Error).message, "error");
    } finally {
      setBusyId(null);
    }
  };

  const upsert = (u: StaffUser) => setStaff((prev) => (prev.some((s) => s.id === u.id) ? prev.map((s) => (s.id === u.id ? u : s)) : [u, ...prev]));

  const toggleActive = async (u: StaffUser) => {
    setBusyId(u.id);
    try {
      const updated: StaffUser = await api(`/api/superadmin/staff/${u.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !u.is_active }),
      });
      upsert(updated);
      onToast(updated.is_active ? `${updated.full_name || "Member"} is active again` : `${updated.full_name || "Member"} deactivated: blocked immediately`);
    } catch (e) {
      onToast((e as Error).message, "error");
    } finally {
      setBusyId(null);
    }
  };

  const removeForever = async (u: StaffUser) => {
    const who = u.full_name || displayPhone(u.phone_number);
    if (
      !confirm(
        `Remove ${who} completely?\n\nTheir login, roles and Telegram link are deleted. This cannot be undone (you can add the number again later).\n\n${who}ን ሙሉ በሙሉ ማስወገድ ይፈልጋሉ? ሊመለስ አይችልም።`
      )
    )
      return;
    setBusyId(u.id);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/superadmin/staff/${u.id}/permanent`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken() || ""}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body?.detail === "string" ? body.detail : "Could not remove this person");
      }
      setStaff((prev) => prev.filter((s) => s.id !== u.id));
      onToast(`${who} removed`);
    } catch (e) {
      onToast((e as Error).message, "error");
    } finally {
      setBusyId(null);
    }
  };

  const saveOwnerName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerName?.trim()) return;
    setSavingName(true);
    try {
      const saved: StaffUser = await api("/api/superadmin/me", { method: "PUT", body: JSON.stringify({ full_name: ownerName.trim() }) });
      upsert(saved);
      setOwnerName(null);
      onToast("Name saved");
    } catch (err) {
      onToast((err as Error).message, "error");
    } finally {
      setSavingName(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if (!form.full_name.trim() || !form.phone_number.trim()) {
      setFormError("Name and phone are required. / ስም እና ስልክ ያስገቡ።");
      return;
    }
    if (form.permissions.length === 0 && form.field_roles.length === 0) {
      setFormError("Tick at least one website permission or field role. / ቢያንስ አንድ ይምረጡ።");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = JSON.stringify({
        full_name: form.full_name.trim(),
        phone_number: form.phone_number.trim(),
        permissions: form.permissions,
        field_roles: form.field_roles,
        is_active: form.is_active,
      });
      const saved: StaffUser = form.id
        ? await api(`/api/superadmin/staff/${form.id}`, { method: "PUT", body })
        : await api("/api/superadmin/staff", { method: "POST", body });
      upsert(saved);
      onToast(
        form.id
          ? "Team member updated"
          : saved.can_use_website === false
          ? `${saved.full_name} added. Tap Link Telegram so their tasks reach them.`
          : `${saved.full_name} added. They can log in with ${displayPhone(saved.phone_number)}`
      );
      setForm(null);
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const togglePerm = (p: WebPermission) =>
    setForm((f) => (f ? { ...f, permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p] } : f));
  const toggleRole = (r: FieldRole) =>
    setForm((f) => (f ? { ...f, field_roles: f.field_roles.includes(r) ? f.field_roles.filter((x) => x !== r) : [...f.field_roles, r] } : f));

  const members = staff.filter((s) => !s.is_superadmin);
  const activeCount = members.filter((s) => s.is_active).length;
  const driverCount = members.filter((s) => s.is_active && roles(s).includes("driver")).length;

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
            <Users size={18} className="text-amber-400 shrink-0" /> ቡድን (Team)
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            {activeCount} active · {driverCount} driver{driverCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={load}
            aria-label="Refresh team list"
            className="h-11 w-11 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center justify-center"
          >
            <RotateCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            type="button"
            data-team-add
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
        <p className="py-10 text-center text-sm text-zinc-500">No team members yet. Tap Add to register the first one.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {staff.map((u) => {
            const wp = webPerms(u);
            const fr = roles(u);
            const fieldOnly = !u.is_superadmin && wp.length === 0;
            return (
              <li
                key={u.id}
                data-member-id={u.id}
                className={`min-w-0 rounded-2xl border p-4 space-y-3 ${u.is_active ? "bg-zinc-900 border-zinc-800" : "bg-zinc-950 border-zinc-900 opacity-70"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`font-bold truncate ${u.full_name ? "text-white" : "text-zinc-500 italic"}`}>
                      {u.full_name || (u.is_superadmin ? "Owner (no name yet)" : "Unnamed")}
                    </p>
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
                    <span className="px-2 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-[11px] font-semibold">Everything (set by SUPERADMIN_PHONE)</span>
                  ) : (
                    <>
                      {wp.map((p) => {
                        const Info = WEB_INFO[p];
                        return (
                          <span key={p} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] font-semibold">
                            <Info.icon size={12} /> {Info.label}
                          </span>
                        );
                      })}
                      {fr.map((r) => {
                        const Info = ROLE_INFO[r];
                        return (
                          <span key={r} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500/10 border border-sky-500/25 text-sky-300 text-[11px] font-semibold">
                            <Info.icon size={12} /> {Info.label}
                          </span>
                        );
                      })}
                      {wp.length === 0 && fr.length === 0 && (
                        <span className="px-2 py-1 rounded-lg bg-zinc-800/60 text-zinc-500 text-[11px] font-semibold">No access yet</span>
                      )}
                    </>
                  )}
                </div>
                {fieldOnly && (
                  <p className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                    <Smartphone size={12} className="shrink-0" /> Telegram only: no website login. / በቴሌግራም ብቻ
                  </p>
                )}

                {!u.is_superadmin && (
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      data-staff-docs={u.id}
                      onClick={() => setDocsFor(u)}
                      className="h-11 px-3 flex-1 min-w-0 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold flex items-center justify-center gap-1.5"
                    >
                      <FileText size={14} className="shrink-0" /> Documents · ሰነዶች
                      {docStats[String(u.id)]?.documents ? <span className="text-zinc-400">({docStats[String(u.id)].documents})</span> : null}
                    </button>
                    {docStats[String(u.id)]?.holding ? (
                      <span
                        data-staff-holding={u.id}
                        className="h-11 px-2.5 shrink-0 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-300 text-[11px] font-bold inline-flex items-center gap-1"
                        title="Items handed over and not yet returned"
                      >
                        <PackageCheck size={13} /> Holding {docStats[String(u.id)].holding} item{docStats[String(u.id)].holding === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>
                )}

                {u.is_superadmin && u.id === meId && (
                  <button
                    type="button"
                    data-owner-edit-name
                    onClick={() => setOwnerName(u.full_name || "")}
                    className="w-full h-11 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-bold flex items-center justify-center gap-1.5"
                  >
                    <Pencil size={14} /> Edit my name · ስሜን አስተካክል
                  </button>
                )}

                {!u.is_superadmin && (
                  <div className="flex items-center gap-2 min-w-0">
                    {u.telegram_linked ? (
                      <>
                        <span className="min-w-0 flex-1 truncate inline-flex items-center gap-1.5 text-xs font-bold text-sky-300">
                          <Send size={13} className="shrink-0" /> Telegram linked ✓
                        </span>
                        <button
                          type="button"
                          disabled={busyId === u.id}
                          onClick={() => unlinkTelegram(u)}
                          aria-label={`Unlink Telegram for ${u.full_name || u.phone_number}`}
                          className="h-11 px-3 shrink-0 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <Unlink size={13} /> Unlink
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === u.id || !u.is_active}
                        onClick={() => linkTelegram(u)}
                        data-link-telegram={u.id}
                        className="w-full h-11 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-300 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
                      >
                        <Send size={14} /> Link Telegram
                      </button>
                    )}
                  </div>
                )}

                {!u.is_superadmin && (
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setFormError(null);
                        setForm({ id: u.id, full_name: u.full_name || "", phone_number: displayPhone(u.phone_number), permissions: [...wp], field_roles: [...fr], is_active: u.is_active });
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
                          if (confirm(`Deactivate ${u.full_name || u.phone_number}? They are blocked on their next action. Their records stay.`)) toggleActive(u);
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
                    <button
                      type="button"
                      disabled={busyId === u.id}
                      onClick={() => removeForever(u)}
                      data-staff-remove={u.id}
                      aria-label={`Remove ${u.full_name || u.phone_number} permanently`}
                      className="h-11 rounded-xl bg-zinc-950 hover:bg-red-500/15 border border-red-500/40 text-red-400 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <Trash2 size={14} /> Remove
                    </button>
                  </div>
                )}
              </li>
            );
          })}
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
              <h3 className="text-base font-black text-white">{form.id ? "Edit team member" : "Add team member"}</h3>
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
            </label>

            <fieldset className="space-y-2">
              <legend className="text-xs font-bold text-zinc-300 mb-1.5">የድረ-ገጽ ፈቃዶች (Website permissions)</legend>
              {WEB_PERMISSIONS.map((p) => {
                const Info = WEB_INFO[p];
                const on = form.permissions.includes(p);
                return (
                  <label
                    key={p}
                    className={`flex items-center gap-3 min-h-12 px-3.5 py-2 rounded-xl border cursor-pointer transition ${on ? "bg-amber-500/10 border-amber-500/40" : "bg-zinc-950 border-zinc-800"}`}
                  >
                    <input type="checkbox" checked={on} onChange={() => togglePerm(p)} data-perm={p} className="w-5 h-5 accent-amber-500 shrink-0" />
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
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-xs font-bold text-zinc-300 mb-1.5">የመስክ ስራ (Field roles, via Telegram)</legend>
              {FIELD_ROLES.map((r) => {
                const Info = ROLE_INFO[r];
                const on = form.field_roles.includes(r);
                return (
                  <label
                    key={r}
                    className={`flex items-center gap-3 min-h-12 px-3.5 py-2 rounded-xl border cursor-pointer transition ${on ? "bg-sky-500/10 border-sky-500/40" : "bg-zinc-950 border-zinc-800"}`}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggleRole(r)} data-role={r} className="w-5 h-5 accent-sky-500 shrink-0" />
                    <Info.icon size={16} className={on ? "text-sky-400" : "text-zinc-500"} />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-white">
                        {Info.label} <span className="text-zinc-500 font-normal">· {Info.am}</span>
                      </span>
                      <span className="block text-[11px] text-zinc-400">{Info.hint}</span>
                    </span>
                  </label>
                );
              })}
              <p className="text-[11px] text-zinc-500">
                {form.permissions.length === 0
                  ? "No website permission ticked: this person can't log in to the website. Tasks reach them in Telegram."
                  : `Logs in at /admin with this number (code by SMS).`}{" "}
                Settings, Documents, Tasks and Team are always owner-only.
              </p>
            </fieldset>

            <label className="flex items-center justify-between gap-3 min-h-12 px-3.5 rounded-xl bg-zinc-950 border border-zinc-800 cursor-pointer">
              <span className="text-sm font-bold text-white">Active</span>
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
              <button type="submit" disabled={saving} data-team-save className="h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-black disabled:opacity-60">
                {saving ? "Saving…" : form.id ? "Save" : "Add"}
              </button>
            </div>
          </form>
        </div>
      )}
      {ownerName !== null && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true">
          <form
            onSubmit={saveOwnerName}
            className="w-full sm:max-w-md bg-zinc-900 border-t sm:border border-zinc-800 rounded-t-3xl sm:rounded-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-white">Your display name</h3>
              <button type="button" onClick={() => setOwnerName(null)} aria-label="Close" className="h-11 w-11 -mr-2 flex items-center justify-center text-zinc-400">
                <X size={18} />
              </button>
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-300">ሙሉ ስም (Name)</span>
              <input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                autoFocus
                autoComplete="name"
                data-owner-name-input
                className="w-full h-11 px-3.5 bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl text-base sm:text-sm text-white focus:outline-none"
              />
              <span className="block text-[11px] text-zinc-500">Shown in Team, on task history and in Telegram notices. Owner permissions can&apos;t be changed here.</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setOwnerName(null)} className="h-12 rounded-xl bg-zinc-800 text-zinc-200 text-sm font-bold">
                Cancel
              </button>
              <button type="submit" disabled={savingName || !ownerName.trim()} data-owner-name-save className="h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-black disabled:opacity-60">
                {savingName ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      )}
      {docsFor && (
        <StaffDocumentsSheet userId={docsFor.id} title={docsFor.full_name || displayPhone(docsFor.phone_number)} onClose={() => setDocsFor(null)} />
      )}
      {tgLink && (
        <QrLinkModal
          title={`Link Telegram: ${tgLink.user.full_name || displayPhone(tgLink.user.phone_number)}`}
          subtitle="One-time link for THIS person's own Telegram"
          url={tgLink.url}
          onClose={() => setTgLink(null)}
          note={
            <>
              Open it on their phone and tap <b>Start</b>. The bot answers &ldquo;Telegram linked&rdquo;. Works once, expires {tgLink.expires}.
            </>
          }
        >
          <button
            type="button"
            onClick={() => {
              setTgLink(null);
              load();
            }}
            className="w-full h-11 rounded-xl bg-emerald-500/15 text-emerald-300 text-sm font-bold"
          >
            Done: refresh the list
          </button>
        </QrLinkModal>
      )}
    </section>
  );
}
