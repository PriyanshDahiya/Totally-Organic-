import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { BrandProfile } from "@/lib/brand-profile";

type StoredProfile = Omit<BrandProfile, "angles" | "tone_dos" | "tone_donts">;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [{ data: user }, { data: brand }, { checkout }] = await Promise.all([
    supabase.from("users").select("email, plan, credits_remaining").single(),
    supabase.from("brands").select("id, website_url, profile, angles, tone_dos, tone_donts").maybeSingle(),
    searchParams,
  ]);
  if (!brand) redirect("/onboarding");

  const { data: products } = await supabase
    .from("products")
    .select("id, name, price, image_urls")
    .eq("brand_id", brand.id);
  const profile = brand.profile as StoredProfile;
  const angles = brand.angles as BrandProfile["angles"];
  const toneDos = brand.tone_dos as string[];
  const toneDonts = brand.tone_donts as string[];

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-4 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{profile.identity.name}</h1>
          <p className="text-gray-600">{profile.identity.one_liner}</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="rounded border px-3 py-1">
            {user?.credits_remaining ?? 0} credits · {user?.plan}
          </span>
          <form action="/api/checkout" method="post">
            <button className="rounded bg-black px-3 py-1 font-medium text-white">Upgrade</button>
          </form>
          <form action="/auth/signout" method="post">
            <button className="text-gray-600 underline">Sign out</button>
          </form>
        </div>
      </header>

      {checkout === "success" && (
        <p className="rounded bg-green-50 p-3 text-sm text-green-700">
          Payment received. Credits appear here once the payment provider confirms it, usually within a minute.
        </p>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Content angles</h2>
        <ul className="space-y-3">
          {angles.map((a) => (
            <li key={a.title} className="rounded border p-4">
              <p className="font-medium">{a.title}</p>
              <p className="text-sm text-gray-600">{a.pain_point}</p>
              <p className="mt-2 text-sm italic">&ldquo;{a.example_hook}&rdquo;</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Customers</h2>
        <ul className="space-y-1 text-sm">
          {profile.segments.map((s) => (
            <li key={s.name}>
              <span className="font-medium">
                {s.share_percent}% {s.name}
              </span>{" "}
              — {s.description}
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 text-lg font-semibold">Tone: do</h2>
          <ul className="list-disc pl-5 text-sm">
            {toneDos.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-2 text-lg font-semibold">Tone: don&apos;t</h2>
          <ul className="list-disc pl-5 text-sm">
            {toneDonts.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Products ({products?.length ?? 0})</h2>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {products?.map((p) => (
            <li key={p.id} className="text-sm">
              {p.image_urls[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image_urls[0]} alt="" className="mb-2 aspect-square w-full rounded object-cover" />
              )}
              <p className="font-medium">{p.name}</p>
              {p.price && <p className="text-gray-600">{p.price}</p>}
            </li>
          ))}
        </ul>
      </section>

      <footer className="text-sm text-gray-600">
        Profile from {brand.website_url} ·{" "}
        <Link href="/onboarding" className="underline">
          Refresh from website
        </Link>
      </footer>
    </main>
  );
}
