// Adds a benefit (what the product changes) to each angle of brands made
// before angles had one.
// Run: node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/backfill-benefits.ts
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { generateObject } from "../src/lib/llm";

type Angle = { title: string; pain_point: string; benefit?: string; example_hook: string };
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

async function main() {
  const { data: brands } = await supabase.from("brands").select("id, profile, angles");
  for (const b of brands ?? []) {
    const angles = b.angles as Angle[];
    if (angles.every((a) => a.benefit)) continue;
    const identity = (b.profile as { identity?: { name: string; one_liner: string } }).identity;
    const { benefits } = await generateObject({
      name: "angle_benefits",
      schema: z.object({ benefits: z.array(z.string()) }),
      system: "For each content angle of a D2C brand, write one concrete sentence on what the product changes for the customer there. Only claim what the brand description supports.",
      prompt: `Brand: ${identity?.name} — ${identity?.one_liner}\n${angles.map((a, i) => `${i + 1}. ${a.title}: ${a.pain_point}`).join("\n")}`,
    });
    const next = angles.map((a, i) => ({ ...a, benefit: a.benefit || benefits[i] || "" }));
    await supabase.from("brands").update({ angles: next }).eq("id", b.id);
    console.log(identity?.name, next.map((a) => `${a.title} -> ${a.benefit}`));
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
