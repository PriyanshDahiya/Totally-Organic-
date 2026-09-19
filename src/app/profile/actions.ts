"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/current-user";
import { extractCustomerPhrases, reviewsFromProductPages } from "@/lib/customer-voice";
import { MAX_CUSTOMER_PHRASES, MAX_EXAMPLES } from "@/lib/voice";

export type ProfileEditState = { error: string | null };

const text = (max: number) => z.string().trim().min(1, "Fill in every field, or remove the empty row.").max(max);
const lines = z.array(z.string().trim().max(200)).transform((l) => l.filter(Boolean));

// The editable subset of a brand profile. Everything else in brands.profile
// (product summary, competitors) is kept as generated.
const ProfileEditSchema = z.object({
  identity: z.object({ name: text(80), one_liner: text(200), category: text(60) }),
  angles: z
    .array(z.object({ title: text(100), pain_point: text(300), benefit: text(300).optional().default(""), example_hook: text(200) }))
    .length(3, "Keep exactly 3 angles."),
  segments: z
    .array(z.object({ name: text(80), share_percent: z.number({ error: "Give every customer segment a share." }).int().min(0).max(100), description: text(300) }))
    .min(1, "Add at least one customer segment.")
    .max(4, "Use at most 4 customer segments."),
  tone_dos: lines,
  tone_donts: lines,
  niche_tags: z
    .array(z.string().trim().toLowerCase().max(40))
    .transform((t) => [...new Set(t.filter(Boolean))])
    .pipe(z.array(z.string()).min(1, "Add at least one niche tag.").max(8, "Use at most 8 niche tags.")),
  mention_frequency: z.enum(["rarely", "sometimes", "often"]),
  voice: z.object({
    language: z.enum(["english", "hinglish", "mixed"]),
    culture: z.enum(["india", "global"]),
    examples: z
      .array(z.string().trim().max(600, "Keep each example post under 600 characters."))
      .transform((l) => l.filter(Boolean))
      .pipe(z.array(z.string()).max(MAX_EXAMPLES, `Use at most ${MAX_EXAMPLES} example posts.`)),
    customerPhrases: z
      .array(z.string().trim().max(300))
      .transform((l) => [...new Set(l.filter(Boolean))].slice(0, MAX_CUSTOMER_PHRASES)),
  }),
});

export type ProfileEdit = z.input<typeof ProfileEditSchema>;

export async function saveProfile(_prev: ProfileEditState, formData: FormData): Promise<ProfileEditState> {
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("data")));
  } catch {
    return { error: "Couldn't read the form. Reload and try again." };
  }
  const parsed = ProfileEditSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  const edit = parsed.data;

  const total = edit.segments.reduce((sum, s) => sum + s.share_percent, 0);
  if (total !== 100) return { error: `Customer shares add up to ${total}%. Make them add up to 100%.` };

  const supabase = createAdminClient();
  const me = await getCurrentUser();
  const { data: brand, error } = await supabase.from("brands").select("id, profile").eq("user_id", me.id).maybeSingle();
  if (error) return { error: error.message };
  if (!brand) redirect("/onboarding");

  const { error: updateError } = await supabase
    .from("brands")
    .update({
      profile: {
        ...(brand.profile as Record<string, unknown>),
        identity: edit.identity,
        segments: edit.segments,
        niche_tags: edit.niche_tags,
        voice: edit.voice,
      },
      angles: edit.angles,
      tone_dos: edit.tone_dos,
      tone_donts: edit.tone_donts,
      mention_frequency: edit.mention_frequency,
    })
    .eq("id", brand.id);
  if (updateError) return { error: updateError.message };

  redirect("/dashboard");
}

// Turns pasted reviews (and any reviews found on the store's product pages)
// into short, verbatim customer phrases. Nothing is saved until the founder
// saves the label.
export async function findCustomerPhrases(
  pasted: string,
): Promise<{ ok: true; phrases: string[]; fromStore: number } | { ok: false; error: string }> {
  const me = await getCurrentUser();
  const supabase = createAdminClient();
  const { data: brand } = await supabase.from("brands").select("id").eq("user_id", me.id).maybeSingle();
  if (!brand) return { ok: false, error: "Set up your brand first." };

  const { data: products } = await supabase.from("products").select("url").eq("brand_id", brand.id);
  const fromStore = await reviewsFromProductPages((products ?? []).flatMap((p) => (p.url ? [p.url] : [])));
  // One review per paragraph or line.
  const fromPaste = pasted.slice(0, 20000).split(/\n\s*\n|\n/).map((t) => t.trim()).filter((t) => t.length >= 10);
  if (fromPaste.length + fromStore.length === 0) {
    return { ok: false, error: "Paste a few reviews, comments or DMs first. We couldn't find reviews on your product pages." };
  }
  try {
    const phrases = await extractCustomerPhrases([...fromPaste, ...fromStore]);
    return { ok: true, phrases, fromStore: fromStore.length };
  } catch (err) {
    console.error("customer phrases failed", err);
    return { ok: false, error: "Couldn't read those reviews right now. Try again." };
  }
}
