import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { createAdminClient } from "./supabase/admin";
import { assertPublicUrl } from "./scrape";

// Product cutouts: the product photo with its background removed, so it can
// float as a layer over the video instead of sitting in a white box.
//
// Most Shopify packshots are on a plain white or light background, so we
// remove it with an edge flood fill: start from the border, spread through
// pixels close to the background colour, and make them transparent (with a
// soft edge). Photos without a plain background (lifestyle shots, ads with
// text) are skipped rather than cut badly. No ML model and no third-party
// API, so no per-image cost and no licensing strings attached.

const BUCKET = "renders";
const MAX_SIDE = 900;
// How close (0-441, RGB distance) a pixel must be to the background colour
// to count as background, and the band above it that fades out softly.
const BG_TOLERANCE = 32;
const FEATHER = 28;

export type Cutout = { url: string; width: number; height: number; source: string };

function storagePath(source: string) {
  return `cutouts/${createHash("sha1").update(source).digest("hex")}.png`;
}

async function removePlainBackground(input: Buffer): Promise<{ png: Buffer; width: number; height: number } | null> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const px = (i: number) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];

  // The background colour is the average of the border, and it has to be
  // light and uniform, or this isn't a packshot.
  const border: number[] = [];
  for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
  const avg = [0, 1, 2].map((c) => border.reduce((s, i) => s + px(i)[c], 0) / border.length);
  const dist = (i: number) => {
    const [r, g, b] = px(i);
    return Math.hypot(r - avg[0], g - avg[1], b - avg[2]);
  };
  const luminance = 0.2126 * avg[0] + 0.7152 * avg[1] + 0.0722 * avg[2];
  const uniform = border.filter((i) => dist(i) < BG_TOLERANCE).length / border.length;
  if (luminance < 170 || uniform < 0.9) return null;

  // Flood fill from the border through background-coloured pixels.
  const isBg = new Uint8Array(w * h);
  const queue = border.filter((i) => dist(i) < BG_TOLERANCE);
  for (const i of queue) isBg[i] = 1;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % w;
    for (const n of [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) {
      if (n >= 0 && n < w * h && !isBg[n] && dist(n) < BG_TOLERANCE) {
        isBg[n] = 1;
        queue.push(n);
      }
    }
  }

  const bgShare = queue.length / (w * h);
  // Too little removed: not really a plain background. Too much: the
  // "product" is a sliver (or the photo is empty).
  if (bgShare < 0.15 || bgShare > 0.9) return null;

  // Keep the product, drop floating extras: marketing cards often put
  // captions or badges ("50g PERFECT TRAVEL COMPANION") beside the product,
  // and each letter is its own small island. Keep the largest shape plus any
  // island at least a quarter of its size.
  const label = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (isBg[s] || label[s] !== -1) continue;
    const id = sizes.length;
    const stack = [s];
    label[s] = id;
    let size = 0;
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % w;
      for (const n of [i - w, i + w, x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1]) {
        if (n >= 0 && n < w * h && !isBg[n] && label[n] === -1) {
          label[n] = id;
          stack.push(n);
        }
      }
    }
    sizes.push(size);
  }
  const largest = Math.max(...sizes);
  for (let i = 0; i < w * h; i++) {
    if (!isBg[i] && sizes[label[i]] < largest / 4) isBg[i] = 1;
  }

  // Alpha: background transparent; pixels next to it fade by how close to
  // the background colour they are, which softens the edge.
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let i = 0; i < w * h; i++) {
    const x = i % w;
    const y = (i - x) / w;
    if (isBg[i]) {
      data[i * 4 + 3] = 0;
      continue;
    }
    const nearBg = isBg[i - 1] || isBg[i + 1] || isBg[i - w] || isBg[i + w];
    if (nearBg) {
      const d = dist(i);
      data[i * 4 + 3] = Math.round(255 * Math.min(1, Math.max(0, (d - BG_TOLERANCE) / FEATHER + 0.35)));
    }
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const png = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: minX, top: minY, width, height })
    .png({ compressionLevel: 9 })
    .toBuffer();
  return { png, width, height };
}

// Cutout for one product photo, cached in storage by the photo's URL.
export async function cutoutFor(source: string): Promise<Cutout | null> {
  const storage = createAdminClient().storage.from(BUCKET);
  const path = storagePath(source);
  const url = storage.getPublicUrl(path).data.publicUrl;

  // Already made? Read its size from the stored PNG.
  const cached = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (cached?.ok) {
    const meta = await sharp(Buffer.from(await cached.arrayBuffer())).metadata();
    return { url, width: meta.width ?? 1, height: meta.height ?? 1, source };
  }

  const res = await fetch(await assertPublicUrl(source), { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return null;
  const cut = await removePlainBackground(Buffer.from(await res.arrayBuffer())).catch(() => null);
  if (!cut) return null;

  const { error } = await storage.upload(path, cut.png, { contentType: "image/png", upsert: true });
  if (error) throw error;
  return { url, width: cut.width, height: cut.height, source };
}

// The best cutout per product: the first gallery photo (of the first few)
// that has a plain background.
export async function productCutouts(
  products: { id: string; name: string; image_urls: string[] }[],
  perProduct = 3,
): Promise<(Cutout & { productId: string; productName: string })[]> {
  const results = await Promise.all(
    products.map(async (p) => {
      for (const src of p.image_urls.slice(0, perProduct)) {
        const cut = await cutoutFor(src).catch(() => null);
        if (cut) return { ...cut, productId: p.id, productName: p.name };
      }
      return null;
    }),
  );
  return results.filter((r): r is NonNullable<typeof r> => r !== null);
}
