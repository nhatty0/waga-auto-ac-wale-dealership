"use client";

import React, { useLayoutEffect, useRef, useState } from "react";

/** A4 sizes in CSS px (96dpi): 210mm x 297mm. */
export const A4_PORTRAIT_PX = 794;
export const A4_LANDSCAPE_PX = 1123;

interface ScaledPreviewProps {
  /** Width (px) the sheet is laid out at: its true printed width. */
  designWidth: number;
  children: React.ReactNode;
  className?: string;
}

/**
 * SCREEN PREVIEW ONLY. Lays the sheet out at its true size, then scales it down to fit the
 * available width (never up). The wrapper takes the scaled height, so nothing overflows,
 * overlaps or scrolls sideways.
 *
 * The transform lives on wrapper elements around `children`; the sheet element itself is not
 * modified, so anything that prints a copy of it (portals, iframe outerHTML) is unaffected.
 */
export default function ScaledPreview({ designWidth, children, className = "" }: ScaledPreviewProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ scale: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const update = () => {
      const available = outer.clientWidth;
      if (!available) return;
      const scale = Math.min(1, available / designWidth);
      // offsetHeight is the untransformed layout height of the sheet
      const height = inner.offsetHeight * scale;
      setBox((prev) =>
        prev && Math.abs(prev.scale - scale) < 0.0005 && Math.abs(prev.height - height) < 0.5
          ? prev
          : { scale, height }
      );
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(outer);
    ro.observe(inner); // sheet grows when images load / rows change
    return () => ro.disconnect();
  }, [designWidth]);

  const scale = box?.scale ?? 1;

  return (
    <div ref={outerRef} className={`w-full min-w-0 ${className}`}>
      <div
        className="relative mx-auto overflow-hidden"
        style={{
          width: designWidth * scale,
          height: box ? box.height : undefined,
          // Avoid a one-frame flash of the unscaled sheet before the first measurement
          visibility: box ? "visible" : "hidden",
        }}
      >
        <div
          ref={innerRef}
          style={{
            width: designWidth,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            position: "absolute",
            top: 0,
            left: 0,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
