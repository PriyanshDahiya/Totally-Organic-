// Generates N cards of one format (default Meme) for a brand, renders them and saves the MP4s.
// Run: node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/make-meme-post.ts <website substring> <count> <outDir> [format]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { generateCard } from "../src/lib/generate";
import type { Format } from "../src/lib/hooks";
import { startApproval } from "../src/lib/approve";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

async function main() {
  const [match, count, outDir] = [process.argv[2], Number(process.argv[3] ?? 1), process.argv[4]];
  const format = (process.argv[5] ?? "green_screen") as Format;
  await mkdir(outDir, { recursive: true });
  const { data: brand } = await supabase.from("brands").select("id, user_id").ilike("website_url", `%${match}%`).limit(1).single();
  for (let i = 0; i < count; i++) {
    try {
      const card = await generateCard(brand!.id, { format });
      console.log(`text: ${card.remix.lines.join(" / ")}\nmeme: ${card.style.meme?.name}\nbackdrop: ${card.style.backdrop?.credit?.pexelsUrl ?? "none"}`);
      const approval = await startApproval(card.videoAssetId, brand!.user_id);
      if (!approval.ok) throw new Error(approval.error);
      await approval.render();
      const { data: asset } = await supabase.from("video_assets").select("render_status, video_url").eq("id", card.videoAssetId).single();
      if (asset?.render_status !== "rendered") throw new Error("render failed");
      const file = path.join(outDir, `${format === "green_screen" ? "meme" : format}-${i + 1}.mp4`);
      await writeFile(file, Buffer.from(await (await fetch(asset.video_url)).arrayBuffer()));
      console.log(`saved ${file}\n`);
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : err}\n`);
    }
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
