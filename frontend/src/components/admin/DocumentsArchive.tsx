"use client";

import React, { useMemo, useState } from "react";
import { Archive, ClipboardList, DoorOpen, FileText, Loader2, Phone, Printer, RefreshCw, RotateCcw, Search, X } from "lucide-react";
import type { GatePass, LotIntake, VehicleHandover } from "@/types";
import { displayDate, localDayKey, normalizePlate, parseApiDate } from "@/lib/documents";

type DocKind = "intakes" | "passes" | "handovers";

interface Props {
  intakes: LotIntake[];
  handovers: VehicleHandover[];
  loading: boolean;
  isSuperadmin: boolean;
  /** Superadmin only: archived records are listed too (with a Restore button). */
  showArchived: boolean;
  onToggleArchived: (v: boolean) => void;
  onRefresh: () => void;
  onPrintIntake: (intake: LotIntake) => void;
  onPrintGatePass: (pass: GatePass, vehicleName: string) => void;
  onPrintHandover: (h: VehicleHandover) => void;
  onArchive: (kind: "intake" | "handover", id: number, label: string) => void;
  onRestore: (kind: "intake" | "handover", id: number) => void;
}

const TABS: { key: DocKind; am: string; en: string; icon: React.ElementType }[] = [
  { key: "intakes", am: "የርክክብ መዝገቦች", en: "Intake Records", icon: ClipboardList },
  { key: "passes", am: "መውጫ ፓሶች", en: "Gate Passes", icon: DoorOpen },
  { key: "handovers", am: "መረከቢያ ውሎች", en: "Handover Contracts", icon: FileText },
];

const time = (s?: string | null) => parseApiDate(s)?.getTime() ?? 0;

export default function DocumentsArchive(props: Props) {
  const { intakes, handovers, loading, isSuperadmin, showArchived } = props;
  const [kind, setKind] = useState<DocKind>("intakes");
  const [query, setQuery] = useState("");
  const [day, setDay] = useState("");

  // Gate passes live under their intake; flatten them with the intake's context.
  const passes = useMemo(
    () =>
      intakes.flatMap((i) =>
        (i.gate_passes || []).map((p) => ({ pass: p, intake: i }))
      ),
    [intakes]
  );

  const q = query.trim().toLowerCase();
  const qPlate = normalizePlate(query);
  const qDigits = query.replace(/\D/g, "");
  const matches = (fields: (string | null | undefined)[], plate: string, phone: string, date: string) => {
    if (day && localDayKey(date) !== day) return false;
    if (!q) return true;
    if (qPlate && normalizePlate(plate).includes(qPlate)) return true;
    if (qDigits.length >= 3 && phone.replace(/\D/g, "").includes(qDigits)) return true;
    if (displayDate(date).toLowerCase().includes(q)) return true;
    return fields.some((f) => (f || "").toLowerCase().includes(q));
  };

  const intakeRows = useMemo(
    () =>
      intakes
        .filter((i) => matches([i.vehicle_name, i.owner_name, i.received_by_name], i.plate_number, i.owner_phone, i.received_date))
        .sort((a, b) => time(b.received_date) - time(a.received_date) || b.id - a.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [intakes, q, day]
  );
  const passRows = useMemo(
    () =>
      passes
        .filter(({ pass, intake }) =>
          matches([pass.slip_number, pass.driver_name, intake.vehicle_name, intake.owner_name, pass.release_reason], pass.plate_number || intake.plate_number, intake.owner_phone, pass.date)
        )
        .sort((a, b) => time(b.pass.date) - time(a.pass.date) || b.pass.id - a.pass.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [passes, q, day]
  );
  const handoverRows = useMemo(
    () =>
      handovers
        .filter((h) => matches([h.contract_number, h.owner_full_name, h.vehicle_type, h.chassis_number], h.plate_number, h.owner_phone, h.date))
        .sort((a, b) => time(b.date) - time(a.date) || b.id - a.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handovers, q, day]
  );

  const counts: Record<DocKind, number> = { intakes: intakeRows.length, passes: passRows.length, handovers: handoverRows.length };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-black text-sm sm:text-base text-white flex items-center gap-2">
            <Archive size={18} className="text-amber-400 shrink-0" />
            <span>ሰነዶች (Documents)</span>
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            የተቀመጡ ህጋዊ ሰነዶች፡ ርክክብ፣ መውጫ ፓስ እና መረከቢያ ውል። ሁሉም በዳታቤዝ ውስጥ በቋሚነት ይቀመጣሉ እና እንደመጀመሪያው ይታተማሉ።
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isSuperadmin && (
            <label className="min-h-[44px] flex items-center gap-2 px-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => props.onToggleArchived(e.target.checked)}
                className="w-4 h-4 accent-amber-500"
              />
              የተቀመጡ (Show archived)
            </label>
          )}
          <button
            type="button"
            onClick={props.onRefresh}
            disabled={loading}
            aria-label="Refresh documents"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin text-amber-400" : ""} />
          </button>
        </div>
      </div>

      {/* Document type switcher */}
      <div role="tablist" aria-label="Document type" className="grid grid-cols-3 gap-1.5 bg-zinc-900 border border-zinc-800 p-1.5 rounded-2xl">
        {TABS.map(({ key, am, en, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={kind === key}
            data-doc-tab={key}
            onClick={() => setKind(key)}
            className={`min-h-[52px] flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 px-1.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-bold leading-tight text-center transition ${
              kind === key ? "bg-amber-500 text-black shadow-md shadow-amber-500/20" : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
            }`}
          >
            <span className="flex items-center gap-1">
              <Icon size={14} className="shrink-0" />
              <span className="font-mono">{counts[key]}</span>
            </span>
            <span>{am}</span>
            <span className="hidden sm:inline font-medium opacity-80">({en})</span>
          </button>
        ))}
      </div>

      {/* Search + date */}
      <div className="bg-zinc-900/60 border border-zinc-800/80 p-3 rounded-xl flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ሰሌዳ፣ ባለቤት፣ ስልክ ወይም ቁጥር ፈልግ..."
            aria-label="Search by plate, owner name, phone or number"
            className="w-full min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
          />
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            aria-label="Filter by date"
            className="flex-1 sm:w-44 min-h-[44px] bg-zinc-950 border border-zinc-800 rounded-lg px-3 text-sm text-white focus:outline-none focus:border-amber-500 [color-scheme:dark]"
          />
          {(query || day) && (
            <button
              type="button"
              onClick={() => { setQuery(""); setDay(""); }}
              aria-label="Clear search"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-zinc-800 text-zinc-300 hover:text-white"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Lists */}
      {loading && intakes.length === 0 && handovers.length === 0 ? (
        <div className="p-10 text-center text-zinc-500 text-xs flex flex-col items-center gap-2">
          <Loader2 size={22} className="animate-spin text-amber-500" />
          <span>ሰነዶችን በመጫን ላይ...</span>
        </div>
      ) : counts[kind] === 0 ? (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-8 text-center">
          <p className="text-sm text-zinc-300 font-semibold">ምንም ሰነድ አልተገኘም</p>
          <p className="text-xs text-zinc-500 mt-1">{query || day ? "ፍለጋውን ወይም ቀኑን ይቀይሩ።" : "No saved documents of this type yet."}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {kind === "intakes" &&
            intakeRows.map((i) => (
              <DocCard
                key={`i-${i.id}`}
                archived={i.archived_at}
                archivedBy={i.archived_by}
                title={`${i.vehicle_name}${i.year_of_production ? ` (${i.year_of_production})` : ""}`}
                badge={`#${i.id}`}
                plate={i.plate_number}
                date={i.received_date}
                owner={i.owner_name}
                phone={i.owner_phone}
                extra={i.is_in_lot ? "በግቢው ውስጥ (In Lot)" : "ወጥቷል (Released)"}
                printLabel="ርክክብ ሉህ (Form 1)"
                onPrint={() => props.onPrintIntake(i)}
                canArchive={isSuperadmin}
                onArchive={() => props.onArchive("intake", i.id, `${i.vehicle_name} ${i.plate_number}`)}
                onRestore={() => props.onRestore("intake", i.id)}
              />
            ))}
          {kind === "passes" &&
            passRows.map(({ pass, intake }) => (
              <DocCard
                key={`p-${pass.id}`}
                archived={intake.archived_at}
                archivedBy={intake.archived_by}
                title={intake.vehicle_name}
                badge={pass.slip_number}
                plate={pass.plate_number || intake.plate_number}
                date={pass.date}
                owner={intake.owner_name}
                phone={intake.owner_phone}
                extra={`ሹፌር: ${pass.driver_name} • ${pass.release_reason}`}
                printLabel="መውጫ ፓስ (Release Pass)"
                onPrint={() => props.onPrintGatePass(pass, intake.vehicle_name)}
                canArchive={false}
              />
            ))}
          {kind === "handovers" &&
            handoverRows.map((h) => (
              <DocCard
                key={`h-${h.id}`}
                archived={h.archived_at}
                archivedBy={h.archived_by}
                title={`${h.vehicle_type}${h.manufacture_year ? ` (${h.manufacture_year})` : ""}`}
                badge={h.contract_number}
                plate={h.plate_number}
                date={h.date}
                owner={h.owner_full_name}
                phone={h.owner_phone}
                extra={h.agreed_selling_price ? `የተስማሙበት ዋጋ: ${h.agreed_selling_price.toLocaleString()} ብር` : undefined}
                printLabel="መረከቢያ ውል (Contract)"
                onPrint={() => props.onPrintHandover(h)}
                canArchive={isSuperadmin}
                onArchive={() => props.onArchive("handover", h.id, h.contract_number)}
                onRestore={() => props.onRestore("handover", h.id)}
              />
            ))}
        </ul>
      )}
      {kind === "passes" && (
        <p className="text-[11px] text-zinc-500">
          መውጫ ፓሶች ከርክክብ መዝገባቸው ጋር ይቀመጣሉ (gate passes are kept and archived together with their intake record).
        </p>
      )}
    </div>
  );
}

function DocCard(p: {
  title: string;
  badge: string;
  plate: string;
  date: string;
  owner: string;
  phone: string;
  extra?: string;
  printLabel: string;
  onPrint: () => void;
  archived?: string | null;
  archivedBy?: string | null;
  canArchive: boolean;
  onArchive?: () => void;
  onRestore?: () => void;
}) {
  return (
    <li className={`bg-zinc-900 border rounded-2xl p-4 space-y-3 ${p.archived ? "border-zinc-800/60 opacity-75" : "border-zinc-800"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono font-black text-[11px] px-2 py-0.5 bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-md">
              {p.badge}
            </span>
            <span className="font-mono font-black text-[11px] px-2 py-0.5 bg-zinc-950 border border-zinc-700 rounded text-amber-300 whitespace-nowrap">
              {p.plate}
            </span>
            {p.archived && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                🗄️ Archived{p.archivedBy ? ` · ${p.archivedBy}` : ""}
              </span>
            )}
          </div>
          <h4 className="font-bold text-sm text-white break-words">{p.title}</h4>
        </div>
        <span className="shrink-0 text-xs text-zinc-400 whitespace-nowrap pt-0.5">{displayDate(p.date)}</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 text-xs">
        <span className="text-zinc-200 font-medium break-words min-w-0">{p.owner}</span>
        <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1.5 min-h-[44px] font-mono text-sm text-amber-400">
          <Phone size={13} /> {p.phone}
        </a>
      </div>
      {p.extra && <p className="text-[11px] text-zinc-400 break-words -mt-2">{p.extra}</p>}

      <div className="flex gap-2 pt-1 border-t border-zinc-800/80">
        <button
          type="button"
          onClick={p.onPrint}
          aria-label={`Print / PDF: ${p.printLabel} ${p.badge}`}
          className="flex-1 min-w-0 min-h-[44px] mt-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm sm:text-xs font-extrabold flex items-center justify-center gap-1.5 transition active:scale-95"
        >
          <Printer size={15} className="shrink-0" />
          <span className="truncate">
            Print / PDF<span className="hidden sm:inline"> · {p.printLabel}</span>
          </span>
        </button>
        {p.canArchive && (p.archived ? (
          <button
            type="button"
            onClick={p.onRestore}
            aria-label="Restore archived document"
            title="Restore"
            className="mt-2 min-h-[44px] min-w-[44px] px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-emerald-400 flex items-center justify-center gap-1.5 text-xs font-bold"
          >
            <RotateCcw size={15} /> <span className="hidden sm:inline">Restore</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={p.onArchive}
            aria-label="Archive document (superadmin)"
            title="Archive (hidden from lists, never deleted)"
            className="mt-2 min-h-[44px] min-w-[44px] px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center justify-center gap-1.5 text-xs font-bold"
          >
            <Archive size={15} /> <span className="hidden sm:inline">Archive</span>
          </button>
        ))}
      </div>
    </li>
  );
}
