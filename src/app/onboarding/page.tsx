import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: brand } = await supabase.from("brands").select("website_url").maybeSingle();

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold">{brand ? "Refresh your brand profile" : "Tell us about your brand"}</h1>
        <p className="mt-2 text-gray-600">
          Paste your store or a product page. We read it and work out your customers, angles and tone.
        </p>
      </div>
      <OnboardingForm defaultUrl={brand?.website_url} />
    </main>
  );
}
