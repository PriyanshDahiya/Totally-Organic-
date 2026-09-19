// Renders one card's composition from the database to a local MP4 (no credits, no upload), for checking a format.
// Run: node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/rerender-card.ts <videoAssetId> <out.mp4>
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { renderVideo } from "../src/lib/render";
import { withStyleDefaults, type CardStyle } from "../src/remotion/style";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
async function main() {
  const { data } = await supabase.from("video_assets").select("generation_jobs(overlay_text, style)").eq("id", process.argv[2]).single();
  const job = data!.generation_jobs as unknown as { overlay_text: string; style: Partial<CardStyle> };
  const { slideImages: _s, ...style } = withStyleDefaults(job.style);
  const { video } = await renderVideo({
    composition: "Meme",
    props: { lines: job.overlay_text.split("\n").filter(Boolean), ...style, backdrop: style.backdrop ?? null, meme: style.meme ?? null },
  });
  await writeFile(process.argv[3], video);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
