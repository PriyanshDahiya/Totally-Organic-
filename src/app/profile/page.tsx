import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/current-user";
import type { BrandProfile } from "@/lib/brand-profile";
import { ButtonLink, FinePrint } from "@/components/ui";
import { voiceOf, type BrandVoice } from "@/lib/voice";
import { ProfileForm } from "./form";

export default async function EditProfilePage() {
  const me = await getCurrentUser();
  const { data: brand } = await createAdminClient()
    .from("brands")
    .select("profile, angles, tone_dos, tone_donts, mention_frequency")
    .eq("user_id", me.id)
    .maybeSingle();
  if (!brand) redirect("/onboarding");

  const profile = brand.profile as Pick<BrandProfile, "identity" | "segments" | "niche_tags"> & {
    voice?: Partial<BrandVoice>;
  };

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-12 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <FinePrint>Every post is written from this</FinePrint>
          <h1 className="font-display text-5xl font-extrabold leading-none tracking-[-0.02em]">Edit label</h1>
        </div>
        <ButtonLink href="/dashboard" variant="ghost">
          Cancel
        </ButtonLink>
      </header>
      <ProfileForm
        initial={{
          identity: profile.identity,
          angles: brand.angles as BrandProfile["angles"],
          segments: profile.segments,
          tone_dos: brand.tone_dos as string[],
          tone_donts: brand.tone_donts as string[],
          niche_tags: profile.niche_tags ?? [],
          mention_frequency: brand.mention_frequency as "rarely" | "sometimes" | "often",
          voice: voiceOf(profile),
        }}
      />
    </main>
  );
}
