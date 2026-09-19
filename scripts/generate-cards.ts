// Generates N cards for a brand and prints them, with a Pexels background for
// Wall of Text. For checking remix quality before the feed UI exists.
// Run: npm run cards -- [count] [brand website substring]
import { createClient } from "@supabase/supabase-js";
import { generateCard } from "../src/lib/generate";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});

async function main() {
  const count = Number(process.argv[2] ?? 3);
  const match = process.argv[3] ?? "";
  const { data: brands, error } = await supabase.from("brands").select("id, website_url").ilike("website_url", `%${match}%`);
  if (error) throw error;
  if (!brands?.length) throw new Error(`No brand whose website matches "${match}".`);
  const brand = brands[0];
  console.log(`Brand: ${brand.website_url}\n`);

  for (let i = 0; i < count; i++) {
    const started = Date.now();
    try {
      const card = await generateCard(brand.id);
      const bg = card.background;
      console.log(`#${i + 1} ${card.format}${card.mentionBrand ? " · mention" : ""} · ${((Date.now() - started) / 1000).toFixed(1)}s`);
      console.log(`  hook:  ${card.hook.replace(/\n/g, " / ")}`);
      console.log(`  angle: ${card.angle}`);
      console.log(`  text:  ${card.remix.lines.join("\n         ")}`);
      console.log(`  why:   ${card.remix.why}`);
      console.log(`  caption: ${card.remix.caption.replace(/\n/g, " ")}`);
      console.log(`  bg:    ${card.format === "slideshow" ? "(slideshow uses product photos)" : bg ? `"${bg.query}"${bg.emotion ? ` +${bg.emotion}` : ""} -> ${bg.credit?.pexelsUrl ?? bg.videoUrl}` : "none found"}\n`);
    } catch (err) {
      console.log(`#${i + 1} FAILED: ${err instanceof Error ? err.message : err}\n`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
