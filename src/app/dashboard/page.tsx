import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/current-user";
import type { BrandProfile } from "@/lib/brand-profile";
import { Button, ButtonLink, FinePrint, Panel, Stamp, Sticker } from "@/components/ui";

type StoredProfile = Omit<BrandProfile, "angles" | "tone_dos" | "tone_donts">;

// The brand profile, laid out as a nutrition-facts label.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const supabase = createAdminClient();
  const me = await getCurrentUser();

  const [{ data: user }, { data: brand }, { checkout }] = await Promise.all([
    supabase.from("users").select("email, plan, credits_remaining").eq("id", me.id).single(),
    supabase
      .from("brands")
      .select("id, website_url, profile, angles, tone_dos, tone_donts, mention_frequency")
      .eq("user_id", me.id)
      .maybeSingle(),
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
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      {checkout === "success" && (
        <p className="mb-8 rounded-lg border-2 border-leaf bg-leaf-wash px-4 py-3 font-medium">
          Payment received. Credits appear here once the payment provider confirms it, usually within a minute.
        </p>
      )}

      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div>
          <FinePrint>Your brand label</FinePrint>
          <h1 className="font-display text-5xl font-extrabold leading-none tracking-[-0.02em]">
            {profile.identity.name}
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-ink-soft">{profile.identity.one_liner}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/cards">Go to harvest →</ButtonLink>
          <ButtonLink href="/profile" variant="secondary">
            Edit label
          </ButtonLink>
        </div>
      </div>

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <FactsLabel
          profile={profile}
          angles={angles}
          toneDos={toneDos}
          toneDonts={toneDonts}
          mention={brand.mention_frequency}
          website={brand.website_url}
        />

        <aside className="space-y-8">
          <Coupon credits={user?.credits_remaining ?? 0} plan={user?.plan ?? "free"} />

          <section>
            <FinePrint className="mb-3">
              On the shelf · {products?.length ?? 0} {products?.length === 1 ? "product" : "products"}
            </FinePrint>
            {products?.length ? (
              <ul className="grid grid-cols-2 gap-4">
                {products.map((p, i) => (
                  <li key={p.id} className="text-sm">
                    <div className="relative">
                      {p.image_urls[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image_urls[0]} alt="" className="aspect-square w-full rounded-xl border-2 border-ink object-cover" />
                      ) : (
                        <div className="aspect-square w-full rounded-xl border-2 border-dashed border-ink/40" />
                      )}
                      {p.price && (
                        <Sticker tone="yolk" rotate={i % 2 ? 6 : -6} className="absolute -right-2 -top-2">
                          {p.price}
                        </Sticker>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 font-semibold leading-snug">{p.name}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-soft">No products found on your site.</p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}

function FactsLabel({
  profile,
  angles,
  toneDos,
  toneDonts,
  mention,
  website,
}: {
  profile: StoredProfile;
  angles: BrandProfile["angles"];
  toneDos: string[];
  toneDonts: string[];
  mention: string;
  website: string;
}) {
  const thick = "border-t-[10px] border-ink";
  const thin = "border-t border-ink";
  return (
    <div className="relative">
      <Stamp top="100% AI" center="GROWN" bottom="NOT ORGANIC" tone="tomato" size={104} rotate={16}
        className="absolute -right-4 -top-8 z-10 hidden sm:block" />
      <article className="border-[3px] border-ink bg-card p-5 shadow-[6px_6px_0_var(--color-ink)] sm:p-7">
        <h2 className="font-display text-[clamp(2.4rem,6vw,3.6rem)] font-extrabold leading-none tracking-[-0.03em]">
          Brand Facts
        </h2>
        <p className={`mt-2 ${thin} pt-2 text-lg`}>
          Serving size <span className="font-bold">1 brand</span> ({profile.identity.category})
        </p>
        <p className="text-lg">
          Mentions per post <span className="font-bold capitalize">{mention}</span>
        </p>

        <div className={`mt-2 ${thick} pt-1`}>
          <div className="flex items-baseline justify-between">
            <span className="font-display text-xl font-extrabold">Content angles</span>
            <span className="font-display text-xl font-extrabold">{angles.length}</span>
          </div>
        </div>
        <ul>
          {angles.map((a) => (
            <li key={a.title} className={`${thin} py-3`}>
              <p className="font-bold">{a.title}</p>
              <p className="text-ink-soft">{a.pain_point}</p>
              <p className="mt-1 italic">&ldquo;{a.example_hook}&rdquo;</p>
            </li>
          ))}
        </ul>

        <div className={`${thick} flex items-baseline justify-between pt-1`}>
          <span className="font-display text-xl font-extrabold">Customers</span>
          <span className="font-mono text-xs font-bold uppercase">% of base*</span>
        </div>
        <ul>
          {profile.segments.map((s) => (
            <li key={s.name} className={`${thin} flex items-start justify-between gap-4 py-2`}>
              <div>
                <p className="font-bold">{s.name}</p>
                <p className="text-sm text-ink-soft">{s.description}</p>
              </div>
              <span className="font-display text-xl font-extrabold">{s.share_percent}%</span>
            </li>
          ))}
        </ul>

        {profile.product?.key_benefits?.length ? (
          <div className={`${thick} pt-2`}>
            <p className="font-display text-xl font-extrabold">Key benefits</p>
            <p className="mt-1 text-ink-soft">{profile.product.key_benefits.join(" · ")}</p>
          </div>
        ) : null}

        <div className={`mt-3 ${thick} grid gap-5 pt-3 sm:grid-cols-2`}>
          <div>
            <p className="font-bold uppercase">Contains</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {toneDos.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-bold uppercase">Free from</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
              {toneDonts.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </div>

        {profile.competitors?.length ? (
          <div className={`mt-3 ${thin} pt-2 text-sm`}>
            <span className="font-bold">Also on the shelf: </span>
            {profile.competitors.map((c) => c.name).join(", ")}
          </div>
        ) : null}

        <p className={`mt-3 ${thick} pt-2 text-xs leading-relaxed text-ink-soft`}>
          *Estimated by an AI from {website}. Not a survey of your actual customers. If it&apos;s wrong, edit the
          label: every post is written from it.
        </p>
      </article>
    </div>
  );
}

function Coupon({ credits, plan }: { credits: number; plan: string }) {
  return (
    <Panel className="overflow-hidden">
      <div className="bg-yolk px-5 pb-4 pt-5">
        <FinePrint className="text-ink-soft">Render coupons</FinePrint>
        <p className="font-display text-6xl font-extrabold leading-none tracking-tight">{credits}</p>
        <p className="mt-1 text-sm font-medium">
          credits left · <span className="capitalize">{plan}</span> plan
        </p>
      </div>
      <div className="perforated bg-yolk" aria-hidden />
      <div className="space-y-3 px-5 py-4 text-sm">
        <p className="text-ink-soft">Browsing, editing and skipping posts is free. Each video you approve uses 1.</p>
        <form action="/api/checkout" method="post">
          <Button variant="secondary" className="w-full">
            Get more credits
          </Button>
        </form>
      </div>
    </Panel>
  );
}
