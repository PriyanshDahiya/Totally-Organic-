import "server-only";
import { createAdminClient } from "./supabase/admin";
import { RENDER_COST, refundCredits, spendCredits } from "./credits";
import { renderVideo, type RenderJob } from "./render";
import type { StockClip } from "./stock";
import { slideImagesFor, withStyleDefaults, type CardStyle } from "@/remotion/style";

const BUCKET = "renders";

export type ApproveResult = { ok: true } | { ok: false; error: string };

type AssetRow = {
  id: string;
  review_status: "pending" | "approved" | "rejected";
  render_status: "preview" | "rendering" | "rendered" | "failed";
  generation_jobs: {
    id: string;
    status: string;
    format: string;
    overlay_text: string | null;
    background: StockClip | null;
    style: Partial<CardStyle> | null;
    brands: { user_id: string };
    products: { image_urls: string[] } | null;
  };
};

async function loadAsset(videoAssetId: string, userId: string) {
  const { data, error } = await createAdminClient()
    .from("video_assets")
    .select("id, review_status, render_status, generation_jobs!inner(id, status, format, overlay_text, background, style, brands!inner(user_id), products(image_urls))")
    .eq("id", videoAssetId)
    .maybeSingle();
  if (error) throw error;
  const asset = data as unknown as AssetRow | null;
  // Someone else's card looks the same as a missing one.
  if (!asset || asset.generation_jobs.brands.user_id !== userId) return null;
  return asset;
}

// Step 1, in the request: charge a credit and mark the asset as rendering.
// Returns the render to run in the background (via after()), or an error.
// Works for a pending card and for retrying an approved card whose render failed.
export async function startApproval(
  videoAssetId: string,
  userId: string,
): Promise<{ ok: true; render: () => Promise<void> } | { ok: false; error: string }> {
  const asset = await loadAsset(videoAssetId, userId);
  if (!asset) return { ok: false, error: "Card not found." };
  const job = asset.generation_jobs;
  if (job.status !== "done" || !job.overlay_text) return { ok: false, error: "This card didn't finish generating." };
  if (job.format === "slideshow" && !job.products?.image_urls.length) {
    return { ok: false, error: "This slideshow's product has no photos left. Replant your brand to refresh them." };
  }

  const retry = asset.review_status === "approved" && asset.render_status === "failed";
  if (asset.review_status !== "pending" && !retry) return { ok: false, error: "This card was already handled." };

  if (!(await spendCredits(userId, RENDER_COST))) {
    return { ok: false, error: "You're out of credits. Upgrade to render more videos." };
  }

  // Conditional update so a double click (or two tabs) can't start two
  // renders for one card: only the request that flips the status proceeds.
  const supabase = createAdminClient();
  const { data: claimed, error } = await supabase
    .from("video_assets")
    .update({ review_status: "approved", render_status: "rendering", credits_cost: RENDER_COST })
    .eq("id", asset.id)
    .eq("review_status", asset.review_status)
    .eq("render_status", asset.render_status)
    .select("id");
  if (error || !claimed?.length) {
    await refundCredits(userId, RENDER_COST);
    return { ok: false, error: error ? error.message : "This card was already handled." };
  }

  const lines = job.overlay_text.split("\n").filter(Boolean);
  const { slideImages, ...style } = withStyleDefaults(job.style);
  // Everything here comes from the database, never from the browser, so the
  // renderer only ever loads Pexels, the brand's own uploads or its catalog.
  const renderJob: RenderJob =
    job.format === "green_screen"
      ? { composition: "Meme", props: { lines, ...style, backdrop: style.backdrop ?? null, meme: style.meme ?? null } }
      : job.format === "slideshow"
      ? {
          composition: "Slideshow",
          props: { slides: lines, images: slideImagesFor({ slideImages }, job.products!.image_urls), ...style },
        }
      : {
          composition: "WallOfText",
          props: {
            lines,
            // Full-HD file for the final video; older cards only have the preview one.
            backgroundUrl: job.background?.renderUrl ?? job.background?.videoUrl ?? null,
            backgroundDurationSeconds: job.background?.durationSeconds ?? null,
            ...style,
          },
        };
  return { ok: true, render: () => renderAndStore(asset.id, userId, renderJob) };
}

// Step 2, after the response: render, upload, and record the result. A failed
// render is marked failed (never silently dropped) and the credit refunded.
async function renderAndStore(videoAssetId: string, userId: string, job: RenderJob) {
  const supabase = createAdminClient();
  try {
    const { video, thumbnail, renderMs } = await renderVideo(job);
    // A fresh name per render so a retried card never serves a cached old file.
    const base = `${userId}/${videoAssetId}-${Date.now()}`;
    const upload = async (name: string, body: Buffer, contentType: string) => {
      const { error } = await supabase.storage.from(BUCKET).upload(name, body, { contentType, upsert: true });
      if (error) throw error;
      return supabase.storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
    };
    const [videoUrl, thumbnailUrl] = await Promise.all([
      upload(`${base}.mp4`, video, "video/mp4"),
      upload(`${base}.jpg`, thumbnail, "image/jpeg"),
    ]);

    const { error } = await supabase
      .from("video_assets")
      .update({ render_status: "rendered", video_url: videoUrl, thumbnail_url: thumbnailUrl })
      .eq("id", videoAssetId);
    if (error) throw error;
    console.log(`rendered ${videoAssetId} in ${(renderMs / 1000).toFixed(1)}s (${(video.length / 1e6).toFixed(1)} MB)`);
  } catch (err) {
    console.error(`render failed for ${videoAssetId}`, err);
    await supabase.from("video_assets").update({ render_status: "failed" }).eq("id", videoAssetId);
    await refundCredits(userId, RENDER_COST).catch((e) => console.error("refund failed", videoAssetId, e));
  }
}

export async function rejectCard(videoAssetId: string, userId: string): Promise<ApproveResult> {
  const asset = await loadAsset(videoAssetId, userId);
  if (!asset) return { ok: false, error: "Card not found." };
  const { data, error } = await createAdminClient()
    .from("video_assets")
    .update({ review_status: "rejected" })
    .eq("id", asset.id)
    .eq("review_status", "pending")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "This card was already handled." };
  return { ok: true };
}
