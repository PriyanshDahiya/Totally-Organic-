import "server-only";
import { createAdminClient } from "./supabase/admin";
import type { Music } from "@/remotion/WallOfText";

// Background music comes from the public "music" storage bucket. Only put
// tracks there whose license covers use in brands' social media ads (e.g. a
// royalty-free library you've licensed); trending songs from Instagram's
// library can't be attached through the API and baking them in risks
// takedowns. File name convention: "Title -- Credit.mp3" (credit optional).
// An empty bucket just means silent videos.

const BUCKET = "music";
const CACHE_MS = 5 * 60 * 1000;

let cache: { at: number; tracks: Music[] } | null = null;

async function listTracks(): Promise<Music[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.tracks;
  const storage = createAdminClient().storage.from(BUCKET);
  const { data, error } = await storage.list("", { limit: 200 });
  if (error) throw error;
  const tracks = (data ?? [])
    .filter((f) => /\.(mp3|m4a|aac|wav)$/i.test(f.name))
    .map((f) => {
      const [title, credit] = f.name.replace(/\.[^.]+$/, "").split(" -- ");
      return { url: storage.getPublicUrl(f.name).data.publicUrl, title: title.trim(), credit: credit?.trim() || null };
    });
  cache = { at: Date.now(), tracks };
  return tracks;
}

export async function pickMusic(): Promise<Music | null> {
  const tracks = await listTracks().catch((err) => {
    console.error("music listing failed", err);
    return [];
  });
  return tracks.length ? tracks[Math.floor(Math.random() * tracks.length)] : null;
}
