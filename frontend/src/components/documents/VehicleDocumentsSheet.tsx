"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, FileText, Loader2, Plus, X } from "lucide-react";
import type { Vehicle } from "@/types";
import { DOC_INFO, DOC_TYPES, DocItem, DocType, docApi, docDate } from "@/lib/docCenter";

interface Props {
  vehicle: Vehicle;
  onClose: () => void;
}

/**
 * Owner-only: every document of one car (intake, passes, contract, down payment, rental),
 * with links into the Document Center to open one or start a new one for this car.
 */
export default function VehicleDocumentsSheet({ vehicle, onClose }: Props) {
  const [docs, setDocs] = useState<DocItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    docApi<{ documents: DocItem[] }>(`/vehicle/${vehicle.id}`)
      .then((r) => setDocs(r.documents))
      .catch((e) => setError(e.message));
  }, [vehicle.id]);

  const hubUrl = (params: Record<string, string>) => `/superadmin?${new URLSearchParams({ section: "documents", ...params })}`;
  const byType = (t: DocType) => (docs || []).filter((d) => d.type === t);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Vehicle documents" className="fixed inset-0 z-[60] bg-black/80 flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-lg bg-zinc-950 border border-zinc-800 rounded-t-2xl sm:rounded-2xl max-h-[92dvh] flex flex-col text-white">
        <div className="flex items-center gap-2 p-3 border-b border-zinc-800">
          <FileText size={18} className="text-amber-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-black text-sm truncate">
              {vehicle.year} {vehicle.make} {vehicle.model}
            </p>
            <p className="text-[11px] text-zinc-400">ሰነዶች · Documents of this car</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="h-11 w-11 shrink-0 rounded-xl bg-zinc-800 flex items-center justify-center">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {error && <p className="text-sm text-red-400">{error}</p>}
          {!docs && !error && (
            <div className="py-10 flex justify-center text-zinc-500">
              <Loader2 className="animate-spin" />
            </div>
          )}
          {docs &&
            DOC_TYPES.map((t) => (
              <section key={t} className="rounded-xl border border-zinc-800 bg-zinc-900 p-2.5 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="min-w-0 flex-1 text-xs font-bold truncate">
                    {DOC_INFO[t].am} <span className="text-zinc-500 font-normal">· {DOC_INFO[t].en}</span>
                  </p>
                  <a
                    href={hubUrl({ new: t, vehicle: String(vehicle.id) })}
                    className="h-9 px-2.5 shrink-0 rounded-lg bg-amber-500 text-black text-[11px] font-black inline-flex items-center gap-1"
                  >
                    <Plus size={13} /> New
                  </a>
                </div>
                {byType(t).length === 0 ? (
                  <p className="text-[11px] text-zinc-600 mt-1">None yet</p>
                ) : (
                  <ul className="mt-1.5 space-y-1">
                    {byType(t).map((d) => (
                      <li key={d.id}>
                        <a
                          href={hubUrl({ doc: t, open: String(d.id) })}
                          className="flex items-center gap-2 min-h-11 px-2 rounded-lg hover:bg-zinc-800 min-w-0"
                        >
                          <span className="font-mono text-xs font-bold text-amber-300 shrink-0">{d.number}</span>
                          <span className="text-xs text-zinc-300 truncate flex-1 min-w-0">
                            {docDate(d.date)} · {d.party_name || d.plate_number || ""}
                            {d.status !== "final" && <span className="text-zinc-500"> ({d.status})</span>}
                          </span>
                          <ExternalLink size={13} className="text-zinc-500 shrink-0" />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
