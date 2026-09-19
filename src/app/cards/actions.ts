"use server";

import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rejectCard as reject, startApproval, type ApproveResult } from "@/lib/approve";
import { getCurrentUser } from "@/lib/current-user";
import { brandCutouts, generateCard, type StoredCutout } from "@/lib/generate";
import { createUploadUrl, listUploads, saveCardEdit, type CardEdit, type EditResult, type Upload } from "@/lib/edit";
import { searchClips, type StockClip } from "@/lib/stock";
import { findFaces, placeAroundFaces } from "@/lib/faces";
import { wallOfTextFontSize, type FontId, type TextBox } from "@/remotion/style";
import { loadCard, type PreviewCard } from "./data";

async function myBrandId() {
  const me = await getCurrentUser();
  const { data } = await createAdminClient().from("brands").select("id").eq("user_id", me.id).maybeSingle();
  return data?.id ?? null;
}

export async function createPreviewCard(): Promise<PreviewCard> {
  try {
    const brandId = await myBrandId();
    if (!brandId) return { status: "failed", jobId: null, error: "Set up your brand profile first." };

    const card = await generateCard(brandId);
    // Read back what was saved, so a fresh card and a reloaded one are identical.
    return await loadCard(card.jobId, brandId);
  } catch (err) {
    console.error("preview card failed", err);
    return { status: "failed", jobId: null, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function approveCard(videoAssetId: string): Promise<ApproveResult> {
  const me = await getCurrentUser();
  const started = await startApproval(videoAssetId, me.id);
  if (!started.ok) return started;
  // Rendering takes ~30-60s; respond now and let the page poll for the result.
  after(started.render);
  return { ok: true };
}

export async function rejectCard(videoAssetId: string): Promise<ApproveResult> {
  const me = await getCurrentUser();
  return reject(videoAssetId, me.id);
}

// Polled by cards that are rendering.
export async function refreshCard(jobId: string): Promise<PreviewCard> {
  const brandId = await myBrandId();
  if (!brandId) return { status: "failed", jobId, error: "Card not found." };
  return loadCard(jobId, brandId);
}

export async function getCredits(): Promise<number> {
  const me = await getCurrentUser();
  const { data } = await createAdminClient().from("users").select("credits_remaining").eq("id", me.id).single();
  return data?.credits_remaining ?? 0;
}

// --- Card editor ---------------------------------------------------------

export async function saveEdit(jobId: string, edit: CardEdit): Promise<EditResult> {
  const me = await getCurrentUser();
  return saveCardEdit(jobId, me.id, edit);
}

export async function searchFootage(query: string): Promise<{ ok: true; clips: StockClip[] } | { ok: false; error: string }> {
  const q = query.trim().slice(0, 80);
  if (!q) return { ok: true, clips: [] };
  try {
    return { ok: true, clips: await searchClips(q) };
  } catch (err) {
    console.error("footage search failed", err);
    return { ok: false, error: "Couldn't search the library right now. Try again." };
  }
}

// Scene ideas for the library's quick-pick chips.
export async function footageSuggestions(): Promise<string[]> {
  const me = await getCurrentUser();
  const { data } = await createAdminClient().from("brands").select("profile").eq("user_id", me.id).maybeSingle();
  return ((data?.profile as { scenes?: string[] } | undefined)?.scenes ?? []).slice(0, 8);
}

export async function requestUpload(contentType: string, size: number) {
  const me = await getCurrentUser();
  return createUploadUrl(me.id, contentType, size);
}

export async function myUploads(): Promise<Upload[]> {
  const me = await getCurrentUser();
  return listUploads(me.id).catch(() => []);
}

// Smart positioning for the editor: where the text should go to stay off
// faces in this footage. Only Pexels stills are fetched (never arbitrary URLs).
export async function smartPosition(
  frames: string[],
  lines: string[],
  font: FontId,
  textScale: number,
): Promise<{ ok: true; textBox: TextBox | null } | { ok: false; error: string }> {
  const safe = frames.filter((u) => {
    try {
      return new URL(u).hostname === "images.pexels.com";
    } catch {
      return false;
    }
  });
  if (safe.length === 0) return { ok: false, error: "Smart positioning works on library clips, not uploads yet." };
  try {
    const faces = await findFaces(safe);
    return { ok: true, textBox: placeAroundFaces(faces, lines, wallOfTextFontSize(lines, { font, textScale })) };
  } catch (err) {
    console.error("smart position failed", err);
    return { ok: false, error: "Couldn't analyse this clip. Drag the text instead." };
  }
}

// The brand's product cutouts, for the editor's product picker (made on
// first use and cached on the brand).
export async function myProductCutouts(): Promise<StoredCutout[]> {
  const me = await getCurrentUser();
  const supabase = createAdminClient();
  const { data: brand } = await supabase.from("brands").select("id, profile").eq("user_id", me.id).maybeSingle();
  if (!brand) return [];
  const { data: products } = await supabase.from("products").select("id, name, image_urls").eq("brand_id", brand.id);
  return brandCutouts(brand.id, brand.profile as Record<string, unknown>, products ?? []).catch(() => []);
}
