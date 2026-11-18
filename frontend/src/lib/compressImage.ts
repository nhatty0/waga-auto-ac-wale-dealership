/**
 * Shrinks an image in the browser before upload so phone photos (often 5–12 MB)
 * stay well under shared-hosting request limits.
 *
 * Resizes so the longest side is at most `maxSize` px and re-encodes as JPEG.
 * Falls back to the original file if it isn't an image, can't be decoded,
 * or if compression would not make it smaller.
 */
export async function compressImage(
  file: File,
  maxSize = 1600,
  quality = 0.85
): Promise<File> {
  if (typeof window === "undefined" || !file.type.startsWith("image/")) return file;
  // Animated GIFs and SVGs would lose content when flattened to JPEG.
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;

  try {
    const bitmap = await loadImage(file);
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
    if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
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
