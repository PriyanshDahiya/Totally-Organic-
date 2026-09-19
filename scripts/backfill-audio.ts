// Adds a trending-audio suggestion to a brand's cards that don't have one.
// Run: node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/backfill-audio.ts <brand website substring>
import { createClient } from "@supabase/supabase-js";
import { suggestAudio } from "../src/lib/audio";
import type { Emotion } from "../src/lib/hooks";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

async function main() {
  const { data: brand } = await supabase.from("brands").select("id, profile").ilike("website_url", `%${process.argv[2] ?? ""}%`).limit(1).single();
  const tags = (brand!.profile as { niche_tags?: string[] }).niche_tags ?? [];
  const { data: jobs } = await supabase
    .from("generation_jobs")
    .select("id, overlay_text, background, video_assets(video_url)")
    .eq("brand_id", brand!.id)
    .eq("status", "done")
    .is("suggested_audio", null);
  for (const j of jobs ?? []) {
    const emotion = ((j.background as { emotion?: string } | null)?.emotion ?? null) as Emotion | null;
    const audio = await suggestAudio(tags, emotion);
    if (!audio) continue;
    await supabase.from("generation_jobs").update({ suggested_audio: audio }).eq("id", j.id);
    const url = (j.video_assets as { video_url: string | null }[])[0]?.video_url;
    if (url) console.log(`${(j.overlay_text ?? "").split("\n")[0].slice(0, 50)}\n   🎵 ${audio.title}${audio.artist ? ` · ${audio.artist}` : ""}  ${audio.url}`);
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
