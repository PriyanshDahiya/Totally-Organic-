// Fortnightly: scores each meme by how much it's being used on Instagram now.
// Run: node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/scan-meme-trends.ts [memes] [reelsPerMeme]
import { apifyUsage, scanMemeTrends } from "../src/lib/meme-trends";
import { memeById } from "../src/lib/memes";

async function main() {
  const before = await apifyUsage();
  if (before) console.log(`Apify usage before: $${before.used.toFixed(2)} of $${before.limit}`);
  const rows = await scanMemeTrends({ memes: Number(process.argv[2]) || undefined, perMeme: Number(process.argv[3]) || undefined });
  for (const r of [...rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1))) {
    console.log(
      `${String(r.score ?? "n/a").padStart(4)}  #${r.hashtag.padEnd(24)} ${String(r.reels_30d).padStart(2)} reels/30d  median ${r.median_views.toLocaleString("en-IN").padStart(10)} views  (${memeById(r.meme_id)?.name ?? r.meme_id})`,
    );
  }
  const after = await apifyUsage();
  if (after && before) console.log(`Apify usage after: $${after.used.toFixed(2)} (+$${(after.used - before.used).toFixed(2)})`);
}
main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
