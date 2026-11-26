"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Ban, Calendar, ClipboardList, Eye, MapPin, Pencil, Plus, RotateCw, Send, User as UserIcon, X } from "lucide-react";
import { StaffUser, Task, TaskStatus } from "@/types";
import TaskForm, { CopyMessage, taskApi } from "@/components/tasks/TaskForm";

const STATUS_FILTERS: { key: string; label: string }[] = [
  { key: "open", label: "Open · ክፍት" },
  { key: "new", label: "New" },
  { key: "accepted", label: "Accepted" },
  { key: "in_progress", label: "In progress" },
  { key: "problem", label: "Problem" },
  { key: "done", label: "Done" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

const TONE: Record<TaskStatus, string> = {
  new: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  accepted: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  in_progress: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  done: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  problem: "bg-red-500/15 text-red-300 border-red-500/40",
  cancelled: "bg-zinc-800 text-zinc-400 border-zinc-700",
};

const OVERRIDE: { value: TaskStatus; label: string }[] = [
  { value: "new", label: "🆕 New" },
  { value: "accepted", label: "👍 Accepted" },
  { value: "in_progress", label: "🚗 In progress" },
  { value: "done", label: "✅ Done" },
  { value: "problem", label: "⚠️ Problem" },
];

/** Owner Tasks board (/superadmin -> Tasks). Mobile-first: every action visible on the card. */
export default function TasksBoard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [people, setPeople] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("open");
  const [personId, setPersonId] = useState<number | "">("");
  const [date, setDate] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<Task | null>(null);
  const [notice, setNotice] = useState<{ text: string; bad?: boolean; task?: Task } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      q.set("status", status);
      if (personId) q.set("user_id", String(personId));
      if (date) q.set("date", date);
      const list: Task[] = await taskApi(`/api/superadmin/tasks?${q.toString()}`);
      setTasks(Array.isArray(list) ? list : []);
    } catch (e) {
      setNotice({ text: (e as Error).message, bad: true });
    } finally {
      setLoading(false);
    }
  }, [status, personId, date]);

  useEffect(() => {
    // Data fetch when the filters change; state updates after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    taskApi("/api/superadmin/staff")
      .then((s: StaffUser[]) => setPeople((Array.isArray(s) ? s : []).filter((u) => !u.is_superadmin)))
      .catch(() => {});
  }, []);

  const replace = (t: Task) => {
    setTasks((prev) => (prev.some((x) => x.id === t.id) ? prev.map((x) => (x.id === t.id ? t : x)) : [t, ...prev]));
    setViewing((v) => (v && v.id === t.id ? t : v));
  };

  const act = async (t: Task, path: string, body?: unknown, okText?: string) => {
    setBusyId(t.id);
    try {
      const updated: Task = await taskApi(`/api/superadmin/tasks/${t.id}${path}`, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      replace(updated);
      if (updated.telegram && !updated.telegram.sent) setNotice({ text: `#${t.id}: ${updated.telegram.reason}`, bad: true, task: updated });
      else setNotice({ text: okText || `#${t.id} updated` });
    } catch (e) {
      setNotice({ text: (e as Error).message, bad: true });
    } finally {
      setBusyId(null);
    }
  };

  const cancelTask = (t: Task) => {
    if (!confirm(`Cancel task #${t.id}? ${t.assigned_name || "The person"} is told in Telegram. / ስራውን ይሰርዙ?`)) return;
    act(t, "/cancel", undefined, `#${t.id} cancelled`);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <ClipboardList size={18} className="text-amber-400 shrink-0" /> ስራዎች (Tasks)
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">Sent to the person&apos;s Telegram with Accept / Started / Done / Problem buttons.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={load} aria-label="Refresh tasks" className="h-11 w-11 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center justify-center">
            <RotateCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            type="button"
            data-task-new
            onClick={() => setCreating(true)}
            className="h-11 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold flex items-center gap-1.5"
          >
            <Plus size={16} /> New
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <div role="group" aria-label="Filter by status" className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={status === s.key}
              data-task-filter={s.key}
              onClick={() => setStatus(s.key)}
              className={`shrink-0 h-10 px-3.5 rounded-full text-xs font-semibold border whitespace-nowrap ${
                status === s.key ? "bg-amber-500 border-amber-500 text-black" : "bg-zinc-900 border-zinc-800 text-zinc-400"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={personId}
            onChange={(e) => setPersonId(e.target.value ? Number(e.target.value) : "")}
            aria-label="Filter by person"
            className="h-11 min-w-0 px-3 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-white"
          >
            <option value="">Everyone</option>
            {people.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.phone_number}
              </option>
            ))}
          </select>
          <div className="flex gap-1 min-w-0">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Filter by date"
              className="h-11 min-w-0 flex-1 px-2 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-white"
            />
            {date && (
              <button type="button" onClick={() => setDate("")} aria-label="Clear date" className="h-11 w-11 shrink-0 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 flex items-center justify-center">
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {notice && (
        <div role="status" className={`text-xs rounded-xl p-3 border space-y-2 ${notice.bad ? "text-amber-200 bg-amber-500/10 border-amber-500/30" : "text-emerald-300 bg-emerald-500/10 border-emerald-500/25"}`}>
          <div className="flex items-start justify-between gap-2">
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="h-8 w-8 -m-1 shrink-0 flex items-center justify-center text-zinc-400">
              <X size={14} />
            </button>
          </div>
          {notice.task && <CopyMessage text={notice.task.copy_text} />}
        </div>
      )}

      {loading && tasks.length === 0 ? (
        <div className="py-12 flex justify-center">
          <div className="w-7 h-7 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-500">No tasks here. Tap New, or Assign driver on a rental.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {tasks.map((t) => {
            const closed = t.status === "done" || t.status === "cancelled";
            const busy = busyId === t.id;
            return (
              <li key={t.id} data-task-id={t.id} className={`min-w-0 rounded-2xl border p-4 space-y-2.5 ${t.status === "problem" ? "bg-red-950/30 border-red-500/40" : "bg-zinc-900 border-zinc-800"} ${closed ? "opacity-75" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white break-words">{t.type_label}</p>
                    <p className="text-[11px] text-zinc-500 font-mono">#{t.id}{t.rental_booking_id ? ` · rental #${t.rental_booking_id}` : ""}</p>
                  </div>
                  <span className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-lg border ${TONE[t.status]}`}>{t.status_label}</span>
                </div>
                {t.vehicle_text && <p className="text-sm text-amber-300 font-semibold break-words">🚗 {t.vehicle_text}</p>}
                <div className="grid gap-1 text-xs text-zinc-300">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <UserIcon size={13} className="text-zinc-500 shrink-0" />
                    <span className="truncate">{t.assigned_name || "Unassigned"}</span>
                    {t.assigned_name && (
                      <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${t.assigned_linked ? "bg-sky-500/15 text-sky-300" : "bg-zinc-800 text-zinc-500"}`}>
                        {t.assigned_linked ? "Telegram ✓" : "no Telegram"}
                      </span>
                    )}
                  </span>
                  {t.scheduled_label && (
                    <span className="flex items-center gap-1.5"><Calendar size={13} className="text-zinc-500 shrink-0" /> {t.scheduled_label}</span>
                  )}
                  {t.location && (
                    <span className="flex items-start gap-1.5 min-w-0"><MapPin size={13} className="text-zinc-500 shrink-0 mt-px" /> <span className="break-words">{t.location}</span></span>
                  )}
                  {(t.customer_name || t.customer_phone) && (
                    <span className="text-zinc-400 break-words">
                      👤 {t.customer_name} {t.customer_phone && <a href={`tel:${t.customer_phone}`} className="text-amber-400">{t.customer_phone}</a>}
                    </span>
                  )}
                </div>
                {t.status === "problem" && t.problem_note && (
                  <p className="text-xs text-red-200 bg-red-500/10 border border-red-500/30 rounded-lg p-2 flex gap-1.5 break-words">
                    <AlertTriangle size={13} className="shrink-0 mt-px" /> {t.problem_note}
                  </p>
                )}
                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  <button type="button" onClick={() => setViewing(t)} data-task-view={t.id} className="h-11 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-[11px] font-bold flex flex-col items-center justify-center leading-tight">
                    <Eye size={14} /> View
                  </button>
                  <button type="button" disabled={closed} onClick={() => setEditing(t)} data-task-edit={t.id} className="h-11 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-[11px] font-bold flex flex-col items-center justify-center leading-tight disabled:opacity-40">
                    <Pencil size={14} /> Edit
                  </button>
                  <button type="button" disabled={closed || busy} onClick={() => act(t, "/send", undefined, `#${t.id} sent again`)} data-task-resend={t.id} className="h-11 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 text-[11px] font-bold flex flex-col items-center justify-center leading-tight disabled:opacity-40">
                    <Send size={14} /> Re-send
                  </button>
                  <button type="button" disabled={closed || busy} onClick={() => cancelTask(t)} data-task-cancel={t.id} className="h-11 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-[11px] font-bold flex flex-col items-center justify-center leading-tight disabled:opacity-40">
                    <Ban size={14} /> Cancel
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {(creating || editing) && (
        <TaskForm
          task={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(t) => {
            replace(t);
            setNotice(t.telegram?.sent ? { text: `#${t.id} sent to ${t.telegram.to}` } : { text: `#${t.id} saved` });
          }}
        />
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full sm:max-w-lg max-h-[94dvh] overflow-y-auto bg-zinc-900 border-t sm:border border-zinc-800 rounded-t-3xl sm:rounded-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4" data-task-sheet>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-white">Task #{viewing.id}</h3>
              <button type="button" onClick={() => setViewing(null)} aria-label="Close" className="h-11 w-11 -mr-2 flex items-center justify-center text-zinc-400">
                <X size={18} />
              </button>
            </div>
            <pre className="whitespace-pre-wrap text-xs text-zinc-200 bg-zinc-950 border border-zinc-800 rounded-xl p-3">{viewing.copy_text}</pre>
            <CopyMessage text={viewing.copy_text} />
            {viewing.status !== "done" && viewing.status !== "cancelled" && (
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-zinc-300">Set status (owner override)</span>
                <select
                  value={viewing.status}
                  disabled={busyId === viewing.id}
                  onChange={(e) => act(viewing, "/status", { status: e.target.value }, `#${viewing.id} → ${e.target.value}`)}
                  className="w-full h-11 px-3 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white"
                >
                  {OVERRIDE.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div>
              <p className="text-xs font-bold text-zinc-300 mb-2">ታሪክ (History)</p>
              <ol className="space-y-2 border-l border-zinc-800 pl-3" data-task-history>
                {viewing.events.map((ev, i) => (
                  <li key={i} className="text-xs text-zinc-300">
                    <span className="font-mono text-zinc-500">{ev.at}</span> · {ev.actor || "—"} ·{" "}
                    <span className="font-semibold">
                      {ev.action === "status" ? ev.status_label : ev.action === "note" ? "problem note" : ev.action}
                    </span>
                    {ev.note && <span className="block text-zinc-400 break-words">“{ev.note}”</span>}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
