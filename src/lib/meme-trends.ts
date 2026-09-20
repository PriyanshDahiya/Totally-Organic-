import "server-only";
import { createAdminClient } from "./supabase/admin";
import { trendSource, type TrendPost } from "./trend-source";
import { MEMES, type MemeEntry } from "./memes";

// How alive each meme is on Instagram right now. The editorial popularity
// score in the catalog is the starting point; this replaces it with real
// numbers (how many Reels used the meme lately and how far they travelled),
// so cards stop reaching for memes nobody posts any more.
//
// Runs fortnightly (scripts/scan-meme-trends.ts) and stops before the free
// Apify credit runs out. Results live as one JSON file in the "memes"
// bucket: ~60 rows, read on most card generations, so a table would buy
// nothing.

// Instagram's hashtag for a meme, when it isn't just the name run together.
const HASHTAG: Record<number, string> = {
  // New pack (101+)
  101: "shockedcatmeme",
  102: "tobeymaguire",
  103: "pedropascal",
  107: "michaelscott",
  109: "coffindancememe",
  111: "spidermanmeme",
  112: "cryingcatmeme",
  116: "messi",
  118: "petergriffin",
  119: "thomasshelby",
  125: "homelander",
  127: "funnycatvideos",
  129: "pussinboots",
  132: "ishowspeed",
  133: "sideeyedog",
  135: "gymmotivation",
  // First pack
  3: "gtameme",
  7: "emotionaldamagememe",
  18: "confusedtravolta",
  20: "gtasanandreas",
  29: "johncena",
  47: "mathladymeme",
  55: "stopitgetsomehelp",
  59: "coffindancememe",
  60: "therock",
  64: "300movie",
  66: "thuglifememe",
  71: "breakingbadmeme",
};

export const memeHashtag = (m: MemeEntry) =>
  HASHTAG[m.id] ?? m.name.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "").slice(0, 28);

// Memes scanned per run, most promising first, and Reels fetched per meme.
// 25 x 8 = 200 results, about $0.38 on Apify's pay-per-result pricing.
const MEMES_PER_SCAN = 25;
const REELS_PER_MEME = 8;
const FRESH_MS = 30 * 24 * 60 * 60 * 1000;
// Apify's free tier gives $5 of usage a month; stop before it's gone.
const BUDGET_USD = Number(process.env.APIFY_BUDGET_USD ?? 4.5);

// score null = the hashtag returned nothing, so we know nothing about this
// meme (not the same as "nobody posts it"); the editorial score stands.
export type MemeTrend = { meme_id: number; hashtag: string; reels_30d: number; median_views: number; score: number | null; checked_at: string };

const BUCKET = "memes";
const TRENDS_FILE = "trends/meme-trends.json";
const CACHE_MS = 10 * 60 * 1000;
let cache: { at: number; trends: MemeTrend[] } | null = null;

export async function loadMemeTrends(): Promise<MemeTrend[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.trends;
  const { data } = createAdminClient().storage.from(BUCKET).getPublicUrl(TRENDS_FILE);
  const res = await fetch(`${data.publicUrl}?t=${Math.floor(Date.now() / CACHE_MS)}`);
  const trends = res.ok ? ((await res.json()) as MemeTrend[]) : [];
  cache = { at: Date.now(), trends };
  return trends;
}

async function saveMemeTrends(rows: MemeTrend[]) {
  const { error } = await createAdminClient()
    .storage.from(BUCKET)
    .upload(TRENDS_FILE, JSON.stringify(rows), { contentType: "application/json", upsert: true });
  if (error) throw error;
  cache = null;
}

// Apify reports usage for the current month; a scan is skipped when the
// free credit is nearly spent rather than starting to cost money.
export async function apifyUsage(): Promise<{ used: number; limit: number } | null> {
  const token = process.env.TREND_SOURCE_API_KEY;
  if (!token) return null;
  const res = await fetch("https://api.apify.com/v2/users/me/limits", { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const { data } = (await res.json()) as { data: { current?: { monthlyUsageUsd?: number }; limits?: { maxMonthlyUsageUsd?: number } } };
  return { used: data.current?.monthlyUsageUsd ?? 0, limit: data.limits?.maxMonthlyUsageUsd ?? 5 };
}

const median = (ns: number[]) => (ns.length ? [...ns].sort((a, b) => a - b)[Math.floor(ns.length / 2)] : 0);

// 1-10 from real use: how many recent Reels used the meme, and how far the
// typical one travelled. A meme nobody posted in a month scores 0 and drops
// out of automatic picks.
export function trendScore(posts: TrendPost[]): { reels30d: number; medianViews: number; score: number | null } {
  // Nothing came back: the hashtag is wrong or too small to judge by.
  if (posts.length === 0) return { reels30d: 0, medianViews: 0, score: null };
  const since = Date.now() - FRESH_MS;
  const recent = posts.filter((p) => p.postedAt && new Date(p.postedAt).getTime() >= since);
  const views = recent.map((p) => p.views ?? 0).filter(Boolean);
  const medianViews = median(views);
  // Posts exist but none are recent: the meme really has gone quiet.
  if (recent.length === 0) return { reels30d: 0, medianViews: 0, score: 0 };
  // Half the score from "is it being posted", half from "does it travel".
  const usage = Math.min(1, recent.length / REELS_PER_MEME);
  const reach = Math.min(1, Math.log10(1 + medianViews) / 6); // 1M views ≈ full marks
  return { reels30d: recent.length, medianViews, score: Math.round((usage * 5 + reach * 5) * 10) / 10 };
}

export async function scanMemeTrends(opts: { memes?: number; perMeme?: number } = {}) {
  const source = trendSource();
  if (!source) throw new Error("TREND_SOURCE_API_KEY isn't set.");
  const usage = await apifyUsage();
  if (usage && usage.used >= BUDGET_USD) {
    throw new Error(`Apify usage is $${usage.used.toFixed(2)} of $${usage.limit}; skipping to stay inside the free credit.`);
  }

  const known = await loadMemeTrends();
  const lastChecked = new Map(known.map((t) => [t.meme_id, Date.parse(t.checked_at)]));
  // Best-known memes first, then the ones we've not checked in longest.
  const pool = [...MEMES]
    .sort((a, b) => (lastChecked.get(a.id) ?? 0) - (lastChecked.get(b.id) ?? 0) || b.popularity - a.popularity)
    .slice(0, opts.memes ?? MEMES_PER_SCAN);

  const rows: MemeTrend[] = [];
  for (const meme of pool) {
    const hashtag = memeHashtag(meme);
    const posts = await source.reelsForHashtag(hashtag, opts.perMeme ?? REELS_PER_MEME).catch((err) => {
      console.error(`meme trend scan failed for #${hashtag}`, err);
      return [] as TrendPost[];
    });
    const { reels30d, medianViews, score } = trendScore(posts);
    rows.push({ meme_id: meme.id, hashtag, reels_30d: reels30d, median_views: medianViews, score, checked_at: new Date().toISOString() });
  }
  if (rows.length) {
    const kept = known.filter((t) => !rows.some((r) => r.meme_id === t.meme_id));
    await saveMemeTrends([...kept, ...rows]);
  }
  return rows;
}

// Live scores by meme id, for weighting picks. Empty before the first scan.
export async function liveMemeScores(): Promise<Map<number, number>> {
  const trends = await loadMemeTrends();
  return new Map(trends.flatMap((t) => (t.score === null ? [] : [[t.meme_id, t.score] as [number, number]])));
}
