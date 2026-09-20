import "server-only";
import { z } from "zod";
import { createAdminClient } from "./supabase/admin";
import { generateObject } from "./llm";
import { trendSource, type TrendPost } from "./trend-source";
import { storeTrendingAudios, trendingAudiosFrom } from "./audio";

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

const REELS_PER_TAG = 20;
const MIN_VIEWS = 50_000;
const HOOKS_PER_TAG = 6;

const HooksSchema = z.object({
  hooks: z.array(
    z.object({
      source: z.number().describe("Number of the Reel the pattern came from"),
      hook: z
        .string()
        .describe("The Reel's own hook, copied verbatim from the caption (hashtags, emojis and mentions removed). Never a description or an instruction."),
      format: z.enum(["wall_of_text", "slideshow"]).describe("slideshow for list/ranking/'things that' formats, else wall_of_text"),
    }),
  ),
});

const SYSTEM_PROMPT = `You collect the hooks of trending Instagram Reels so small brands can remix them.

You get captions of Reels with their view counts. The first line or two of a caption is usually the text on screen: the hook. Your job is to COPY that hook exactly as written, not to describe or improve it.

- Copy the hook verbatim, including its punctuation, slang and line breaks. Fix only obvious typos, and drop hashtags, @mentions, emojis and any "follow for more" tail.
- Keep at most the first two lines: the setup, and the turn if there is one.
- Skip a Reel when its caption has no real hook (just hashtags, a product pitch, a description of the video, or a caption that only makes sense with that creator's footage).
- Skip engagement bait ("comment X", "tag a friend", "follow for more"), giveaways, ads, news, anything political or religious, and anything about a named real person.
- Keep Hinglish as written, in Latin letters, never Devanagari.
- Pick the Reels whose hooks are structures another brand could reuse: a POV, a contrast, a list, a confession, a "tell me without telling me", an overheard line, a relatable complaint.`;

// The model sometimes returns an instruction, a template or bait instead of
// a hook despite the prompt; those make useless cards, so drop them.
const INSTRUCTION = /^(ask|pose|share|list|use|show|present|write|create|try|post|make|start|tell|describe|highlight)\b/i;
const BAIT = /\b(comments?|tag a|tag your|follow for|link in bio|dm me|giveaway)\b/i;

export function isUsableHook(hook: string) {
  const h = hook.trim();
  return (
    h.length >= 10 &&
    h.length <= 160 &&
    !INSTRUCTION.test(h) &&
    !BAIT.test(h) &&
    !/_{2,}|<[^>]+>/.test(h) && // blanks and placeholders
    !/[\u0900-\u097F]/.test(h) && // Devanagari
    !/\(e\.g\./i.test(h)
  );
}

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
    .filter((h) => top[h.source - 1] && isUsableHook(h.hook))
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
    // The sounds these Reels use, for per-card audio suggestions. Best effort.
    await trendingAudiosFrom(posts, tag)
      .then(storeTrendingAudios)
      .catch((err) => console.error(`audio extraction failed for ${tag}`, err));
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
