"use client";

/**
 * Company stamp (ማህተም) for printed documents.
 *
 * The image is private: it is only served by GET /api/superadmin/stamp (superadmin token) and is
 * not in /public. Print iframes and the print view can't send an Authorization header, so it is
 * fetched once here and turned into a data: URL that the sheets embed directly. It is kept in
 * memory only (never in localStorage / the HTTP cache), keyed by the token that fetched it.
 */
import { useEffect, useState } from "react";
import { getApiBaseUrl } from "@/lib/api";
import { getDocToken } from "@/lib/docCenter";
import type { DocType } from "@/lib/docCenter";

let cache: { token: string; promise: Promise<string | null> } | null = null;

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

/** The stamp as a data: URL, or null when this user may not have it (staff) or none is installed. */
export function loadStampDataUrl(): Promise<string | null> {
  const token = getDocToken() || "";
  if (!token) return Promise.resolve(null);
  if (cache && cache.token === token) return cache.promise;
  const promise = fetch(`${getApiBaseUrl()}/api/superadmin/stamp`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })
    .then(async (res) => {
      if (!res.ok) return null;
      const blob = await res.blob();
      return blob.type.startsWith("image/") ? blobToDataUrl(blob) : null;
    })
    .catch(() => null);
  cache = { token, promise };
  // A network failure shouldn't stick: try again next time.
  promise.then((u) => {
    if (!u && cache?.promise === promise) cache = null;
  });
  return promise;
}

export type StampLoad = "idle" | "loading" | "ready" | "unavailable";

export interface DocStamp {
  /** The document may carry the stamp (it is final). Drafts never do. */
  allowed: boolean;
  /** The owner's choice (the "Stamp" toggle). */
  on: boolean;
  setOn: (v: boolean) => void;
  load: StampLoad;
  /** data: URL to render, only when allowed + on + loaded. */
  src: string | null;
  /** Printing can start: either no stamp is wanted, or it has loaded (or failed). */
  ready: boolean;
}

/** Stamp state for one print view. `initialOn` comes from the form's toggle (default ON). */
export function useDocStamp(allowed: boolean, initialOn = true): DocStamp {
  const [on, setOn] = useState(initialOn);
  // undefined = not fetched yet; null = not available to this user / not installed.
  const [url, setUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    loadStampDataUrl().then((u) => {
      if (alive) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [allowed]);

  const load: StampLoad = !allowed ? "idle" : url === undefined ? "loading" : url ? "ready" : "unavailable";

  const wanted = allowed && on;
  return {
    allowed,
    on: wanted,
    setOn,
    load,
    src: wanted && url ? url : null,
    ready: !wanted || load === "ready" || load === "unavailable",
  };
}

/** Record that these documents were printed with the stamp (stamped=true, stamped_by). */
export async function markStamped(type: DocType, ids: number[]): Promise<void> {
  const token = getDocToken() || "";
  await Promise.all(
    ids.map((id) =>
      fetch(`${getApiBaseUrl()}/api/superadmin/documents/${type}/${id}/stamped`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null)
    )
  );
}

/** Waits until React has rendered the stamp (if any) so it is in the DOM that gets printed. */
export const nextPaint = () =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
