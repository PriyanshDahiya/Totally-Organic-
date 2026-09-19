import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StockClip } from "@/lib/stock";
import type { SuggestedAudio } from "@/lib/audio";
import { withStyleDefaults, type CardStyle } from "@/remotion/style";

export type ReviewStatus = "pending" | "approved" | "rejected";
export type RenderStatus = "preview" | "rendering" | "rendered" | "failed";

export type PreviewCard =
  | {
      status: "done";
      jobId: string;
      format: "wall_of_text" | "slideshow";
      // Product photos for a slideshow; empty for Wall of Text.
      images: string[];
      productName: string | null;
      hook: string;
      angle: string;
      lines: string[];
      caption: string;
      why: string | null;
      background: StockClip | null;
      style: CardStyle;
      videoAssetId: string | null;
      reviewStatus: ReviewStatus;
      renderStatus: RenderStatus;
      videoUrl: string | null;
      // A trending Instagram audio to add when posting.
      suggestedAudio: SuggestedAudio | null;
    }
  | { status: "pending"; jobId: string }
  | { status: "failed"; jobId: string | null; error: string };

// A job still "generating" after this long died mid-way (server restart,
// closed tab), so it's shown as failed rather than pending forever.
const STALE_MS = 2 * 60 * 1000;
const PAGE_SIZE = 30;

type JobRow = {
  id: string;
  status: "queued" | "generating" | "done" | "failed";
  format: "wall_of_text" | "slideshow";
  angle: string;
  overlay_text: string | null;
  why: string | null;
  background: StockClip | null;
  style: Partial<CardStyle> | null;
  suggested_audio: SuggestedAudio | null;
  requested_at: string;
  trending_clips: { hook_text: string } | null;
  products: { name: string; image_urls: string[] } | null;
  video_assets: {
    id: string;
    caption_text: string | null;
    review_status: ReviewStatus;
    render_status: RenderStatus;
    video_url: string | null;
  }[];
};

export function toPreviewCard(job: JobRow): PreviewCard {
  if (job.status === "failed") return { status: "failed", jobId: job.id, error: "Generation failed. Try another card." };
  if (job.status !== "done") {
    return Date.now() - new Date(job.requested_at).getTime() > STALE_MS
      ? { status: "failed", jobId: job.id, error: "This card timed out." }
      : { status: "pending", jobId: job.id };
  }
  return {
    status: "done",
    jobId: job.id,
    format: job.format,
    images: job.products?.image_urls ?? [],
    productName: job.products?.name ?? null,
    hook: job.trending_clips?.hook_text ?? "",
    angle: job.angle,
    lines: (job.overlay_text ?? "").split("\n").filter(Boolean),
    caption: job.video_assets[0]?.caption_text ?? "",
    why: job.why,
    background: job.background,
    style: withStyleDefaults(job.style),
    videoAssetId: job.video_assets[0]?.id ?? null,
    reviewStatus: job.video_assets[0]?.review_status ?? "pending",
    renderStatus: job.video_assets[0]?.render_status ?? "preview",
    videoUrl: job.video_assets[0]?.video_url ?? null,
    suggestedAudio: job.suggested_audio,
  };
}

export const CARD_SELECT =
  "id, status, format, angle, overlay_text, why, background, style, suggested_audio, requested_at, trending_clips(hook_text), products(name, image_urls), video_assets(id, caption_text, review_status, render_status, video_url)";

export async function loadCards(brandId: string): Promise<PreviewCard[]> {
  const { data, error } = await createAdminClient()
    .from("generation_jobs")
    .select(CARD_SELECT)
    .eq("brand_id", brandId)
    .order("requested_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (error) throw error;
  // Rejected cards leave the feed.
  return (data as unknown as JobRow[])
    .map(toPreviewCard)
    .filter((c) => c.status !== "done" || c.reviewStatus !== "rejected");
}

export async function loadCard(jobId: string, brandId: string): Promise<PreviewCard> {
  const { data, error } = await createAdminClient()
    .from("generation_jobs")
    .select(CARD_SELECT)
    .eq("id", jobId)
    .eq("brand_id", brandId)
    .single();
  if (error) throw error;
  return toPreviewCard(data as unknown as JobRow);
}
