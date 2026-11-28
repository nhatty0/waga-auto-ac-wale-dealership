"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BriefcaseBusiness, ChevronRight, Loader2, PackageCheck, X } from "lucide-react";
import { DOC_INFO, DocItem, StaffDocType, docApi, docDate } from "@/lib/docCenter";

interface StaffDocs {
  user_id: number;
  name: string | null;
  phone: string | null;
  documents: DocItem[];
  holding: number;
  holding_items: { item: string; document: string; document_id: number }[];
}

/** Opens the Documents desk on a document, or a new staff document linked to this person. */
const hubUrl = (params: Record<string, string>) => {
  const u = new URL("/superadmin", window.location.origin);
  u.searchParams.set("section", "documents");
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  return u.toString();
};

/**
 * Team card -> "Documents": the staff documents linked to one person (employment contracts,
 * property handovers) and the items they still hold. Owner-only (the API is superadmin-only).
 */
export default function StaffDocumentsSheet({ userId, title, onClose }: { userId: number; title: string; onClose: () => void }) {
  const [data, setData] = useState<StaffDocs | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    docApi<StaffDocs>(`/staff/${userId}`).then(setData).catch((e) => setError((e as Error).message));
  }, [userId]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Documents of ${title}`} className="fixed inset-0 z-[60] bg-black/80 flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-md bg-zinc-950 border border-zinc-800 rounded-t-2xl sm:rounded-2xl max-h-[90dvh] flex flex-col text-white">
        <div className="flex items-center gap-2 p-3 border-b border-zinc-800">
          <div className="min-w-0 flex-1">
            <p className="font-black text-sm truncate">ሰነዶች · {title}</p>
            <p className="text-[11px] text-zinc-400">Staff documents linked to this person</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="h-11 w-11 shrink-0 rounded-xl bg-zinc-800 flex items-center justify-center">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {error && <p className="text-sm text-red-400">{error}</p>}
          {!data && !error && (
            <div className="py-10 flex justify-center text-zinc-500">
              <Loader2 className="animate-spin" />
            </div>
          )}
          {data && data.holding > 0 && (
            <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-3">
              <p className="text-xs font-black text-orange-300">Holding {data.holding} item{data.holding === 1 ? "" : "s"} · ያልተመለሱ ንብረቶች</p>
              <ul className="mt-1.5 space-y-0.5">
                {data.holding_items.map((h, i) => (
                  <li key={i} className="text-xs text-zinc-300 flex justify-between gap-2 min-w-0">
                    <span className="truncate">{h.item}</span>
                    <span className="shrink-0 font-mono text-zinc-500">{h.document}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data && data.documents.length === 0 && (
            <p className="text-center py-6 text-sm text-zinc-500">No staff documents linked yet.</p>
          )}
          {data && data.documents.length > 0 && (
            <ul className="space-y-2">
              {data.documents.map((d) => {
                const Icon = d.type === "employment" ? BriefcaseBusiness : PackageCheck;
                return (
                  <li key={`${d.type}-${d.id}`}>
                    <a
                      href={hubUrl({ doc: d.type, open: String(d.id) })}
                      className="flex items-center gap-3 min-h-14 p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-600 min-w-0"
                    >
                      <Icon size={18} className={d.type === "employment" ? "text-teal-300 shrink-0" : "text-orange-300 shrink-0"} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold truncate">{DOC_INFO[d.type].am}</span>
                        <span className="block text-[11px] text-zinc-400 truncate">
                          <span className="font-mono text-amber-300">{d.number}</span> · {docDate(d.date)} · {d.status === "draft" ? "Draft" : "Final"}
                          {d.type === "property" && Number(d.extra.item_count) > 0 ? ` · ${d.extra.holding}/${d.extra.item_count} held` : ""}
                        </span>
                      </span>
                      <ChevronRight size={16} className="text-zinc-500 shrink-0" />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="p-3 border-t border-zinc-800 grid grid-cols-2 gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {(["employment", "property"] as StaffDocType[]).map((t) => (
            <a
              key={t}
              href={hubUrl({ doc: t, new: t, staff: String(userId) })}
              className="h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-black flex items-center justify-center text-center px-2"
            >
              + {DOC_INFO[t].en}
            </a>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
