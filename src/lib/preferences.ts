import "server-only";
import { createAdminClient } from "./supabase/admin";

// Learns what a founder likes from their swipes: every approve and skip
// nudges how often that hook, angle and format come up again. Uses a
// smoothed approval rate, (approved + 1) / (seen + 2), so something never
// seen scores a neutral 0.5 and one early skip doesn't bury a hook forever.

const LOOKBACK = 80;

export type Preferences = {
  hook: (clipId: string) => number;
  angle: (title: string) => number;
  format: (format: string) => number;
  // How many swipes the weights are based on (0 = nothing learned yet).
  swipes: number;
};

type Tally = Map<string, { yes: number; no: number }>;

function score(tally: Tally, key: string) {
  const t = tally.get(key);
  return t ? (t.yes + 1) / (t.yes + t.no + 2) : 0.5;
}

export async function loadPreferences(brandId: string): Promise<Preferences> {
  const { data, error } = await createAdminClient()
    .from("generation_jobs")
    .select("trending_clip_id, angle, format, video_assets!inner(review_status)")
    .eq("brand_id", brandId)
    .in("video_assets.review_status", ["approved", "rejected"])
    .order("requested_at", { ascending: false })
    .limit(LOOKBACK);
  if (error) throw error;

  const hooks: Tally = new Map();
  const angles: Tally = new Map();
  const formats: Tally = new Map();
  const rows = (data ?? []) as unknown as {
    trending_clip_id: string;
    angle: string;
    format: string;
    video_assets: { review_status: string }[];
  }[];
  for (const r of rows) {
    const approved = r.video_assets[0]?.review_status === "approved";
    for (const [tally, key] of [[hooks, r.trending_clip_id], [angles, r.angle], [formats, r.format]] as const) {
      const t = tally.get(key) ?? { yes: 0, no: 0 };
      if (approved) t.yes++;
      else t.no++;
      tally.set(key, t);
    }
  }

  return {
    hook: (id) => score(hooks, id),
    angle: (title) => score(angles, title),
    format: (f) => score(formats, f),
    swipes: rows.length,
  };
}

// Weighted random pick: higher weight, more likely, but never certain, so
// the feed keeps exploring instead of repeating one winning formula.
export function weightedPick<T>(items: T[], weight: (item: T) => number): T {
  const weights = items.map((i) => Math.max(0.05, weight(i)));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
