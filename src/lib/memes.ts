import catalog from "./meme-catalog.json";
import type { MemeLayer } from "@/remotion/style";

// The reaction-meme library for the Meme (green screen) format: keyed clips
// in the public "memes" bucket, described so the model can pick the one
// whose line lands the joke. Built by scripts/key-memes.py and
// scripts/upload-memes.ts.

// popularity: 1-10, how widely recognised the meme is (see scripts/upload-memes.ts).
export type MemeEntry = MemeLayer & { quote: string | null; mood: string; useWhen: string; popularity: number };

// Most recognisable first.
export const MEMES: MemeEntry[] = (catalog as MemeEntry[]).slice().sort((a, b) => b.popularity - a.popularity);

// Obscure memes don't make a post travel; automatic picks skip them (the
// editor still offers them).
export const MIN_AUTO_POPULARITY = 4;

export const memeById = (id: number) => MEMES.find((m) => m.id === id) ?? null;

export function toMemeLayer({ quote: _q, mood: _m, useWhen: _u, popularity: _p, ...layer }: MemeEntry): MemeLayer {
  return layer;
}

// How good a meme is to reach for now: the live score from the Instagram
// scan when we have one (see lib/meme-trends.ts), else the editorial score.
export const memeScore = (m: MemeEntry, live?: Map<number, number>) => live?.get(m.id) ?? m.popularity;

function autoPool(live?: Map<number, number>) {
  const usable = MEMES.filter((m) => memeScore(m, live) >= MIN_AUTO_POPULARITY);
  // A scan that found nothing recent for everything shouldn't empty the feed.
  return usable.length ? usable : MEMES.filter((m) => m.popularity >= MIN_AUTO_POPULARITY);
}

// The menu the model picks from: memes worth using, best first, minus the
// ones used recently.
export function memeMenu(exclude: Set<number> = new Set(), live?: Map<number, number>) {
  const known = autoPool(live).sort((a, b) => memeScore(b, live) - memeScore(a, live));
  const pool = known.filter((m) => !exclude.has(m.id));
  return (pool.length ? pool : known)
    .map((m) => {
      const used = live?.get(m.id);
      return `${m.id}. ${m.name}${m.quote ? ` (says ${m.quote})` : ""}: ${m.mood}; use when ${m.useWhen}; popularity ${
        used === undefined ? `${m.popularity}/10` : `${used}/10 (from Reels posted this month)`
      }`;
    })
    .join("\n");
}

// A random pick weighted toward the best-scoring memes (when the model's
// pick is invalid).
export function pickPopularMeme(live?: Map<number, number>): MemeEntry {
  const pool = autoPool(live);
  const weight = (m: MemeEntry) => memeScore(m, live) ** 2;
  let r = Math.random() * pool.reduce((n, m) => n + weight(m), 0);
  for (const m of pool) if ((r -= weight(m)) <= 0) return m;
  return pool[0];
}
