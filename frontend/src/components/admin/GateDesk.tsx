"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, DoorOpen, Loader2, Phone, RotateCw, Search, XCircle } from "lucide-react";
import { getApiBaseUrl } from "@/lib/api";

interface GateItem {
  id: number;
  number: string;
  status: string;
  car: string;
  plate: string;
  color: string;
  driver_name: string;
  driver_phone: string;
  reason: string;
  issued_by: string;
  valid_until: string;
  exited_at: string;
  confirmed_by: string | null;
  rejected_by: string | null;
  reject_note: string | null;
}

const token = () => (typeof window === "undefined" ? "" : localStorage.getItem("token") || localStorage.getItem("dealer_token") || "");

async function gateApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}/api/gate${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(typeof body.detail === "string" ? body.detail : `HTTP ${res.status}`), { status: res.status });
  return body as T;
}

/**
 * Gatekeeper screen (/admin, "gate" permission): passes that are valid right now, with big
 * Confirm exit / Reject buttons, and the cars that left recently. Same rules as the Telegram
 * buttons (one confirmation only; expired / cancelled passes are not listed).
 */
export default function GateDesk({ onUnauthorized }: { onUnauthorized?: (detail?: string) => void }) {
  const [valid, setValid] = useState<GateItem[]>([]);
  const [exited, setExited] = useState<GateItem[]>([]);
  const [now, setNow] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [flash, setFlash] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await gateApi<{ valid: GateItem[]; exited: GateItem[]; now: string }>("/passes");
      setValid(d.valid);
      setExited(d.exited);
      setNow(d.now);
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 401) onUnauthorized?.(err.message);
      else setFlash({ text: err.message, ok: false });
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    // Initial fetch + refresh every 20 s (passes sent from the owner's phone appear on their own).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const say = (text: string, ok: boolean) => {
    setFlash({ text, ok });
    setTimeout(() => setFlash(null), 4000);
  };

  const confirmExit = async (p: GateItem) => {
    if (!window.confirm(`${p.plate} · ${p.car}\n\nመውጣቱን ያረጋግጡ? Confirm this car is leaving now?`)) return;
    setBusy(p.id);
    try {
      const r = await gateApi<{ message: string }>(`/passes/${p.id}/confirm`, { method: "POST" });
      say(r.message, true);
    } catch (e) {
      say((e as Error).message, false);
    } finally {
      setBusy(null);
      load();
    }
  };

  const reject = async (p: GateItem) => {
    const note = window.prompt(`Why not release ${p.plate}? (the owner sees this)\nምክንያት:`, "");
    if (note === null) return;
    setBusy(p.id);
    try {
      const r = await gateApi<{ message: string }>(`/passes/${p.id}/reject`, { method: "POST", body: JSON.stringify({ note }) });
      say(r.message, true);
    } catch (e) {
      say((e as Error).message, false);
    } finally {
      setBusy(null);
      load();
    }
  };

  const match = useCallback(
    (p: GateItem) => {
      const t = q.trim().toLowerCase().replace(/[\s-]/g, "");
      if (!t) return true;
      return [p.plate, p.number, p.car, p.driver_name].some((v) => (v || "").toLowerCase().replace(/[\s-]/g, "").includes(t));
    },
    [q]
  );
  const shownValid = useMemo(() => valid.filter(match), [valid, match]);
  const shownExited = useMemo(() => exited.filter(match), [exited, match]);

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-black flex items-center gap-2">
            <DoorOpen size={20} className="text-amber-400 shrink-0" /> በር · Gate
          </h2>
          <p className="text-xs text-zinc-400">{now ? `Now ${now} · refreshes every 20 s` : "Valid release passes"}</p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          aria-label="Refresh"
          className="h-11 w-11 shrink-0 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300"
        >
          <RotateCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ሰሌዳ / Plate…"
          aria-label="Search by plate"
          className="w-full h-12 rounded-xl bg-zinc-950 border border-zinc-700 pl-9 pr-3 text-base focus:outline-none focus:border-amber-500"
        />
      </div>

      {flash && (
        <div role="status" className={`rounded-xl px-4 py-3 text-sm font-bold ${flash.ok ? "bg-emerald-500 text-black" : "bg-red-600 text-white"}`}>
          {flash.text}
        </div>
      )}

      <section className="space-y-2">
        <h3 className="text-xs font-black uppercase tracking-wide text-emerald-400">
          ዛሬ የሚሰሩ ፓሶች · Valid passes ({shownValid.length})
        </h3>
        {loading && valid.length === 0 ? (
          <div className="py-10 flex justify-center text-zinc-500">
            <Loader2 className="animate-spin" />
          </div>
        ) : shownValid.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500 border border-dashed border-zinc-800 rounded-2xl">
            No valid pass right now. Don&apos;t release a car without one.
            <br />
            ፓስ የሌለው መኪና አይልቀቁ።
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3">
            {shownValid.map((p) => (
              <li key={p.id} className="min-w-0 rounded-2xl border-2 border-emerald-500/40 bg-zinc-900 p-4 space-y-3">
                <div className="flex items-start gap-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-2xl font-black tracking-wide break-all">{p.plate}</p>
                    <p className="text-sm font-bold text-zinc-200 truncate">
                      {p.car}
                      {p.color && p.color !== "—" ? ` · ${p.color}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] font-mono font-bold px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-300">{p.number}</span>
                </div>
                <div className="text-xs text-zinc-300 space-y-1">
                  <p className="truncate">
                    ሹፌር / Driver: <b>{p.driver_name || "—"}</b>
                    {p.driver_phone && (
                      <a href={`tel:${p.driver_phone}`} className="ml-2 inline-flex items-center gap-1 text-sky-300">
                        <Phone size={12} /> {p.driver_phone}
                      </a>
                    )}
                  </p>
                  <p className="flex items-center gap-1 text-zinc-400">
                    <Clock size={12} /> Valid until <b className="text-zinc-200">{p.valid_until}</b> · by {p.issued_by}
                  </p>
                  {p.rejected_by && (
                    <p className="text-red-300">
                      ❌ Held by {p.rejected_by}
                      {p.reject_note ? `: ${p.reject_note}` : ""}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => confirmExit(p)}
                    className="h-14 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {busy === p.id ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                    Confirm exit · ወጥቷል
                  </button>
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => reject(p)}
                    aria-label={`Reject ${p.plate}`}
                    className="h-14 px-4 rounded-xl bg-red-500/10 border border-red-500/40 text-red-300 text-sm font-bold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <XCircle size={18} /> Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-black uppercase tracking-wide text-zinc-400">በቅርብ የወጡ · Recently exited ({shownExited.length})</h3>
        {shownExited.length === 0 ? (
          <p className="text-xs text-zinc-600">None in the last 48 hours.</p>
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-950">
            {shownExited.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2.5 min-w-0">
                <CheckCircle2 size={16} className="text-zinc-500 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-sm font-bold truncate">{p.plate}</span>
                  <span className="block text-[11px] text-zinc-500 truncate">
                    {p.car} · {p.number}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[11px] text-zinc-400">
                  <span className="block font-bold text-zinc-300">{p.exited_at}</span>
                  <span className="block truncate max-w-[7rem]">{p.confirmed_by}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
