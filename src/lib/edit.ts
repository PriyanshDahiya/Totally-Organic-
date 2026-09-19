import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "./supabase/admin";
import { memeById, toMemeLayer } from "./memes";
import type { StockClip } from "./stock";
import { clampProduct, clampTextBox, withStyleDefaults, TEXT_SCALE, type CardStyle } from "@/remotion/style";

// Editing a card is free (credits pay for rendering, not for tweaking). It's
// allowed while the card waits for review, and after a failed render so the
// founder can fix what broke before retrying.

const UPLOADS = "uploads";
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const UPLOAD_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov" };

const uploadsPrefix = (userId: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${UPLOADS}/${userId}/`;

// The renderer fetches the background URL server-side, so only accept
// footage from Pexels or this user's own uploads, never an arbitrary URL.
function allowedFootageUrl(url: string, userId: string) {
  try {
    const u = new URL(url);
    return (u.protocol === "https:" && u.hostname === "videos.pexels.com") || url.startsWith(uploadsPrefix(userId));
  } catch {
    return false;
  }
}

const Line = z.string().trim().max(250, "Keep each line under 250 characters.");

const EditSchema = z.object({
  lines: z
    .array(Line)
    .transform((l) => l.filter(Boolean))
    .pipe(
      z
        .array(z.string())
        .min(1, "Add some text.")
        .max(6, "Use at most 6 lines.")
        .refine((l) => l.join("").length <= 450, "That's a lot of text for one video. Trim it under 450 characters."),
    ),
  textPosition: z.enum(["top", "upper", "center"]),
  textBox: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).nullable().optional(),
  font: z.enum(["classic", "impact", "serif", "typewriter", "marker"]),
  slideImages: z.array(z.string()).max(12).nullable().optional(),
  product: z
    .object({
      url: z.string().max(500),
      aspect: z.number().positive().max(20),
      x: z.number(),
      y: z.number(),
      width: z.number(),
    })
    .nullable()
    .optional(),
  textScale: z.number().min(TEXT_SCALE.min).max(TEXT_SCALE.max),
  // Meme cards: which reaction meme from the library.
  memeId: z.number().int().nullable().optional(),
  background: z
    .object({
      videoUrl: z.string(),
      renderUrl: z.string().optional(),
      posterUrl: z.string().nullable(),
      width: z.number().positive(),
      height: z.number().positive(),
      durationSeconds: z.number().positive().max(600),
      query: z.string().max(100).optional(),
      emotion: z.string().max(30).optional(),
      frames: z.array(z.string().max(500)).max(5).optional(),
      source: z.enum(["pexels", "upload"]).optional(),
      credit: z.object({ name: z.string().max(200), url: z.string().max(500), pexelsUrl: z.string().max(500) }).nullable(),
    })
    .nullable(),
});

export type CardEdit = z.input<typeof EditSchema>;
export type EditResult = { ok: true } | { ok: false; error: string };

export async function saveCardEdit(jobId: string, userId: string, input: unknown): Promise<EditResult> {
  const parsed = EditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your edits and try again." };
  const edit = parsed.data;

  const bg = edit.background;
  if (bg && ![bg.videoUrl, bg.renderUrl].every((u) => u === undefined || allowedFootageUrl(u, userId))) {
    return { ok: false, error: "That footage isn't from the library or your uploads." };
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("generation_jobs")
    .select("id, status, format, style, brands!inner(user_id, profile), video_assets(review_status, render_status), products(image_urls)")
    .eq("id", jobId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  const job = data as unknown as {
    id: string;
    status: string;
    format: string;
    style: Partial<CardStyle> | null;
    brands: { user_id: string; profile: { productCutouts?: { url: string }[] } };
    video_assets: { review_status: string; render_status: string }[];
    products: { image_urls: string[] } | null;
  } | null;
  if (!job || job.brands.user_id !== userId) return { ok: false, error: "Card not found." };
  if (job.status !== "done") return { ok: false, error: "This card can't be edited." };

  const asset = job.video_assets[0];
  const editable =
    !asset || asset.review_status === "pending" || (asset.review_status === "approved" && asset.render_status === "failed");
  if (!editable) return { ok: false, error: "This card is already rendering or rendered." };

  // A product layer may only use one of this brand's own cutouts.
  const cutoutUrls = new Set((job.brands.profile.productCutouts ?? []).map((c) => c.url));
  if (edit.product && !cutoutUrls.has(edit.product.url)) {
    return { ok: false, error: "That product image isn't one of your cutouts." };
  }

  const style: CardStyle = {
    ...withStyleDefaults(job.style),
    textPosition: edit.textPosition,
    textBox: edit.textBox ? clampTextBox(edit.textBox) : null,
    font: edit.font,
    textScale: Math.round(edit.textScale * 100) / 100,
    // Only photos from this card's own product, in the order picked.
    slideImages:
      job.format === "slideshow" && edit.slideImages?.length
        ? edit.slideImages.filter((u) => job.products?.image_urls.includes(u))
        : null,
    product: job.format !== "slideshow" && edit.product ? clampProduct(edit.product) : null,
  };
  if (job.format === "green_screen" && edit.memeId != null) {
    const meme = memeById(edit.memeId);
    if (!meme) return { ok: false, error: "That meme isn't in the library." };
    style.meme = toMemeLayer(meme);
  }
  const { error: updateError } = await supabase
    .from("generation_jobs")
    // A slideshow's pictures are its product photos, never a background video.
    .update({
      overlay_text: edit.lines.join("\n"),
      style,
      background: job.format === "wall_of_text" ? (bg as StockClip | null) : null,
    })
    .eq("id", job.id);
  if (updateError) return { ok: false, error: updateError.message };
  return { ok: true };
}

// The browser uploads straight to storage with a one-time signed URL, so
// large videos don't pass through the Next server (server actions cap
// request bodies at 1 MB).
export async function createUploadUrl(userId: string, contentType: string, size: number) {
  const ext = UPLOAD_TYPES[contentType];
  if (!ext) return { ok: false as const, error: "Upload an MP4, MOV or WebM video." };
  if (size > MAX_UPLOAD_BYTES) return { ok: false as const, error: "Videos can be up to 50 MB." };

  const path = `${userId}/${randomUUID()}.${ext}`;
  const storage = createAdminClient().storage.from(UPLOADS);
  const { data, error } = await storage.createSignedUploadUrl(path);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, path, token: data.token, publicUrl: storage.getPublicUrl(path).data.publicUrl };
}

export type Upload = { url: string; name: string; uploadedAt: string | null };

export async function listUploads(userId: string): Promise<Upload[]> {
  const storage = createAdminClient().storage.from(UPLOADS);
  const { data, error } = await storage.list(userId, { limit: 60, sortBy: { column: "created_at", order: "desc" } });
  if (error) throw error;
  return (data ?? [])
    .filter((f) => f.id && /\.(mp4|webm|mov)$/i.test(f.name))
    .map((f) => ({
      url: storage.getPublicUrl(`${userId}/${f.name}`).data.publicUrl,
      name: f.name,
      uploadedAt: f.created_at ?? null,
    }));
}
