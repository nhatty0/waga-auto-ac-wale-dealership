"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowLeft,
  Ban,
  QrCode,
  Send,
  CarFront,
  ClipboardList,
  DoorOpen,
  Eye,
  FileSignature,
  HandCoins,
  KeyRound,
  Layers,
  Loader2,
  LogOut,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import type { Dealership, GatePass, LotIntake, VehicleHandover } from "@/types";
import {
  DOC_INFO,
  DOC_TYPES,
  DocData,
  DocDetail,
  DocItem,
  DocSummary,
  DocType,
  LookupHit,
  docApi,
  docDate,
  getDocToken,
  str,
  vehicleFill,
} from "@/lib/docCenter";
import { formatBirr } from "@/lib/amharicNumber";
import { getApiBaseUrl } from "@/lib/api";
import { dealerPhonesText } from "@/lib/contact";
import { receivingSheetDayKey } from "@/lib/documents";
import DocumentForm, { sendPassToGate } from "@/components/documents/DocumentForm";
import QrLinkModal from "@/components/QrLinkModal";
import DocPrintModal from "@/components/documents/DocPrintModal";
import { DownPaymentSheet, RentalAgreementSheet } from "@/components/documents/DocSheets";
import GatePassModal from "@/components/GatePassModal";
import HandoverPrintModal from "@/components/HandoverPrintModal";
import ReceivingSheetPrint from "@/components/ReceivingSheetPrint";
import BatchGatePassModal from "@/components/BatchGatePassModal";

const ICONS: Record<DocType, typeof ClipboardList> = {
  intake: ClipboardList,
  gatepass: DoorOpen,
  handover: FileSignature,
  downpayment: HandCoins,
  rental: KeyRound,
};

const ACCENT: Record<DocType, { tile: string; icon: string; chip: string }> = {
  intake: { tile: "hover:border-emerald-500/60", icon: "bg-emerald-500/15 text-emerald-300", chip: "text-emerald-300" },
  gatepass: { tile: "hover:border-amber-500/60", icon: "bg-amber-500/15 text-amber-300", chip: "text-amber-300" },
  handover: { tile: "hover:border-sky-500/60", icon: "bg-sky-500/15 text-sky-300", chip: "text-sky-300" },
  downpayment: { tile: "hover:border-violet-500/60", icon: "bg-violet-500/15 text-violet-300", chip: "text-violet-300" },
  rental: { tile: "hover:border-rose-500/60", icon: "bg-rose-500/15 text-rose-300", chip: "text-rose-300" },
};

type StatusFilter = "active" | "draft" | "final" | "archived";
const STATUS_CHIPS: { id: StatusFilter; label: string }[] = [
  { id: "active", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "final", label: "Final" },
  { id: "archived", label: "Archived" },
];

interface FormState {
  type: DocType;
  id?: number;
  prefill?: DocData;
}
interface PrintState {
  doc: DocDetail;
  auto: boolean;
}

interface PassLinks {
  status: string;
  verify_url: string;
  driver_link: string | null;
  share_text: string;
}

async function gateFetch<T = PassLinks>(path: string, method: "GET" | "POST"): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}/api/superadmin${path}`, { method, headers: { Authorization: `Bearer ${getDocToken() || ""}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.detail === "string" ? body.detail : `HTTP ${res.status}`);
  return body as T;
}

const readParam = (k: string) => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(k));

function setParams(patch: Record<string, string | null>) {
  const url = new URL(window.location.href);
  Object.entries(patch).forEach(([k, v]) => (v === null ? url.searchParams.delete(k) : url.searchParams.set(k, v)));
  window.history.replaceState(null, "", url.toString());
}

/** Legacy print components take the old record shapes; build them from a Document Center record. */
const toGatePass = (d: DocDetail): GatePass => ({
  id: d.id,
  slip_number: d.number,
  date: str(d.data.date),
  driver_name: str(d.data.driver_name),
  plate_number: str(d.data.plate_number),
  release_reason: str(d.data.release_reason),
  authorized_by: str(d.data.authorized_by),
  lot_intake_id: (d.data.lot_intake_id as number) ?? null,
  verify_token: str(d.data.verify_token) || null,
});
const toHandover = (d: DocDetail): VehicleHandover => ({
  id: d.id,
  contract_number: d.number,
  date: str(d.data.date),
  owner_full_name: str(d.data.owner_full_name),
  owner_phone: str(d.data.owner_phone),
  owner_subcity: str(d.data.owner_subcity) || null,
  owner_woreda: str(d.data.owner_woreda) || null,
  owner_house_no: str(d.data.owner_house_no) || null,
  vehicle_type: str(d.data.vehicle_type),
  manufacture_year: (d.data.manufacture_year as number) ?? null,
  chassis_number: str(d.data.chassis_number) || null,
  engine_number: str(d.data.engine_number) || null,
  horsepower: str(d.data.horsepower) || null,
  color: str(d.data.color) || null,
  plate_number: str(d.data.plate_number),
  belongings_json: JSON.stringify(d.data.belongings || []),
  agreed_selling_price: (d.data.agreed_selling_price as number) ?? 0,
  commission_or_net_payout: str(d.data.commission_or_net_payout) || null,
  vehicle_id: (d.data.vehicle_id as number) ?? null,
});

export default function DocumentCenter({ userName }: { userName?: string }) {
  const [view, setView] = useState<DocType | null>(() => {
    const t = readParam("doc");
    return DOC_TYPES.includes(t as DocType) ? (t as DocType) : null;
  });
  const [summary, setSummary] = useState<DocSummary | null>(null);
  const [items, setItems] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [lotFilter, setLotFilter] = useState<"all" | "in" | "out">("all");
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  // ?new=TYPE (without a vehicle) opens a blank form straight away.
  const [form, setForm] = useState<FormState | null>(() => {
    const t = readParam("new") as DocType | null;
    return t && DOC_TYPES.includes(t) && !readParam("vehicle") ? { type: t } : null;
  });
  const [print, setPrint] = useState<PrintState | null>(null);
  const [sheetIntakes, setSheetIntakes] = useState<{ list: LotIntake[]; day: string } | null>(null);
  const [batchIntakes, setBatchIntakes] = useState<LotIntake[] | null>(null);
  const [batchPicker, setBatchPicker] = useState<LotIntake[] | null>(null);
  const [dealership, setDealership] = useState<Dealership | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [driverLinks, setDriverLinks] = useState<{ item: DocItem; links: PassLinks } | null>(null);

  const showToast = useCallback((text: string, error = false) => {
    setToast({ text, error });
    setTimeout(() => setToast(null), 3500);
  }, []);
  const refresh = () => setReloadKey((k) => k + 1);

  // Dealership (letterhead phones / e-mail).
  useEffect(() => {
    fetch(`${getApiBaseUrl()}/api/admin/dealership`, { headers: { Authorization: `Bearer ${getDocToken() || ""}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setDealership(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    docApi<DocSummary>("/summary").then(setSummary).catch(() => {});
  }, [reloadKey]);

  // Deep links from a vehicle: ?section=documents&doc=TYPE&open=ID or &new=TYPE&vehicle=ID
  useEffect(() => {
    const openId = Number(readParam("open"));
    const newType = readParam("new") as DocType | null;
    const vehicleId = Number(readParam("vehicle"));
    const t = readParam("doc") as DocType | null;
    if (t && DOC_TYPES.includes(t) && openId) {
      docApi<DocDetail>(`/${t}/${openId}`).then((d) => setPrint({ doc: d, auto: false })).catch((e) => showToast(e.message, true));
    } else if (newType && DOC_TYPES.includes(newType)) {
      if (vehicleId) {
        docApi<LookupHit[]>(`/lookup?vehicle_id=${vehicleId}`)
          .then((hits) => {
            setForm({ type: newType, prefill: hits[0] ? vehicleFill(newType, hits[0]) : { vehicle_id: vehicleId } });
          })
          .catch(() => setForm({ type: newType, prefill: { vehicle_id: vehicleId } }));
      }
    }
    if (openId || newType) setParams({ open: null, new: null, vehicle: null });
  }, [showToast]);

  // List
  useEffect(() => {
    if (!view) return;
    let alive = true;
    const t = setTimeout(() => {
      setLoading(true);
      setListError(null);
      const p = new URLSearchParams({ status });
      if (q.trim()) p.set("q", q.trim());
      if (dateFrom) p.set("date_from", dateFrom);
      if (dateTo) p.set("date_to", dateTo);
      if (view === "intake" && lotFilter !== "all") p.set("in_lot", lotFilter === "in" ? "true" : "false");
      docApi<DocItem[]>(`/${view}?${p}`)
        .then((r) => alive && setItems(r))
        .catch((e) => alive && setListError(e.message))
        .finally(() => alive && setLoading(false));
    }, q ? 250 : 0);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [view, q, dateFrom, dateTo, status, lotFilter, reloadKey]);

  const openType = (t: DocType | null) => {
    setView(t);
    setItems([]);
    setQ("");
    setDateFrom("");
    setDateTo("");
    setStatus("active");
    setLotFilter("all");
    setParams({ doc: t });
  };

  const openPrint = async (it: DocItem, auto: boolean) => {
    setBusyId(`p${it.type}${it.id}`);
    try {
      const d = await docApi<DocDetail>(`/${it.type}/${it.id}`);
      await showPrint(d, auto);
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setBusyId(null);
    }
  };

  const showPrint = async (d: DocDetail, auto: boolean) => {
    if (d.type === "intake") {
      // Form 1 is the daily receiving sheet: print the whole day this car arrived.
      const res = await fetch(`${getApiBaseUrl()}/api/admin/lot-intakes?include_archived=true`, {
        headers: { Authorization: `Bearer ${getDocToken() || ""}` },
      });
      const list: LotIntake[] = res.ok ? await res.json() : [];
      const day = receivingSheetDayKey({ received_date: str(d.data.date) } as LotIntake);
      setSheetIntakes({ list, day });
      return;
    }
    setPrint({ doc: d, auto });
  };

  const share = async (it: DocItem) => {
    const info = DOC_INFO[it.type];
    const lines = [
      `${info.am} / ${info.en}`,
      `ቁጥር: ${it.number}`,
      it.date ? `ቀን: ${docDate(it.date)}` : "",
      it.title ? `መኪና: ${it.title}` : "",
      it.plate_number ? `ሰሌዳ: ${it.plate_number}` : "",
      it.party_name ? `ስም: ${it.party_name}${it.party_phone ? ` (${it.party_phone})` : ""}` : "",
      it.amount ? `መጠን: ${formatBirr(it.amount)} ብር` : "",
      "",
      dealership?.name || "AC WALE MARKET",
      dealerPhonesText(dealership),
    ].filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== ""));
    const text = lines.join("\n").trim();
    try {
      if (navigator.share) {
        await navigator.share({ title: `${info.en} ${it.number}`, text });
        return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied to clipboard: paste it in Telegram / SMS");
    } catch {
      showToast("Sharing is not available on this device", true);
    }
  };

  const act = async (it: DocItem, action: "archive" | "restore" | "delete") => {
    const info = DOC_INFO[it.type];
    if (action === "archive" && !window.confirm(`${info.am} ${it.number} ወደ ማህደር ይግባ?\nArchive it? You can restore it from the Archived list.`)) return;
    if (
      action === "delete" &&
      !window.confirm(`⚠️ ${it.number} ለዘለቄታው ይሰረዝ?\nDelete ${info.en} ${it.number} PERMANENTLY? This cannot be undone.`)
    )
      return;
    setBusyId(`${action}${it.type}${it.id}`);
    try {
      if (action === "delete") await docApi(`/${it.type}/${it.id}`, { method: "DELETE" });
      else await docApi(`/${it.type}/${it.id}/${action}`, { method: "POST" });
      showToast(action === "archive" ? `${it.number} archived` : action === "restore" ? `${it.number} restored` : `${it.number} deleted`);
      refresh();
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setBusyId(null);
    }
  };

  const gateAction = async (it: DocItem, action: "send" | "driver" | "cancel") => {
    if (
      action === "cancel" &&
      !window.confirm(`Cancel gate pass ${it.number}?\nThe gatekeepers' buttons will say "Cancelled, do not release" and the car goes back to the lot.`)
    )
      return;
    setBusyId(`${action}${it.type}${it.id}`);
    try {
      if (action === "send") {
        const note = await sendPassToGate(it.id);
        showToast(note, note.startsWith("Not sent"));
      } else if (action === "cancel") {
        await gateFetch(`/gate-passes/${it.id}/cancel`, "POST");
        showToast(`${it.number} cancelled`);
      } else {
        setDriverLinks({ item: it, links: await gateFetch(`/gate-passes/${it.id}/links`, "GET") });
      }
      if (action !== "driver") refresh();
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setBusyId(null);
    }
  };

  const sharePass = async (text: string) => {
    try {
      if (navigator.share) return await navigator.share({ text });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showToast("Copied: paste it in WhatsApp / SMS");
    } catch {
      showToast("Sharing is not available on this device", true);
    }
  };

  const openBatch = async () => {
    try {
      const rows = await docApi<DocItem[]>(`/intake?in_lot=true&status=active`);
      const res = await fetch(`${getApiBaseUrl()}/api/admin/lot-intakes?in_lot=true`, {
        headers: { Authorization: `Bearer ${getDocToken() || ""}` },
      });
      const full: LotIntake[] = res.ok ? await res.json() : [];
      const allowed = new Set(rows.filter((r) => r.status !== "draft").map((r) => r.id));
      const list = full.filter((i) => allowed.has(i.id));
      if (!list.length) return showToast("No cars in the lot to release", true);
      setBatchPicker(list);
    } catch (e) {
      showToast((e as Error).message, true);
    }
  };

  const sum = (t: DocType) => summary?.[t];

  // ------------------------------------------------------------ render
  return (
    <div className="space-y-5 min-w-0">
      {!view ? (
        <>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-black">ሰነዶች · Documents</h2>
              <p className="text-xs text-zinc-400">Every document is numbered, dated and kept. Tap a type to see its list.</p>
            </div>
            <button
              type="button"
              onClick={refresh}
              aria-label="Refresh counts"
              className="h-11 w-11 shrink-0 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-300 hover:text-white"
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {DOC_TYPES.map((t) => {
              const Icon = ICONS[t];
              const s = sum(t);
              return (
                <li key={t} className="min-w-0">
                  <div className={`h-full bg-zinc-900 border border-zinc-800 ${ACCENT[t].tile} rounded-2xl p-4 flex flex-col gap-3 transition`}>
                    <button type="button" onClick={() => openType(t)} className="flex items-start gap-3 text-left min-w-0">
                      <span className={`h-12 w-12 shrink-0 rounded-xl flex items-center justify-center ${ACCENT[t].icon}`}>
                        <Icon size={24} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-black leading-snug">{DOC_INFO[t].am}</span>
                        <span className="block text-xs text-zinc-400">{DOC_INFO[t].en}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-2xl font-black tabular-nums">{s ? s.active : "–"}</span>
                        <span className="block text-[10px] text-zinc-500 whitespace-nowrap">
                          {s?.draft ? `${s.draft} draft` : t === "intake" && s?.in_lot !== undefined ? `${s.in_lot} in lot` : "saved"}
                        </span>
                      </span>
                    </button>
                    <div className="grid grid-cols-2 gap-2 mt-auto">
                      <button
                        type="button"
                        onClick={() => openType(t)}
                        className="h-11 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-bold"
                      >
                        Open list
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm({ type: t })}
                        className="h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-black flex items-center justify-center gap-1"
                      >
                        <Plus size={16} /> New
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <>
          {/* List header */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => openType(null)}
              aria-label="Back to document types"
              className="h-11 w-11 shrink-0 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-black">{DOC_INFO[view].am}</h2>
              <p className="truncate text-xs text-zinc-400">
                {DOC_INFO[view].en} · {loading ? "…" : `${items.length} shown`}
              </p>
            </div>
            {view === "gatepass" && (
              <button
                type="button"
                onClick={openBatch}
                title="Release up to 4 cars at once (2×2 A4)"
                className="h-11 px-3 shrink-0 rounded-xl bg-zinc-900 border border-zinc-700 text-xs font-bold flex items-center gap-1.5"
              >
                <Layers size={15} /> <span className="hidden min-[400px]:inline">Batch</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setForm({ type: view })}
              className="h-11 px-3 shrink-0 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-black flex items-center gap-1"
            >
              <Plus size={16} /> New
            </button>
          </div>

          {/* Filters */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 space-y-2.5 min-w-0">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Plate, name, phone or number…"
                aria-label="Search documents"
                className="w-full h-11 rounded-xl bg-zinc-950 border border-zinc-700 pl-9 pr-9 text-sm focus:outline-none focus:border-amber-500"
              />
              {q && (
                <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center text-zinc-400">
                  <X size={15} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="min-w-0 text-[11px] text-zinc-400">
                From
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-0.5 w-full h-10 rounded-xl bg-zinc-950 border border-zinc-700 px-2 text-sm text-white" />
              </label>
              <label className="min-w-0 text-[11px] text-zinc-400">
                To
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-0.5 w-full h-10 rounded-xl bg-zinc-950 border border-zinc-700 px-2 text-sm text-white" />
              </label>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status filter">
              {STATUS_CHIPS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={status === c.id}
                  onClick={() => setStatus(c.id)}
                  className={`h-9 px-3 rounded-full text-xs font-bold border ${
                    status === c.id ? "bg-white text-black border-white" : "bg-zinc-950 text-zinc-300 border-zinc-700"
                  }`}
                >
                  {c.label}
                </button>
              ))}
              {view === "intake" &&
                (["all", "in", "out"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={lotFilter === f}
                    onClick={() => setLotFilter(f)}
                    className={`h-9 px-3 rounded-full text-xs font-bold border ${
                      lotFilter === f ? "bg-emerald-500 text-black border-emerald-400" : "bg-zinc-950 text-zinc-400 border-zinc-800"
                    }`}
                  >
                    {f === "all" ? "Lot: any" : f === "in" ? "In lot" : "Released"}
                  </button>
                ))}
              {(dateFrom || dateTo) && (
                <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); }} className="h-9 px-3 rounded-full text-xs text-zinc-400 underline">
                  Clear dates
                </button>
              )}
            </div>
          </div>

          {/* Rows */}
          {listError && <p className="text-sm text-red-400">{listError}</p>}
          {!loading && items.length === 0 && !listError && (
            <div className="text-center py-14 border border-dashed border-zinc-800 rounded-2xl text-sm text-zinc-500">
              {q || dateFrom || dateTo || status !== "active" ? "No documents match these filters." : "No documents yet. Tap New to create the first one."}
            </div>
          )}
          <ul className="grid grid-cols-1 gap-2.5">
            {items.map((it) => (
              <DocRow
                key={`${it.type}-${it.id}`}
                it={it}
                busyId={busyId}
                onView={() => openPrint(it, false)}
                onEdit={() => setForm({ type: it.type, id: it.id })}
                onPrint={() => openPrint(it, true)}
                onShare={() => share(it)}
                onArchive={() => act(it, "archive")}
                onRestore={() => act(it, "restore")}
                onDelete={() => act(it, "delete")}
                onGate={it.type === "gatepass" ? (action) => gateAction(it, action) : undefined}
                onRelease={
                  it.type === "intake" && it.extra.is_in_lot === true && it.status !== "archived"
                    ? () => setForm({ type: "gatepass", prefill: { lot_intake_id: it.id, plate_number: it.plate_number || "", vehicle_name: it.title || "", vehicle_id: it.vehicle_id ?? undefined } })
                    : undefined
                }
              />
            ))}
          </ul>
        </>
      )}

      {/* Form */}
      {form && (
        <DocumentForm
          type={form.type}
          docId={form.id}
          prefill={form.prefill}
          userName={userName}
          dealerPhone={dealership?.phone_number || ""}
          onClose={() => setForm(null)}
          onSaved={(d, doPrint, note) => {
            setForm(null);
            showToast(`${d.number} saved${d.status === "draft" ? " as draft" : ""}${note ? `. ${note}` : ""}`, !!note && note.startsWith("Not sent"));
            refresh();
            if (doPrint) showPrint(d, true).catch(() => {});
          }}
        />
      )}

      {/* Print / view */}
      {print && print.doc.type === "gatepass" && (
        <GatePassModal pass={toGatePass(print.doc)} vehicleName={str(print.doc.data.vehicle_name) || print.doc.title || ""} onClose={() => setPrint(null)} />
      )}
      {print && print.doc.type === "handover" && (
        <HandoverPrintModal handover={toHandover(print.doc)} dealership={dealership} onClose={() => setPrint(null)} />
      )}
      {print && print.doc.type === "downpayment" && (
        <DocPrintModal title={DOC_INFO.downpayment.am} number={print.doc.number} autoPrint={print.auto} onClose={() => setPrint(null)}>
          <DownPaymentSheet number={print.doc.number} data={print.doc.data} dealership={dealership} />
        </DocPrintModal>
      )}
      {print && print.doc.type === "rental" && (
        <DocPrintModal title={DOC_INFO.rental.am} number={print.doc.number} autoPrint={print.auto} onClose={() => setPrint(null)}>
          <RentalAgreementSheet number={print.doc.number} data={print.doc.data} dealership={dealership} />
        </DocPrintModal>
      )}
      {sheetIntakes && (
        <ReceivingSheetPrint
          intakes={sheetIntakes.list}
          initialDate={sheetIntakes.day}
          dealershipName={dealership?.name || "AC WALE MARKET"}
          onClose={() => setSheetIntakes(null)}
        />
      )}

      {/* Batch release: pick up to 4 cars, then the existing 2x2 A4 batch pass */}
      {batchPicker && (
        <BatchPicker
          intakes={batchPicker}
          onClose={() => setBatchPicker(null)}
          onNext={(sel) => {
            setBatchPicker(null);
            setBatchIntakes(sel);
          }}
        />
      )}
      {batchIntakes && (
        <BatchGatePassModal
          selectedIntakes={batchIntakes}
          currentUser={userName ? ({ full_name: userName } as never) : null}
          onClose={() => setBatchIntakes(null)}
          onSuccess={() => {
            showToast("Gate passes created");
            refresh();
          }}
        />
      )}

      {driverLinks &&
        (driverLinks.links.driver_link ? (
          <QrLinkModal
            title={`Driver: ${driverLinks.item.number}`}
            subtitle="The driver scans this, taps Start, and the bot sends him his pass."
            url={driverLinks.links.driver_link}
            openLabel="Open the driver link"
            onClose={() => setDriverLinks(null)}
            note={
              <>
                A bot can only message people who started it, so the driver opens this once. Status: <b>{driverLinks.links.status}</b>.
              </>
            }
          >
            <button
              type="button"
              onClick={() => sharePass(driverLinks.links.share_text)}
              className="w-full h-11 rounded-xl bg-emerald-500/15 text-emerald-300 text-sm font-bold flex items-center justify-center gap-2"
            >
              <Share2 size={16} /> Share text (WhatsApp / SMS)
            </button>
            <a href={driverLinks.links.verify_url} target="_blank" rel="noopener noreferrer" className="block text-center text-xs text-sky-300 underline">
              Open the verify page
            </a>
          </QrLinkModal>
        ) : (
          <QrLinkModal
            title={`Verify: ${driverLinks.item.number}`}
            subtitle="Telegram bot is not configured; share the verify page instead."
            url={driverLinks.links.verify_url}
            openLabel="Open verify page"
            onClose={() => setDriverLinks(null)}
          >
            <button
              type="button"
              onClick={() => sharePass(driverLinks.links.share_text)}
              className="w-full h-11 rounded-xl bg-emerald-500/15 text-emerald-300 text-sm font-bold"
            >
              Share text (WhatsApp / SMS)
            </button>
          </QrLinkModal>
        ))}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-[70] max-w-[calc(100vw-2rem)] px-4 py-2.5 rounded-xl text-sm font-bold shadow-2xl ${
            toast.error ? "bg-red-600 text-white" : "bg-emerald-500 text-black"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- row

const PASS_BADGE: Record<string, string> = {
  valid: "bg-emerald-500 text-black",
  used: "bg-zinc-600 text-white",
  expired: "bg-red-600 text-white",
  cancelled: "bg-red-600 text-white",
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-zinc-700 text-zinc-100",
  final: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  archived: "bg-red-500/10 text-red-300 border border-red-500/30",
};

function IconBtn({
  label,
  onClick,
  busy,
  tone = "default",
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  busy?: boolean;
  tone?: "default" | "danger" | "primary" | "telegram";
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const tones = {
    default: "bg-zinc-800 hover:bg-zinc-700 text-zinc-200",
    primary: "bg-amber-500 hover:bg-amber-400 text-black",
    danger: "bg-red-500/10 hover:bg-red-500/25 text-red-300 border border-red-500/30",
    telegram: "bg-sky-500 hover:bg-sky-400 text-white",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      aria-label={label}
      title={label}
      className={`h-11 min-w-0 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold disabled:opacity-40 ${tones[tone]}`}
    >
      {busy ? <Loader2 size={16} className="animate-spin" /> : children}
      <span className="leading-none truncate max-w-full px-0.5">{label}</span>
    </button>
  );
}

function DocRow({
  it,
  busyId,
  onView,
  onEdit,
  onPrint,
  onShare,
  onArchive,
  onRestore,
  onDelete,
  onRelease,
  onGate,
}: {
  it: DocItem;
  busyId: string | null;
  onView: () => void;
  onEdit: () => void;
  onPrint: () => void;
  onShare: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onRelease?: () => void;
  onGate?: (action: "send" | "driver" | "cancel") => void;
}) {
  const archived = it.status === "archived";
  const busy = (k: string) => busyId === `${k}${it.type}${it.id}`;
  const lotChip =
    it.type === "intake"
      ? it.extra.exited_at
        ? "Exited"
        : it.extra.is_in_lot
        ? "In lot"
        : "Released"
      : it.type === "gatepass"
      ? str(it.extra.release_reason)
      : "";
  const passStatus = it.type === "gatepass" ? str(it.extra.pass_status) : "";
  return (
    <li className={`min-w-0 bg-zinc-900 border border-zinc-800 rounded-2xl p-3 space-y-2.5 ${archived ? "opacity-80" : ""}`}>
      <div className="flex items-start gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-xs font-black text-amber-300">{it.number}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_BADGE[it.status]}`}>
              {it.status === "draft" ? "Draft" : it.status === "final" ? "Final" : "Archived"}
            </span>
            {passStatus && !archived && passStatus !== "draft" && (
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded uppercase ${PASS_BADGE[passStatus] || ""}`}>{passStatus}</span>
            )}
            {lotChip && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 truncate max-w-[10rem]">{lotChip}</span>}
          </div>
          <p className="mt-1 text-sm font-bold truncate">
            {it.title || "—"}
            {it.plate_number && <span className="text-zinc-400 font-mono font-normal"> · {it.plate_number}</span>}
          </p>
          <p className="text-xs text-zinc-400 truncate">
            {it.party_name || "—"}
            {it.party_phone && ` · ${it.party_phone}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-bold text-zinc-300">{docDate(it.date)}</p>
          {it.amount ? <p className="text-[11px] text-zinc-400 tabular-nums">{formatBirr(it.amount)} ብር</p> : null}
        </div>
      </div>
      {archived && it.archived_by && <p className="text-[11px] text-red-300/80">Archived by {it.archived_by}</p>}
      {it.type === "gatepass" && !archived && (
        <>
          <p className="text-[11px] text-zinc-400 truncate">
            {passStatus === "used"
              ? `✅ Exited ${str(it.extra.exited_local)} · ${str(it.extra.confirmed_by)}`
              : `Valid until ${str(it.extra.valid_until_local) || "—"}${it.extra.sent_at ? " · sent on Telegram" : ""}`}
          </p>
          {it.extra.rejected_by ? (
            <p className="text-[11px] text-red-300 truncate">
              ❌ Held by {str(it.extra.rejected_by)}
              {it.extra.reject_note ? `: ${str(it.extra.reject_note)}` : ""}
            </p>
          ) : null}
          {onGate && passStatus !== "draft" && (
            <div className="grid grid-cols-3 gap-1.5">
              <IconBtn
                label={it.extra.sent_at ? "Re-send" : "Send"}
                onClick={() => onGate("send")}
                busy={busy("send")}
                tone={passStatus === "valid" ? "telegram" : "default"}
                disabled={passStatus !== "valid"}
              >
                <Send size={16} />
              </IconBtn>
              <IconBtn label="Driver" onClick={() => onGate("driver")} busy={busy("driver")}>
                <QrCode size={16} />
              </IconBtn>
              <IconBtn
                label="Cancel"
                onClick={() => onGate("cancel")}
                busy={busy("cancel")}
                tone="danger"
                disabled={passStatus !== "valid" && passStatus !== "expired"}
              >
                <Ban size={16} />
              </IconBtn>
            </div>
          )}
        </>
      )}
      <div className={`grid gap-1.5 ${archived ? "grid-cols-4" : onRelease ? "grid-cols-6" : "grid-cols-5"}`}>
        <IconBtn label="View" onClick={onView} busy={busy("p")}>
          <Eye size={16} />
        </IconBtn>
        {!archived && (
          <IconBtn label="Edit" onClick={onEdit}>
            <Pencil size={16} />
          </IconBtn>
        )}
        <IconBtn label="Print" onClick={onPrint} tone="primary">
          <Printer size={16} />
        </IconBtn>
        <IconBtn label="Share" onClick={onShare}>
          <Share2 size={16} />
        </IconBtn>
        {onRelease && (
          <IconBtn label="Release" onClick={onRelease}>
            <LogOut size={16} />
          </IconBtn>
        )}
        {archived ? (
          <>
            <IconBtn label="Restore" onClick={onRestore} busy={busy("restore")}>
              <RotateCcw size={16} />
            </IconBtn>
            <IconBtn label="Delete" onClick={onDelete} busy={busy("delete")} tone="danger">
              <Trash2 size={16} />
            </IconBtn>
          </>
        ) : (
          <IconBtn label="Archive" onClick={onArchive} busy={busy("archive")}>
            <Archive size={16} />
          </IconBtn>
        )}
      </div>
    </li>
  );
}

function BatchPicker({ intakes, onClose, onNext }: { intakes: LotIntake[]; onClose: () => void; onNext: (sel: LotIntake[]) => void }) {
  const [sel, setSel] = useState<number[]>([]);
  const chosen = useMemo(() => intakes.filter((i) => sel.includes(i.id)), [intakes, sel]);
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] bg-black/80 flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-md bg-zinc-950 border border-zinc-800 rounded-t-2xl sm:rounded-2xl max-h-[90dvh] flex flex-col">
        <div className="flex items-center gap-2 p-3 border-b border-zinc-800">
          <CarFront size={18} className="text-amber-400" />
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm">Batch release</p>
            <p className="text-[11px] text-zinc-400">Pick up to 4 cars in the lot ({sel.length}/4)</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="h-11 w-11 rounded-xl bg-zinc-800 flex items-center justify-center">
            <X size={18} />
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto p-3 space-y-2">
          {intakes.map((i) => {
            const on = sel.includes(i.id);
            return (
              <li key={i.id}>
                <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${on ? "border-amber-500 bg-amber-500/10" : "border-zinc-800 bg-zinc-900"}`}>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-amber-500"
                    checked={on}
                    disabled={!on && sel.length >= 4}
                    onChange={() => setSel((s) => (on ? s.filter((x) => x !== i.id) : [...s, i.id]))}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold truncate">{i.vehicle_name}</span>
                    <span className="block text-[11px] text-zinc-400 truncate font-mono">{i.plate_number} · {i.owner_name}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="p-3 border-t border-zinc-800 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={!chosen.length}
            onClick={() => onNext(chosen)}
            className="w-full h-12 rounded-xl bg-amber-500 text-black font-black text-sm disabled:opacity-40"
          >
            Continue with {chosen.length} car{chosen.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}
