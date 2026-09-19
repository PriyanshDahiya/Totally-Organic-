import catalog from "./meme-catalog.json";
import type { MemeLayer } from "@/remotion/style";

// The reaction-meme library for the Meme (green screen) format: keyed clips
// in the public "memes" bucket, described so the model can pick the one
// whose line lands the joke. Built by scripts/key-memes.py and
// scripts/upload-memes.ts.

export type MemeEntry = MemeLayer & { quote: string | null; mood: string; useWhen: string };

export const MEMES: MemeEntry[] = catalog as MemeEntry[];

export const memeById = (id: number) => MEMES.find((m) => m.id === id) ?? null;

export function toMemeLayer({ quote: _q, mood: _m, useWhen: _u, ...layer }: MemeEntry): MemeLayer {
  return layer;
}

// The menu the model picks from.
export function memeMenu(exclude: Set<number> = new Set()) {
  const pool = MEMES.filter((m) => !exclude.has(m.id));
  return (pool.length ? pool : MEMES).map((m) => `${m.id}. ${m.name}${m.quote ? ` (says ${m.quote})` : ""}: ${m.mood}; use when ${m.useWhen}`).join("\n");
}
