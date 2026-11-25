"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Clock, Loader2, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { getApiBaseUrl } from "@/lib/api";

interface Verify {
  status: "valid" | "used" | "expired" | "cancelled" | "draft";
  number: string;
  car: string;
  plate: string;
  color: string;
  valid_until: string;
  driver_phone: string;
  exited_at?: string;
  confirmed_by?: string;
}

const LOOK = {
  valid: { bg: "bg-emerald-500", text: "text-black", am: "የሚሰራ", en: "VALID", Icon: ShieldCheck, hint: "This car may leave. / መውጣት ይችላል።" },
  used: { bg: "bg-zinc-500", text: "text-white", am: "ጥቅም ላይ ውሏል", en: "USED", Icon: CheckCircle2, hint: "Already exited. Do not release again. / ቀድሞ ወጥቷል።" },
  expired: { bg: "bg-red-600", text: "text-white", am: "ጊዜው አልፏል", en: "EXPIRED", Icon: Clock, hint: "Do not release. / አይልቀቁ።" },
  cancelled: { bg: "bg-red-600", text: "text-white", am: "ተሰርዟል", en: "CANCELLED", Icon: XCircle, hint: "Do not release. / አይልቀቁ።" },
  draft: { bg: "bg-red-600", text: "text-white", am: "አልተሰጠም", en: "NOT ISSUED", Icon: ShieldAlert, hint: "Do not release. / አይልቀቁ።" },
} as const;

/**
 * Public gate-pass check (QR on the printed slip, link in Telegram). No login. The API returns
 * only status, pass number, car, plate, colour, valid-until and a masked driver phone.
 */
export default function VerifyPassPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token || "";
  const [data, setData] = useState<Verify | null>(null);
  const [error, setError] = useState<"notfound" | "limit" | "network" | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`${getApiBaseUrl()}/api/public/verify/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 404) return setError("notfound");
        if (r.status === 429) return setError("limit");
        if (!r.ok) return setError("network");
        setData(await r.json());
      })
      .catch(() => alive && setError("network"));
    return () => {
      alive = false;
    };
  }, [token]);

  if (error) {
    const msg =
      error === "notfound"
        ? { am: "ፓሱ አልተገኘም", en: "Pass not found. Do not release." }
        : error === "limit"
        ? { am: "ብዙ ሙከራ", en: "Too many checks. Wait a minute and reload." }
        : { am: "ግንኙነት የለም", en: "Could not check right now. Reload." };
    return (
      <main className="min-h-[100dvh] bg-red-700 text-white flex flex-col items-center justify-center px-6 text-center gap-3">
        <ShieldAlert size={72} />
        <p className="text-4xl font-black">{msg.am}</p>
        <p className="text-lg font-bold">{msg.en}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-[100dvh] bg-black text-zinc-400 flex items-center justify-center">
        <Loader2 size={36} className="animate-spin" />
      </main>
    );
  }

  const look = LOOK[data.status] || LOOK.draft;
  return (
    <main className="min-h-[100dvh] bg-black text-white flex flex-col">
      <section className={`${look.bg} ${look.text} px-5 pt-[max(2.5rem,env(safe-area-inset-top))] pb-8 text-center`}>
        <look.Icon size={80} className="mx-auto" strokeWidth={2.2} />
        <p className="mt-3 text-5xl font-black tracking-tight">{look.en}</p>
        <p className="text-2xl font-black mt-1">{look.am}</p>
        <p className="mt-3 text-sm font-bold opacity-90">{look.hint}</p>
        {data.status === "used" && (
          <p className="mt-2 text-base font-bold">
            {data.exited_at}
            {data.confirmed_by ? ` · ${data.confirmed_by}` : ""}
          </p>
        )}
      </section>

      <section className="flex-1 px-5 py-6 space-y-4 max-w-md w-full mx-auto">
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-zinc-500">ሰሌዳ · Plate</p>
          <p className="font-mono text-4xl font-black break-all">{data.plate}</p>
        </div>
        <dl className="grid grid-cols-1 gap-3 text-base">
          {[
            ["መኪና · Car", data.car],
            ["ቀለም · Color", data.color],
            ["ፓስ ቁጥር · Pass no.", data.number],
            ["እስከ · Valid until", data.valid_until],
            ["ሹፌር ስልክ · Driver phone", data.driver_phone || "—"],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 border-b border-zinc-800 pb-2 min-w-0">
              <dt className="text-sm text-zinc-400 shrink-0">{k}</dt>
              <dd className="font-bold text-right break-words min-w-0">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-center text-xs text-zinc-600 pt-4">AC WALE MARKET · ኤሲ ዋለ የመኪና መሸጫ</p>
      </section>
    </main>
  );
}
