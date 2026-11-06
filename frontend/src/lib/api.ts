/**
 * Resolves the base API URL dynamically depending on execution environment:
 * - Client Browser: Always returns empty string "" by default so that all requests
 *   use relative paths (e.g. `/api/...`). This prevents Mixed Content blocks (HTTPS -> HTTP),
 *   respects the current domain (e.g. https://car.wagadelivery.com), and routes through
 *   the Caddy reverse proxy directly to FastAPI.
 * - Server-Side Rendering (SSR / Node.js): Uses NEXT_PUBLIC_API_URL or defaults to
 *   "http://127.0.0.1:8000" to communicate with the local FastAPI service directly.
 */
export function getApiBaseUrl(): string {
  // SSR runtime on server
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
  }

  // Client-side in browser:
  // If NEXT_PUBLIC_API_URL is provided and is a valid HTTPS or relative endpoint, use it.
  // Insecure HTTP on an HTTPS page will cause browser Mixed Content blocks, so fallback to "".
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured && configured.trim()) {
    const trimmed = configured.trim().replace(/\/+$/, "");
    if (window.location.protocol === "https:" && trimmed.startsWith("http://")) {
      return "";
    }
    return trimmed;
  }

  return "";
}
