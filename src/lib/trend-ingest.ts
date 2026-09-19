import "server-only";
import { z } from "zod";
import { createAdminClient } from "./supabase/admin";
import { generateObject } from "./llm";
import { trendSource, type TrendPost } from "./trend-source";

// Weekly job: pull top Reels for each niche, turn their opening lines into
// reusable hook structures, and store them as TrendingClips. We keep the
// original Reel's URL (to show "remixed from") but never the video itself,
// and hooks are rewritten as general patterns, not creators' own words.

// Hashtags per niche tag. "general" covers relatable-meme formats any brand
// can use; niche tags not listed here fall back to #<tag>.
const HASHTAGS: Record<string, string[]> = {
  general: ["relatable", "relatablememes", "indianmemes", "officememes"],
  fitness: ["gymmemes", "fitnessmemes"],
  gym: ["gymmemes"],
  skincare: ["skincaretips", "skincarememes"],
  grooming: ["mensgrooming", "beardcare"],
  food: ["foodmemes", "healthysnacks"],
  coffee: ["coffeememes", "coffeelover"],
  fashion: ["outfitideas", "fashionmemes"],
};

const REELS_PER_TAG = 30;
const MIN_VIEWS = 50_000;
const HOOKS_PER_TAG = 6;

const HooksSchema = z.object({
  hooks: z.array(
    z.object({
      source: z.number().describe("Number of the Reel the pattern came from"),
      hook: z.string().describe("The hook pattern written as one concrete, general example, under 120 characters"),
      format: z.enum(["wall_of_text", "slideshow"]).describe("slideshow for list/ranking/'things that' formats, else wall_of_text"),
    }),
  ),
});

const SYSTEM_PROMPT = `You study trending Instagram Reels and extract their hook patterns so small brands can remix them.

For each Reel you get its caption and view count. The first line of a caption is usually the on-screen hook. Pick the Reels whose hook is a reusable pattern (a POV, a contrast, a list, a confession, a "tell me without telling me", a relatable complaint) and write the pattern as ONE concrete, general example that any brand could remix.

Rules:
- Rewrite in your own words; keep the structure, not the creator's exact sentence.
- Skip giveaways, promotions, product ads, news, anything political, religious or about specific real people.
- Skip hooks that only work with that creator's video.
- Keep Hinglish if the original is Hinglish.`;

async function hooksFrom(posts: TrendPost[], limit: number) {
  const top = posts
    .filter((p) => (p.views ?? 0) >= MIN_VIEWS)
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, 15);
  if (top.length === 0) return [];
  const { hooks } = await generateObject({
    name: "trend_hooks",
    schema: HooksSchema,
    system: SYSTEM_PROMPT,
    prompt: top.map((p, i) => `Reel ${i + 1} (${p.views?.toLocaleString("en-IN")} views): ${p.caption.slice(0, 300)}`).join("\n"),
  });
  return hooks
    .filter((h) => top[h.source - 1] && h.hook.trim().length >= 10)
    .slice(0, limit)
    .map((h) => ({ ...h, post: top[h.source - 1] }));
}

export async function ingestTrends(): Promise<{ inserted: number; tags: string[] }> {
  const source = trendSource();
  if (!source) throw new Error("TREND_SOURCE_API_KEY isn't set, so there's no trend provider to read from.");
  const supabase = createAdminClient();

  // Every niche any brand cares about, plus the general relatable formats.
  const { data: brands } = await supabase.from("brands").select("profile");
  const tags = new Set(["general"]);
  for (const b of brands ?? []) for (const t of (b.profile as { niche_tags?: string[] }).niche_tags ?? []) tags.add(t.toLowerCase());

  let inserted = 0;
  for (const tag of tags) {
    const hashtags = HASHTAGS[tag] ?? [tag.replace(/[^a-z0-9]/g, "")];
    const posts = (
      await Promise.all(hashtags.map((h) => source.reelsForHashtag(h, REELS_PER_TAG).catch(() => [] as TrendPost[])))
    ).flat();
    const hooks = await hooksFrom(posts, HOOKS_PER_TAG).catch((err) => {
      console.error(`hook extraction failed for ${tag}`, err);
      return [];
    });
    if (hooks.length === 0) continue;
    const { error, count } = await supabase.from("trending_clips").upsert(
      hooks.map((h) => ({
        source_url: h.post.url,
        media_type: "video",
        niche_tags: [tag],
        hook_text: h.hook.trim(),
        format: h.format,
        views: h.post.views,
        fetched_at: new Date().toISOString(),
      })),
      { onConflict: "source_url", count: "exact" },
    );
    if (error) throw error;
    inserted += count ?? hooks.length;
  }
  return { inserted, tags: [...tags] };
}
