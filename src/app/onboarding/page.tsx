import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/current-user";
import { FinePrint, Panel, Sticker } from "@/components/ui";
import { OnboardingForm } from "./form";

export default async function OnboardingPage() {
  const me = await getCurrentUser();
  const { data: brand } = await createAdminClient()
    .from("brands")
    .select("website_url")
    .eq("user_id", me.id)
    .maybeSingle();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-14 sm:px-6">
      <div>
        <Sticker tone="leaf" rotate={-2}>
          {brand ? "Replant" : "Step 1 of 1"}
        </Sticker>
        <h1 className="mt-5 font-display text-5xl font-extrabold leading-[0.95] tracking-[-0.02em]">
          {brand ? "Replant your brand" : "Plant your brand"}
        </h1>
        <p className="mt-4 text-lg text-ink-soft">
          Paste your store or a product page. We read it and write up your customers, their problems and how you
          talk, on a label you can edit afterwards.
        </p>
      </div>

      <Panel className="p-6 sm:p-8">
        <OnboardingForm defaultUrl={brand?.website_url} />
      </Panel>

      <FinePrint>
        Works best with Shopify stores (we read your catalog too). For apps or sites that load with JavaScript, add a
        few sentences about what you sell.
      </FinePrint>
    </main>
  );
}
