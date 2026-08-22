/**
 * Client-side photo downscaling for the damage-photo step.
 *
 * Why 1536px on the longest edge:
 *
 *  - Gemini tiles images into 768x768 blocks and bills 258 tokens per tile, so
 *    1536px is exactly the point where the tiling is fully exploited (4 tiles)
 *    without paying for detail the vision encoder throws away.
 *  - Published VLM benchmarks put accuracy at ~60% for 384px inputs rising to
 *    ~68% at 1536px, and defect detection conventionally needs 3-5 pixels per
 *    feature. Vision encoders internally rescale, so small-defect recall is the
 *    first thing to suffer if you compress harder — and small defects (a single
 *    cracked tile, a split gutter joint) are exactly what we are grading.
 *
 * Quality 0.82 keeps a typical phone photo around 250-400KB, comfortably under
 * the route's 2MB per-file cap with room for the outliers.
 *
 * Re-encoding through a canvas also strips EXIF as a side effect, which is the
 * point: these are photographs of a private individual's home and the originals
 * routinely carry GPS coordinates. Orientation is read before that happens and
 * reapplied, otherwise iPhone photos arrive rotated and the grader sees a roof
 * on its side.
 */

const MAX_EDGE = 1536;
const QUALITY = 0.82;

export type CompressedPhoto = {
  file: File;
  /** Object URL for the thumbnail. Caller must revokeObjectURL on removal. */
  previewUrl: string;
  width: number;
  height: number;
};

/**
 * Downscale one image. Falls back to the original file if anything about the
 * canvas path fails — a slightly large upload is far better than a customer
 * who cannot add a photo at all.
 */
export async function compressImage(file: File): Promise<CompressedPhoto> {
  try {
    const bitmap = await loadBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    if ("close" in bitmap) bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", QUALITY),
    );
    if (!blob) throw new Error("toBlob returned null");

    const compressed = new File([blob], renameToJpeg(file.name), {
      type: "image/jpeg",
    });
    return {
      file: compressed,
      previewUrl: URL.createObjectURL(compressed),
      width,
      height,
    };
  } catch {
    return {
      file,
      previewUrl: URL.createObjectURL(file),
      width: 0,
      height: 0,
    };
  }
}

/**
 * createImageBitmap with `imageOrientation: "from-image"` applies the EXIF
 * rotation for us on every browser that supports it; the <img> path is the
 * fallback, where modern browsers apply orientation by default.
 */
async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Safari has historically rejected the options bag — fall through.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image decode failed"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function renameToJpeg(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "") || "photo";
  return `${stem.slice(0, 40)}.jpg`;
}
