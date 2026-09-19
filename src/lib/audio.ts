import "server-only";
import { z } from "zod";
import { createAdminClient } from "./supabase/admin";
import { generateObject } from "./llm";
import type { TrendPost } from "./trend-source";
import type { Emotion } from "./hooks";

// Trending audio suggestions. We can't bake trending songs into the MP4
// (they're licensed only inside Instagram's own audio picker, and the
// publishing API can't attach them), so each card suggests one and links
// to its Instagram audio page, where "Use audio" adds it when posting.

export const MOODS = ["funny", "dramatic", "sad", "upbeat", "chill", "motivational"] as const;
export type Mood = (typeof MOODS)[number];
// Labels for sounds that trend but don't suit a brand's meme or story post
// (the romantic Bollywood lip-sync and devotional tracks that fill Indian
// trending lists). Stored so we know they were seen, never suggested.
const UNSUITABLE = ["romantic", "devotional", "unsuitable"] as const;

// The feeling a card's footage shows -> audio moods that fit it, best first.
const MOODS_FOR: Record<Emotion, Mood[]> = {
  frustrated: ["dramatic", "funny", "sad"],
  tired: ["sad", "chill", "funny"],
  shocked: ["dramatic", "funny"],
  smug: ["upbeat", "funny"],
  happy: ["upbeat", "chill"],
  confused: ["funny", "dramatic"],
  determined: ["motivational", "upbeat"],
  relaxed: ["chill", "upbeat"],
  embarrassed: ["funny", "sad"],
};

export type SuggestedAudio = { id: string; title: string; artist: string | null; reels: number; url: string };

export const audioUrl = (id: string) => `https://www.instagram.com/reels/audio/${id}/`;

// Keep audios seen this often in a niche's top Reels; creators' own sounds
// only when they're clearly spreading (used by more than one top Reel).
const MIN_ORIGINAL_REELS = 2;
const AUDIOS_PER_TAG = 12;
// Suggestions only from audios seen in the last few weeks: trends move fast.
const FRESH_DAYS = 21;

const MoodSchema = z.object({
  audios: z.array(z.object({ n: z.number(), mood: z.enum([...MOODS, ...UNSUITABLE]) })),
});

// From one niche's scraped Reels: the audios they share, tagged with a mood.
export async function trendingAudiosFrom(posts: TrendPost[], tag: string) {
  const byId = new Map<string, { audio: NonNullable<TrendPost["audio"]>; reels: number; views: number; captions: string[] }>();
  for (const p of posts) {
    if (!p.audio) continue;
    const e = byId.get(p.audio.id) ?? { audio: p.audio, reels: 0, views: 0, captions: [] };
    e.reels += 1;
    e.views += p.views ?? 0;
    if (e.captions.length < 2) e.captions.push(p.caption.slice(0, 120));
    byId.set(p.audio.id, e);
  }
  const picked = [...byId.values()]
    .filter((e) => !e.audio.isOriginal || e.reels >= MIN_ORIGINAL_REELS)
    .sort((a, b) => b.reels - a.reels || b.views - a.views)
    .slice(0, AUDIOS_PER_TAG);
  if (picked.length === 0) return [];

  const { audios } = await generateObject({
    name: "audio_moods",
    schema: MoodSchema,
    system:
      "You label Instagram Reels audios with the mood they suit as background for a brand's short meme or story post. Use the song and artist if you know them; for creators' original sounds, judge from the captions of Reels using them. " +
      "Label romantic or heartbreak songs (lip-sync, couple and wedding reels) as romantic, religious songs as devotional, and anything with explicit lyrics, political content or a real person's speech that only makes sense with its original video as unsuitable. Funny meme sounds, movie dialogues used as jokes, instrumentals and upbeat pop get the mood they fit.",
    prompt: picked
      .map((e, i) => `${i + 1}. "${e.audio.title}" by ${e.audio.artist ?? "unknown"}; used on: ${e.captions.join(" | ")}`)
      .join("\n"),
  });
  const moods = new Map(audios.map((a) => [a.n, a.mood]));

  return picked.map((e, i) => ({
    audio_id: e.audio.id,
    niche_tag: tag,
    title: e.audio.title,
    artist: e.audio.artist,
    is_original: e.audio.isOriginal,
    mood: moods.get(i + 1) ?? null,
    reel_count: e.reels,
    total_views: e.views,
    seen_at: new Date().toISOString(),
  }));
}

export async function storeTrendingAudios(rows: Awaited<ReturnType<typeof trendingAudiosFrom>>) {
  if (rows.length === 0) return;
  const { error } = await createAdminClient().from("trending_audios").upsert(rows, { onConflict: "audio_id,niche_tag" });
  if (error) throw error;
}

// A trending audio for a card: from the brand's niches or general memes,
// matching the card's feeling when possible. Null when nothing is stored.
export async function suggestAudio(nicheTags: string[], emotion: Emotion | null): Promise<SuggestedAudio | null> {
  const since = new Date(Date.now() - FRESH_DAYS * 86_400_000).toISOString();
  const { data, error } = await createAdminClient()
    .from("trending_audios")
    .select("audio_id, title, artist, mood, reel_count, total_views")
    .in("niche_tag", [...nicheTags.map((t) => t.toLowerCase()), "general"])
    .gte("seen_at", since)
    .in("mood", [...MOODS]);
  if (error) throw error;
  if (!data?.length) return null;

  const wanted = emotion ? MOODS_FOR[emotion] : [];
  const score = (a: (typeof data)[number]) => {
    const rank = a.mood ? wanted.indexOf(a.mood as Mood) : -1;
    return (rank === -1 ? 0 : 10 - rank * 3) + Math.log10(1 + a.total_views) + a.reel_count;
  };
  // Vary among the best few so every card doesn't get the same sound.
  const top = [...data].sort((a, b) => score(b) - score(a)).slice(0, emotion ? 3 : 6);
  const a = top[Math.floor(Math.random() * top.length)];
  return { id: a.audio_id, title: a.title, artist: a.artist, reels: a.reel_count, url: audioUrl(a.audio_id) };
}
