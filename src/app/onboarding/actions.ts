"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { scrapeSite } from "@/lib/scrape";
import { generateBrandProfile } from "@/lib/brand-profile";

export type OnboardingState = { error: string | null };

export async function buildBrandProfile(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const website = String(formData.get("website") ?? "").trim();
  if (!website) return { error: "Paste your website or a product URL." };

  try {
    const site = await scrapeSite(website);
    const profile = await generateBrandProfile(site);
    const { angles, tone_dos, tone_donts, ...rest } = profile;

    const { data: brand, error } = await supabase
      .from("brands")
      .upsert(
        {
          user_id: auth.user.id,
          website_url: site.url,
          profile: rest,
          angles,
          tone_dos,
          tone_donts,
          refreshed_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("id")
      .single();
    if (error) throw error;

    // "Refresh from website" replaces the scraped catalog.
    const { error: deleteError } = await supabase.from("products").delete().eq("brand_id", brand.id);
    if (deleteError) throw deleteError;
    const { error: productError } = await supabase.from("products").insert(
      site.products.map((p) => ({
        brand_id: brand.id,
        name: p.name,
        url: p.url,
        description: p.description,
        image_urls: p.imageUrls,
        price: p.price,
      })),
    );
    if (productError) throw productError;
  } catch (err) {
    console.error("brand profile failed", err);
    return { error: err instanceof Error ? err.message : "Something went wrong. Try again." };
  }

  redirect("/dashboard");
}
