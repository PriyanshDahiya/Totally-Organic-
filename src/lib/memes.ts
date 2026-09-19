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

// The menu the model picks from: well-known memes only, most popular first,
// minus the ones used recently.
export function memeMenu(exclude: Set<number> = new Set()) {
  const known = MEMES.filter((m) => m.popularity >= MIN_AUTO_POPULARITY);
  const pool = known.filter((m) => !exclude.has(m.id));
  return (pool.length ? pool : known)
    .map((m) => `${m.id}. ${m.name}${m.quote ? ` (says ${m.quote})` : ""}: ${m.mood}; use when ${m.useWhen}; popularity ${m.popularity}/10`)
    .join("\n");
}

// A random pick weighted toward well-known memes (when the model's pick is invalid).
export function pickPopularMeme(): MemeEntry {
  const pool = MEMES.filter((m) => m.popularity >= MIN_AUTO_POPULARITY);
  let r = Math.random() * pool.reduce((n, m) => n + m.popularity ** 2, 0);
  for (const m of pool) if ((r -= m.popularity ** 2) <= 0) return m;
  return pool[0];
}
