// Uploads the keyed memes (from scripts/key-memes.py) to the public "memes"
// bucket and writes the catalog the app reads (src/lib/meme-catalog.json).
// Run: node --env-file=.env.local --import tsx scripts/upload-memes.ts <keyed folder>
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "memes";
// Streamer and gamer reactions: too niche for D2C buyers, left out.
const SKIP = new Set([11, 14, 17, 19, 24, 26, 27, 31, 33, 34, 45, 54, 62, 63, 68, 70]);
// Corrections to the hand-written metadata, from transcribing the audio.
const FIX: Record<number, { quote?: string; useWhen?: string; mood?: string }> = {
  29: { quote: "'Are you sure about that?'", mood: "doubt, calling out", useWhen: "doubting a confident claim / calling out a lie" },
};

// Popularity 1-10: how instantly a 20-35 year old Instagram user in India
// recognises the meme, and whether it's still used in Reels today. An
// editorial estimate (no public source measures meme popularity); revisit
// when the library changes.
const POPULARITY: Record<number, number> = {1: 7, 2: 5, 3: 9, 4: 6, 5: 5, 6: 3, 7: 9, 8: 5, 9: 5, 10: 3, 12: 6, 13: 4, 15: 4, 16: 5, 18: 8, 20: 9, 21: 4, 22: 4, 23: 6, 25: 5, 28: 5, 29: 8, 30: 6, 32: 5, 35: 5, 36: 6, 37: 6, 38: 7, 39: 6, 40: 3, 41: 6, 42: 4, 43: 5, 44: 6, 46: 4, 47: 8, 48: 3, 49: 6, 50: 3, 51: 7, 52: 5, 53: 6, 55: 8, 56: 4, 57: 7, 58: 7, 59: 10, 60: 9, 61: 4, 64: 7, 65: 4, 66: 7, 67: 5, 69: 6, 71: 6};

type Entry = {
  id: number; slug: string; name: string; quote: string | null; mood: string; useWhen: string; tags: string[];
  transparent: boolean; file: string; poster: string; width: number; height: number; durationSeconds: number;
};

async function main() {
  const dir = process.argv[2];
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const { error: bucketError } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: ["video/webm", "video/mp4", "image/png"],
  });
  if (bucketError && !/exists/i.test(bucketError.message)) throw bucketError;

  const entries = (JSON.parse(await readFile(path.join(dir, "catalog.json"), "utf8")) as Entry[]).filter((e) => !SKIP.has(e.id));
  const catalog = [];
  for (const e of entries) {
    const up = async (name: string, type: string) => {
      const { error } = await supabase.storage.from(BUCKET).upload(name, await readFile(path.join(dir, name)), { contentType: type, upsert: true });
      if (error) throw error;
      return supabase.storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
    };
    const url = await up(e.file, e.transparent ? "video/webm" : "video/mp4");
    const poster = await up(e.poster, "image/png");
    catalog.push({
      id: e.id, name: e.name, quote: FIX[e.id]?.quote ?? e.quote, mood: FIX[e.id]?.mood ?? e.mood,
      useWhen: FIX[e.id]?.useWhen ?? e.useWhen, url, poster, width: e.width, height: e.height,
      durationSeconds: e.durationSeconds, transparent: e.transparent, popularity: POPULARITY[e.id] ?? 5,
    });
    console.log("uploaded", e.slug);
  }
  await writeFile("src/lib/meme-catalog.json", JSON.stringify(catalog, null, 1) + "\n");
  console.log(`${catalog.length} memes in the catalog`);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
