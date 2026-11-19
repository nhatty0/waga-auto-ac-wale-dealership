/**
 * Shrinks an image in the browser before upload so phone photos (often 5–12 MB)
 * stay well under shared-hosting request limits.
 *
 * Resizes so the longest side is at most `maxSize` px and re-encodes as JPEG,
 * stepping quality down until the result is under `maxBytes` (default 1 MB).
 * Falls back to the original file if it isn't an image or would not get smaller.
 *
 * Throws HeicNotSupportedError when a HEIC/HEIF photo can't be decoded by this
 * browser: the server can't convert HEIC either, so uploading it as-is would
 * store an image nobody can view.
 */
export class HeicNotSupportedError extends Error {
  readonly fileName: string;
  constructor(name: string) {
    super(`HEIC photo can't be converted by this browser. Set Camera → Formats → "Most Compatible", or pick a JPEG.`);
    this.fileName = name;
    this.name = "HeicNotSupportedError";
  }
}

const HEIC_RE = /\.(heic|heif)$/i;
const isHeic = (file: File) => /image\/hei[cf]/i.test(file.type) || HEIC_RE.test(file.name);
const DEV = process.env.NODE_ENV !== "production";
const kb = (n: number) => `${Math.round(n / 1024)} KB`;

export async function compressImage(
  file: File,
  maxSize = 1600,
  quality = 0.85,
  maxBytes = 1024 * 1024
): Promise<File> {
  if (typeof window === "undefined") return file;
  const heic = isHeic(file);
  // Some phones report HEIC with an empty MIME type, so don't rely on file.type alone.
  if (!heic && !file.type.startsWith("image/")) return file;
  // Animated GIFs and SVGs would lose content when flattened to JPEG.
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;

  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await loadImage(file);
  } catch {
    if (heic) throw new HeicNotSupportedError(file.name);
    return file;
  }

  try {
    const { width, height } = bitmap;
    if (!width || !height) return file;

    const scale = Math.min(1, maxSize / Math.max(width, height));
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    // JPEG has no alpha: paint white so transparent PNG areas don't turn black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);

    // Step quality down until the photo fits under maxBytes.
    let blob: Blob | null = null;
    for (const q of [quality, 0.75, 0.65, 0.55]) {
      if (q > quality) continue;
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", q));
      if (!blob || blob.size <= maxBytes) break;
    }
    // Canvas memory on phones is limited; release it right away.
    canvas.width = canvas.height = 0;

    if (!blob) {
      if (heic) throw new HeicNotSupportedError(file.name);
      return file;
    }
    // HEIC must always be converted, even in the unlikely case JPEG is larger.
    if (!heic && blob.size >= file.size) {
      if (DEV) console.info(`[compressImage] ${file.name}: ${kb(file.size)} kept (re-encode not smaller), ${width}x${height}`);
      return file;
    }

    if (DEV) {
      console.info(
        `[compressImage] ${file.name}: ${kb(file.size)} ${width}x${height} → ${kb(blob.size)} ${w}x${h}`
      );
    }
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch (err) {
    if (err instanceof HeicNotSupportedError) throw err;
    if (heic) throw new HeicNotSupportedError(file.name);
    return file;
  } finally {
    if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
  }
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // Respect EXIF orientation so portrait phone photos aren't rotated.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall through to <img> decoding (older Safari, unusual formats).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
