"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Car, Check, Loader2, Plus, Printer, Save, Search, Stamp, Trash2, X, CalendarClock } from "lucide-react";
import {
  DOC_FORMS,
  DOC_INFO,
  DocApiError,
  DocData,
  DocDetail,
  DocType,
  FieldDef,
  LookupHit,
  RENTAL_CHECKLIST,
  docApi,
  getDocToken,
  newDocDefaults,
  str,
  vehicleFill,
} from "@/lib/docCenter";
import { birrInAmharicWords } from "@/lib/amharicNumber";
import { getApiBaseUrl } from "@/lib/api";

interface DocumentFormProps {
  type: DocType;
  /** Edit an existing document; omit to create a new one. */
  docId?: number | null;
  /** Extra starting values for a new document (e.g. from a vehicle or an intake). */
  prefill?: DocData;
  userName?: string;
  dealerPhone?: string;
  onClose: () => void;
  /** note: extra message for the toast (e.g. "Sent to 2 gatekeepers").
   * stamp: the "Stamp" toggle: print the final copy with the company stamp. */
  onSaved: (doc: DocDetail, print: boolean, note?: string, stamp?: boolean) => void;
}

const inputCls =
  "w-full h-11 rounded-xl bg-zinc-950 border border-zinc-700 px-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40 disabled:opacity-60";

const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return str(v).trim() !== "" && isFinite(n) ? n : null;
};
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** Rental: days from the dates, total = rate x days, balance = total - deposit (unless typed). */
function rentalCalc(d: DocData, balanceManual: boolean): DocData {
  const out = { ...d };
  const p = str(d.pickup_date), r = str(d.return_date);
  if (p && r && !str(d.days)) {
    const span = Math.round((new Date(r).getTime() - new Date(p).getTime()) / 86400000);
    if (span > 0) out.days = String(span);
  }
  const rate = num(out.daily_rate), days = num(out.days);
  out.total = rate !== null && days !== null ? fmt(rate * days) : str(d.total);
  const total = num(out.total), deposit = num(out.deposit);
  if (!balanceManual) out.balance = total !== null ? fmt(Math.max(total - (deposit ?? 0), 0)) : "";
  return out;
}

export default function DocumentForm({ type, docId, prefill, userName, dealerPhone, onClose, onSaved }: DocumentFormProps) {
  const info = DOC_INFO[type];
  const sections = DOC_FORMS[type];
  const [loading, setLoading] = useState(!!docId);
  const [saving, setSaving] = useState<"draft" | "final" | null>(null);
  // Final copies print with the company stamp unless the owner turns it off (drafts never do).
  const [stampOn, setStampOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [data, setData] = useState<DocData>(() => ({ ...newDocDefaults(type, { userName, dealerPhone }), ...(prefill || {}) }));
  const origDate = useRef("");
  const wordsManual = useRef(false);
  const balanceManual = useRef(false);


  useEffect(() => {
    if (!docId) return;
    let alive = true;
    docApi<DocDetail>(`/${type}/${docId}`)
      .then((d) => {
        if (!alive) return;
        setDoc(d);
        const loaded = { ...d.data };
        origDate.current = str(loaded.date);
        if (loaded.date) loaded.date = str(loaded.date).slice(0, 10);
        wordsManual.current = !!str(loaded.amount_words) && str(loaded.amount_words) !== birrInAmharicWords(str(loaded.amount));
        balanceManual.current = type === "rental" && !!str(loaded.balance);
        setData(loaded);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [docId, type]);

  const set = (patch: DocData) => {
    setData((prev) => {
      let next = { ...prev, ...patch };
      if (type === "downpayment" && "amount" in patch && !wordsManual.current) {
        next.amount_words = birrInAmharicWords(str(next.amount));
      }
      if (type === "rental") {
        if ("pickup_date" in patch || "return_date" in patch) next.days = "";
        next = rentalCalc(next, balanceManual.current);
      }
      return next;
    });
    if (missing.length) setMissing((m) => m.filter((k) => !(k in patch)));
  };

  const onField = (f: FieldDef, value: string) => {
    if (f.key === "amount_words") wordsManual.current = value.trim() !== "";
    if (f.key === "balance") balanceManual.current = value.trim() !== "";
    set({ [f.key]: value });
  };

  const save = async (status: "draft" | "final", print: boolean) => {
    setSaving(status);
    setError(null);
    setMissing([]);
    try {
      // Keep the original time of day when the date wasn't changed (gate pass slips print it).
      const out = origDate.current && data.date === origDate.current.slice(0, 10) ? { ...data, date: origDate.current } : data;
      const body = JSON.stringify({ status, data: out });
      const saved = docId || doc
        ? await docApi<DocDetail>(`/${type}/${doc?.id ?? docId}`, { method: "PUT", body })
        : await docApi<DocDetail>(`/${type}`, { method: "POST", body });
      let note: string | undefined;
      // Remote release: send a new final pass straight to the gatekeepers' Telegram.
      if (type === "gatepass" && !docId && status === "final" && data.send_telegram === true) {
        note = await sendPassToGate(saved.id);
      }
      onSaved(saved, print, note, stampOn);
    } catch (e) {
      const err = e as DocApiError;
      setError(err.message);
      if (err.missing?.length) setMissing(err.missing);
    } finally {
      setSaving(null);
    }
  };

  const isFinal = doc?.status === "final";
  const number = doc?.number || `${info.prefix}-…`;
  const labelFor = useMemo(() => {
    const m: Record<string, string> = {};
    sections.forEach((s) => s.fields.forEach((f) => (m[f.key] = `${f.am} (${f.en})`)));
    return m;
  }, [sections]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${info.en} form`} className="fixed inset-0 z-[60] bg-black flex flex-col text-white">
      {/* Header */}
      <div className="shrink-0 bg-zinc-900 border-b border-zinc-800 pt-[env(safe-area-inset-top)]">
        <div className="max-w-3xl mx-auto flex items-center gap-2 px-3 h-16">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="truncate text-sm sm:text-base font-black">{info.am}</h2>
              <span className="shrink-0 text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-amber-300">{number}</span>
            </div>
            <p className="truncate text-[11px] text-zinc-400">
              {docId ? "Edit" : "New"} {info.en}
              {doc && ` · ${doc.status === "draft" ? "Draft" : "Final"}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close / ዝጋ"
            className="h-11 w-11 shrink-0 flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 space-y-4 pb-8">
          {loading ? (
            <div className="py-20 flex justify-center text-zinc-400">
              <Loader2 className="animate-spin" />
            </div>
          ) : (
            sections.map((sec) => (
              <section key={sec.en} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 sm:p-4 space-y-3 min-w-0">
                <div>
                  <h3 className="text-sm font-black text-amber-400">{sec.am}</h3>
                  <p className="text-[11px] text-zinc-500">{sec.en}</p>
                </div>
                {sec.special === "vehicle" && <VehiclePicker type={type} onPick={(hit) => set(vehicleFill(type, hit))} linkedId={data.vehicle_id as number | undefined} />}
                {sec.special === "booking" && <BookingPicker selected={data.rental_booking_id as number | undefined} onPick={(d) => { balanceManual.current = false; set(d); }} />}
                {sec.special === "belongings" && <Belongings value={(data.belongings as { item_name: string; quantity: string }[]) || []} onChange={(b) => set({ belongings: b })} />}
                {sec.special === "checklist" && <Checklist value={(data.checklist as Record<string, string>) || {}} onChange={(c) => set({ checklist: c })} />}
                {sec.fields.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {sec.fields.map((f) => (
                      <Field key={f.key} f={f} value={str(data[f.key])} invalid={missing.includes(f.key)} onChange={(v) => onField(f, v)} />
                    ))}
                  </div>
                )}
                {sec.special === "telegram" && (
                  docId ? (
                    <p className="text-xs text-zinc-400">Use the Telegram buttons on the pass in the list to re-send it, give the driver his link or cancel it.</p>
                  ) : (
                    <label className="flex items-start gap-3 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-5 w-5 accent-sky-500"
                        checked={data.send_telegram === true}
                        onChange={(e) => set({ send_telegram: e.target.checked })}
                      />
                      <span className="text-sm">
                        <span className="font-bold">Send to Telegram · ለበር ጠባቂ ላክ</span>
                        <span className="block text-[11px] text-zinc-400">
                          All active gatekeepers with Telegram linked get the pass with Confirm exit / Reject buttons.
                        </span>
                      </span>
                    </label>
                  )
                )}
                {sec.special === "publish" && !docId && (
                  <label className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-5 w-5 accent-amber-500"
                      checked={data.publish_to_showroom === true}
                      onChange={(e) => set({ publish_to_showroom: e.target.checked })}
                    />
                    <span className="text-sm">
                      <span className="font-bold">በድረ-ገጹ ላይ አሳይ</span>
                      <span className="block text-[11px] text-zinc-500">Also list this car in the showroom</span>
                    </span>
                  </label>
                )}
              </section>
            ))
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 bg-zinc-950 border-t border-zinc-800 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="max-w-3xl mx-auto px-3 space-y-2">
          {error && (
            <div role="alert" className="text-xs rounded-xl border border-red-500/40 bg-red-500/10 text-red-300 px-3 py-2">
              {error}
              {missing.length > 0 && <span className="block mt-0.5 text-red-200">{missing.map((k) => labelFor[k] || k).join(" · ")}</span>}
            </div>
          )}
          <label className="flex items-center justify-between gap-3 rounded-xl bg-zinc-900 border border-zinc-800 px-3 min-h-11 cursor-pointer select-none">
            <span className="flex items-center gap-2 text-xs text-zinc-300">
              <Stamp size={15} className={stampOn ? "text-sky-300" : "text-zinc-500"} />
              <span>
                <b className="text-white">Stamp</b> · ማህተም
                <span className="text-zinc-500"> · on the final printed copy (drafts never get it)</span>
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={stampOn}
              onChange={(e) => setStampOn(e.target.checked)}
              className="h-5 w-5 shrink-0 accent-sky-500"
              aria-label="Print the final copy with the company stamp"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!!saving || loading || isFinal}
              onClick={() => save("draft", false)}
              title={isFinal ? "Final documents stay final" : "Save without required fields"}
              className="h-12 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {saving === "draft" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Save draft
            </button>
            <button
              type="button"
              disabled={!!saving || loading}
              onClick={() => save("final", true)}
              className="h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving === "final" ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
              Save &amp; Print
            </button>
          </div>
          {type === "gatepass" && !isFinal && (
            <p className="text-[11px] text-zinc-500 text-center">Save &amp; Print finalizes the pass and marks the car as released. A draft keeps it in the lot.</p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------- pieces

function Field({ f, value, invalid, onChange }: { f: FieldDef; value: string; invalid: boolean; onChange: (v: string) => void }) {
  const id = `docf-${f.key}`;
  const cls = `${inputCls} ${invalid ? "!border-red-500" : ""} ${f.readOnly ? "bg-zinc-900 text-amber-300 font-bold" : ""}`;
  return (
    <div className={`min-w-0 ${f.wide || f.kind === "textarea" ? "sm:col-span-2" : ""}`}>
      <label htmlFor={id} className="block text-xs font-bold text-zinc-200 mb-1">
        {f.am} {f.required && <span className="text-amber-500">*</span>}
        <span className="font-normal text-zinc-500"> · {f.en}</span>
      </label>
      {f.kind === "textarea" ? (
        <textarea id={id} value={value} rows={3} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} className={`${cls} h-auto py-2`} />
      ) : f.kind === "select" ? (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
          {!f.options?.includes(value) && value && <option value={value}>{value}</option>}
          {f.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={f.kind === "date" ? "date" : f.kind === "time" ? "time" : f.kind === "datetime" ? "datetime-local" : f.kind === "tel" ? "tel" : "text"}
          inputMode={f.kind === "money" || f.kind === "number" ? "decimal" : undefined}
          value={value}
          readOnly={f.readOnly}
          placeholder={f.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        />
      )}
    </div>
  );
}

function VehiclePicker({ type, onPick, linkedId }: { type: DocType; onPick: (h: LookupHit) => void; linkedId?: number }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<LookupHit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const t = setTimeout(() => {
      setBusy(true);
      docApi<LookupHit[]>(`/lookup?q=${encodeURIComponent(q.trim())}`)
        .then((r) => {
          if (!alive) return;
          // Gate pass: cars still in the lot first.
          const sorted = type === "gatepass" ? [...r].sort((a, b) => Number(b.is_in_lot === true) - Number(a.is_in_lot === true)) : r;
          setHits(sorted);
        })
        .catch(() => alive && setHits([]))
        .finally(() => alive && setBusy(false));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, open, type]);

  return (
    <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/60 p-2.5 space-y-2">
      <div className="flex items-center gap-2 text-[11px] text-zinc-400">
        <Car size={14} className="text-amber-500 shrink-0" />
        <span className="min-w-0">
          {type === "gatepass" ? "Pick the car leaving (cars in the lot first)" : "Pick from inventory / lot to fill the car details"}
          {linkedId ? <span className="text-emerald-400"> · linked to vehicle #{linkedId}</span> : null}
        </span>
      </div>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="ሰሌዳ / Plate or make…"
          aria-label="Search vehicle by plate or name"
          className={`${inputCls} pl-9`}
        />
      </div>
      {picked && <p className="text-[11px] text-emerald-400 flex items-center gap-1"><Check size={12} /> {picked}</p>}
      {open && (
        <ul className="max-h-60 overflow-y-auto divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900">
          {busy && hits.length === 0 && <li className="p-3 text-xs text-zinc-500">Searching…</li>}
          {!busy && hits.length === 0 && <li className="p-3 text-xs text-zinc-500">No car found. Type the details below.</li>}
          {hits.map((h) => (
            <li key={`${h.source}-${h.vehicle_id ?? ""}-${h.lot_intake_id ?? ""}`}>
              <button
                type="button"
                onClick={() => {
                  onPick(h);
                  setPicked(`${h.label}${h.plate_number ? ` · ${h.plate_number}` : ""}`);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2.5 hover:bg-zinc-800 flex items-center gap-2 min-w-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{h.label || h.vehicle_type}</span>
                  <span className="block truncate text-[11px] text-zinc-400">
                    {h.plate_number || "no plate"}
                    {h.owner_name ? ` · ${h.owner_name}` : ""}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    h.source === "intake"
                      ? h.is_in_lot
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-zinc-700 text-zinc-300"
                      : "bg-sky-500/15 text-sky-300"
                  }`}
                >
                  {h.source === "intake" ? (h.is_in_lot ? "In lot" : "Released") : "Inventory"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface BookingRow {
  id: number;
  customer_name: string;
  customer_phone: string;
  start_date: string;
  end_date: string;
  status: string;
  vehicle?: { make: string; model: string; year: number } | null;
}

function BookingPicker({ selected, onPick }: { selected?: number; onPick: (d: DocData) => void }) {
  const [rows, setRows] = useState<BookingRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${getApiBaseUrl()}/api/admin/rentals`, { headers: { Authorization: `Bearer ${getDocToken() || ""}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]));
  }, []);

  const pick = async (id: string) => {
    if (!id) return;
    setBusy(true);
    setErr(null);
    try {
      onPick(await docApi<DocData>(`/rental-booking/${id}`));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <label htmlFor="docf-booking" className="flex items-center gap-1.5 text-xs font-bold text-zinc-200">
        <CalendarClock size={14} className="text-amber-500" /> Rental booking
        {busy && <Loader2 size={12} className="animate-spin" />}
      </label>
      <select id="docf-booking" value={selected ? String(selected) : ""} onChange={(e) => pick(e.target.value)} className={inputCls}>
        <option value="">{rows === null ? "Loading…" : rows.length ? "— Choose a booking to fill the form —" : "No rental bookings yet"}</option>
        {(rows || []).map((b) => (
          <option key={b.id} value={b.id}>
            #{b.id} {b.customer_name} · {b.vehicle ? `${b.vehicle.make} ${b.vehicle.model}` : ""} · {b.start_date.slice(0, 10)} ({b.status})
          </option>
        ))}
      </select>
      {err && <p className="text-[11px] text-red-400">{err}</p>}
    </div>
  );
}

function Belongings({ value, onChange }: { value: { item_name: string; quantity: string }[]; onChange: (v: { item_name: string; quantity: string }[]) => void }) {
  const update = (i: number, patch: Partial<{ item_name: string; quantity: string }>) =>
    onChange(value.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  return (
    <div className="space-y-2">
      {value.map((b, i) => (
        <div key={i} className="flex gap-2 min-w-0">
          <input
            value={b.item_name}
            onChange={(e) => update(i, { item_name: e.target.value })}
            placeholder="Item / እቃ"
            aria-label={`Item ${i + 1}`}
            className={`${inputCls} flex-1 min-w-0`}
          />
          <input
            value={b.quantity}
            onChange={(e) => update(i, { quantity: e.target.value })}
            aria-label={`Quantity ${i + 1}`}
            className={`${inputCls} !w-16 text-center`}
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            aria-label={`Remove item ${i + 1}`}
            className="h-11 w-11 shrink-0 rounded-xl bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-300 flex items-center justify-center"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { item_name: "", quantity: "1" }])}
        className="h-10 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold flex items-center gap-1.5"
      >
        <Plus size={14} /> Add item
      </button>
    </div>
  );
}

function Checklist({ value, onChange }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const setMark = (k: string, m: "ok" | "no") => {
    const next = { ...value };
    if (next[k] === m) delete next[k];
    else next[k] = m;
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(Object.fromEntries(RENTAL_CHECKLIST.map((c) => [c.key, "ok"])))}
          className="h-9 px-3 rounded-lg bg-emerald-500/15 text-emerald-300 text-xs font-bold"
        >
          ✓ All present
        </button>
        <button type="button" onClick={() => onChange({})} className="h-9 px-3 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-bold">
          Clear
        </button>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {RENTAL_CHECKLIST.map((c) => (
          <li key={c.key} className="min-w-0 flex items-center gap-2 rounded-xl bg-zinc-950 border border-zinc-800 pl-3 pr-1.5 py-1.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{c.am}</span>
              <span className="block truncate text-[10px] text-zinc-500">{c.en}</span>
            </span>
            {(["ok", "no"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={value[c.key] === m}
                aria-label={`${c.en}: ${m === "ok" ? "present / works" : "missing / broken"}`}
                onClick={() => setMark(c.key, m)}
                className={`h-10 w-10 shrink-0 rounded-lg text-base font-black border ${
                  value[c.key] === m
                    ? m === "ok"
                      ? "bg-emerald-500 text-black border-emerald-400"
                      : "bg-red-500 text-white border-red-400"
                    : "bg-zinc-900 text-zinc-500 border-zinc-700"
                }`}
              >
                {m === "ok" ? "✓" : "X"}
              </button>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** POST .../send; returns a short result line for the toast (never throws). */
export async function sendPassToGate(passId: number): Promise<string> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/superadmin/gate-passes/${passId}/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getDocToken() || ""}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return `Not sent to Telegram: ${typeof body.detail === "string" ? body.detail : `HTTP ${res.status}`}`;
    const names: string[] = body.recipients || [];
    return names.length ? `Sent to ${names.join(", ")} on Telegram` : "Not sent: no gatekeeper reachable";
  } catch {
    return "Not sent to Telegram (network error)";
  }
}
