// Upserts the hand-picked hook seed set into trending_clips.
// Run: npm run seed:clips
import { createClient } from "@supabase/supabase-js";
import { SEED_CLIPS } from "../supabase/seed/trending-clips";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});

async function main() {
  const rows = SEED_CLIPS.map((c) => ({
    source_url: `seed:${c.id}`,
    media_type: c.format === "slideshow" ? "image" : "video",
    niche_tags: c.niche_tags,
    hook_text: c.hook_text,
    format: c.format,
    views: null,
  }));
  const { error, count } = await supabase
    .from("trending_clips")
    .upsert(rows, { onConflict: "source_url", count: "exact" });
  if (error) throw error;
  console.log(`Upserted ${count ?? rows.length} trending clips.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
