"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Link2, RotateCw, Send, XCircle } from "lucide-react";
import { getApiBaseUrl } from "@/lib/api";

interface Status {
  token_set: boolean;
  token_source: "settings" | "env" | null;
  username: string | null;
  username_source: "settings" | "env" | null;
  username_invalid: boolean;
  reachable: boolean;
  bot_username: string | null;
  bot_name: string | null;
  username_mismatch: boolean;
  link_username: string | null;
  error: string | null;
  webhook: {
    url?: string;
    pending_update_count?: number;
    allowed_updates?: string[];
    last_error_message?: string;
    last_error_date?: string | null;
    has_callback_query?: boolean;
    error?: string;
  } | null;
  default_webhook_url: string | null;
  webhook_secret_set: boolean;
  owner_chat_set: boolean;
  linked_members: number;
  alerts: { appointments: boolean; rentals: boolean };
}

const getToken = () =>
  typeof window === "undefined" ? null : localStorage.getItem("dealer_token") || localStorage.getItem("token");

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() || ""}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body?.detail === "string" ? body.detail : `Request failed (${res.status})`);
  return body;
}

const SOURCE: Record<string, string> = { settings: "from Settings", env: "from .env" };

function Row({ ok, warn, label, children }: { ok?: boolean; warn?: boolean; label: string; children: React.ReactNode }) {
  const Icon = ok ? CheckCircle2 : warn ? AlertTriangle : XCircle;
  const color = ok ? "text-emerald-400" : warn ? "text-amber-400" : "text-red-400";
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-zinc-800/70 last:border-0">
      <Icon size={16} className={`${color} shrink-0 mt-0.5`} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold text-zinc-300">{label}</p>
        <div className="text-xs text-zinc-400 break-words">{children}</div>
      </div>
    </div>
  );
}

/** Settings -> Telegram status: bot (getMe), webhook (getWebhookInfo), Set webhook, team alerts. Owner only. */
export default function TelegramStatusCard() {
  const [s, setS] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const st: Status = await api("/api/superadmin/telegram/status");
      setS(st);
      setUrl((u) => u || st.webhook?.url || st.default_webhook_url || "");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Status fetch on mount; state updates after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const setWebhook = async () => {
    if (!url.trim().startsWith("https://")) {
      setMsg("The webhook URL must start with https://");
      return;
    }
    if (!confirm(`Point the bot's webhook at\n${url.trim()}\n\n(updates: message + callback_query${s?.webhook_secret_set ? ", with your secret token" : ""})`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await api("/api/superadmin/telegram/set-webhook", { method: "POST", body: JSON.stringify({ url: url.trim() }) });
      setMsg(`✅ ${r.description || "Webhook was set"}${r.secret_token_used ? " (with secret token)" : " (no secret token: set TELEGRAM_WEBHOOK_SECRET in .env)"}`);
      await load();
    } catch (e) {
      setMsg(`❌ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const setAlert = async (key: "appointments" | "rentals", value: boolean) => {
    if (!s) return;
    setS({ ...s, alerts: { ...s.alerts, [key]: value } });
    try {
      const a = await api("/api/superadmin/telegram/alerts", { method: "PUT", body: JSON.stringify({ [key]: value }) });
      setS((prev) => (prev ? { ...prev, alerts: a } : prev));
    } catch (e) {
      setMsg(`❌ ${(e as Error).message}`);
      load();
    }
  };

  const wh = s?.webhook;
  const whUrl = wh?.url || "";

  return (
    <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-4 sm:p-6 max-w-2xl mb-6 space-y-4" data-telegram-status>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <Send size={18} className="text-sky-400 shrink-0" /> Telegram status
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">The bot that sends tasks, gate passes and alerts. Settings value wins; else backend/.env.</p>
        </div>
        <button type="button" onClick={load} aria-label="Check again" className="h-11 w-11 shrink-0 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 flex items-center justify-center">
          <RotateCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {err && <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/25 rounded-xl p-3">{err}</p>}

      {s && (
        <div>
          <Row ok={s.token_set} label="Bot token">
            {s.token_set ? `Set (${SOURCE[s.token_source || ""] || "?"})` : "Not set: TELEGRAM_PLATFORM_BOT_TOKEN in backend/.env"}
          </Row>
          <Row ok={s.reachable} label="Bot reachable (getMe)">
            {s.reachable ? (
              <>
                @{s.bot_username} · {s.bot_name}
              </>
            ) : (
              s.error || "No answer"
            )}
          </Row>
          <Row
            ok={!!s.username && !s.username_mismatch && !s.username_invalid}
            warn={(!s.username && s.reachable) || s.username_mismatch}
            label="Bot username (used in Link Telegram)"
          >
            {s.username_invalid ? (
              <>The configured username isn&apos;t valid (e.g. AcWaleBot, without https:// or @).</>
            ) : s.username ? (
              <>
                @{s.username} ({SOURCE[s.username_source || ""] || "?"})
                {s.username_mismatch && (
                  <span className="block text-amber-300">
                    ⚠️ The token belongs to @{s.bot_username}: links use @{s.bot_username}. Fix the username to match.
                  </span>
                )}
              </>
            ) : s.reachable ? (
              <>Not configured: links use @{s.bot_username} from getMe. Set TELEGRAM_PLATFORM_BOT_USERNAME={s.bot_username}.</>
            ) : (
              "Bot username not configured"
            )}
          </Row>
          <Row ok={s.owner_chat_set} warn={!s.owner_chat_set} label="Owner chat">
            {s.owner_chat_set ? "Connected (owner notices arrive)" : "Not connected: use Connect Bot / TELEGRAM_CHAT_ID"}
          </Row>
          <Row ok={s.linked_members > 0} warn={s.linked_members === 0} label="Team members linked">
            {s.linked_members}
          </Row>
          {s.reachable && (
            <Row
              ok={!!whUrl && !wh?.last_error_message && wh?.has_callback_query !== false}
              warn={!!whUrl && (!!wh?.last_error_message || wh?.has_callback_query === false)}
              label="Webhook"
            >
              {wh?.error ? (
                wh.error
              ) : whUrl ? (
                <>
                  <span className="font-mono text-[11px] text-zinc-300 break-all">{whUrl}</span>
                  <span className="block">
                    Pending updates: {wh?.pending_update_count ?? 0} · updates: {(wh?.allowed_updates || []).join(", ") || "all"}
                  </span>
                  {wh?.has_callback_query === false && <span className="block text-amber-300">callback_query missing: buttons won&apos;t work. Set the webhook again.</span>}
                  {wh?.last_error_message && (
                    <span className="block text-amber-300">
                      Last error{wh.last_error_date ? ` (${wh.last_error_date})` : ""}: {wh.last_error_message}
                    </span>
                  )}
                </>
              ) : (
                "No webhook set (fine for local testing with polling; production needs one)."
              )}
            </Row>
          )}
          <Row ok={s.webhook_secret_set} warn={!s.webhook_secret_set} label="Webhook secret">
            {s.webhook_secret_set ? "TELEGRAM_WEBHOOK_SECRET is set" : "Not set: anyone could post fake updates. Add TELEGRAM_WEBHOOK_SECRET to .env."}
          </Row>
        </div>
      )}

      {s?.reachable && (
        <div className="space-y-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-zinc-300">Webhook URL</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.acwalecarmarket.com/v1/api/telegram/webhook"
              className="w-full h-11 px-3 bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl text-sm text-white font-mono focus:outline-none"
              data-webhook-url
            />
          </label>
          <button
            type="button"
            disabled={busy || !url.trim()}
            onClick={setWebhook}
            data-set-webhook
            className="w-full h-11 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Link2 size={15} /> {busy ? "Setting…" : "Set webhook"}
          </button>
        </div>
      )}
      {msg && <p className="text-xs text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-xl p-3 break-words">{msg}</p>}

      {s && (
        <div className="pt-2 border-t border-zinc-800 space-y-2">
          <p className="text-xs font-bold text-zinc-300">Team alerts (Telegram)</p>
          {(
            [
              ["appointments", "New appointment → members with Appointments"],
              ["rentals", "New rental booking → members with Rentals"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-3 min-h-12 px-3.5 rounded-xl bg-zinc-950 border border-zinc-800 cursor-pointer">
              <span className="text-sm text-white">{label}</span>
              <input
                type="checkbox"
                checked={s.alerts[key]}
                onChange={(e) => setAlert(key, e.target.checked)}
                data-alert-toggle={key}
                className="w-5 h-5 accent-emerald-500 shrink-0"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
