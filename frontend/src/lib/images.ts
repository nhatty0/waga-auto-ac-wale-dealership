/**
 * Resolves and normalizes image URLs for consistent rendering across browsers and environments.
 *
 * Handles:
 *  - Relative static upload paths (e.g., "/static/uploads/car_123.webp")
 *  - Legacy uploads paths (e.g., "/uploads/car_123.webp" -> "/static/uploads/car_123.webp")
 *  - Stripping accidental localhost / 127.0.0.1 origins (e.g., "http://127.0.0.1:8000/uploads/...")
 *  - Full remote CDN / Unsplash URLs
 */
export function resolveImageUrl(url?: string | null, fallback = ""): string {
  if (!url) return fallback;

  let clean = url.trim();
  if (!clean) return fallback;

  // Strip localhost / 127.0.0.1 backend prefixes
  clean = clean
    .replace(/^https?:\/\/127\.0\.0\.1:8000\/uploads\//, "/static/uploads/")
    .replace(/^https?:\/\/localhost:8000\/uploads\//, "/static/uploads/")
    .replace(/^https?:\/\/127\.0\.0\.1:8000\/static\//, "/static/")
    .replace(/^https?:\/\/localhost:8000\/static\//, "/static/")
    .replace(/^https?:\/\/127\.0\.0\.1:8000\//, "/")
    .replace(/^https?:\/\/localhost:8000\//, "/");

  // If starts with /uploads/, redirect to /static/uploads/
  if (clean.startsWith("/uploads/")) {
    clean = `/static${clean}`;
  }

  return clean;
}
