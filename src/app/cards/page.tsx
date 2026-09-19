import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/current-user";
import type { BrandProfile } from "@/lib/brand-profile";
import { FinePrint } from "@/components/ui";
import { CardList } from "./card-list";
import { loadCards } from "./data";

export default async function CardsPage() {
  const me = await getCurrentUser();
  const supabase = createAdminClient();
  const [{ data: brand }, { data: user }] = await Promise.all([
    supabase.from("brands").select("id, profile").eq("user_id", me.id).maybeSingle(),
    supabase.from("users").select("credits_remaining").eq("id", me.id).single(),
  ]);
  if (!brand) redirect("/onboarding");
  const { identity } = brand.profile as Pick<BrandProfile, "identity">;

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-12 sm:px-6">
      <header>
        <FinePrint>Fresh for {identity.name}</FinePrint>
        <h1 className="font-display text-[clamp(2.8rem,7vw,4.5rem)] font-extrabold leading-[0.95] tracking-[-0.03em]">
          Today&apos;s harvest
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-ink-soft">
          Each post remixes a hook that&apos;s already trending onto one of your angles. Keep the good ones, skip the
          rest.
        </p>
      </header>
      <CardList initialCards={await loadCards(brand.id)} initialCredits={user?.credits_remaining ?? 0} />
    </main>
  );
}
