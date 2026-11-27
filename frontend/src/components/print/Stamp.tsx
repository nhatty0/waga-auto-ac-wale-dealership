"use client";

import React from "react";
import { Stamp as StampIcon, Loader2 } from "lucide-react";
import type { DocStamp } from "@/lib/stamp";

/**
 * The company stamp on a printed sheet. Inline styles only: several sheets are copied into an
 * empty print iframe without the app's stylesheet. Place it inside a position:relative box
 * (the dealership's signature block) and nudge it with `style` (top/left/right/bottom).
 */
export function StampMark({
  src,
  widthMm = 35,
  style,
}: {
  src: string | null;
  /** ~3.5 cm on A4 sheets, ~2.5 cm on gate-pass slips. */
  widthMm?: number;
  style?: React.CSSProperties;
}) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      className="doc-stamp"
      draggable={false}
      style={{
        position: "absolute",
        width: `${widthMm}mm`,
        maxWidth: "none",
        height: "auto",
        opacity: 0.85,
        transform: "rotate(-8deg)",
        mixBlendMode: "multiply",
        pointerEvents: "none",
        userSelect: "none",
        zIndex: 2,
        ...style,
      }}
    />
  );
}

/** Header toggle for a print view: "Stamp" on/off. Disabled (and off) for drafts. */
export function StampToggle({ stamp }: { stamp: DocStamp }) {
  const { allowed, on, setOn, load } = stamp;
  const unavailable = allowed && load === "unavailable";
  const title = !allowed
    ? "Drafts print without the stamp"
    : unavailable
    ? "Stamp image not available"
    : on
    ? "Printing with the company stamp. Tap to print an unstamped copy."
    : "Printing without the stamp. Tap to add the company stamp.";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on && !unavailable}
      aria-label="Stamp / ማህተም"
      title={title}
      disabled={!allowed || unavailable}
      onClick={() => setOn(!on)}
      className={`h-11 shrink-0 px-3 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-40 ${
        on && !unavailable
          ? "bg-sky-500/15 border-sky-500/50 text-sky-300"
          : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white"
      }`}
    >
      {allowed && load === "loading" ? <Loader2 size={15} className="animate-spin" /> : <StampIcon size={15} />}
      <span className="hidden min-[400px]:inline">Stamp</span>
      <span className="hidden sm:inline font-mono">{on && !unavailable ? "ON" : "OFF"}</span>
    </button>
  );
}
