import { createAdminClient } from "@/lib/supabase/admin";
import { getSignedInUser } from "@/lib/current-user";
import { ButtonLink, FinePrint, Panel, Stamp, Sticker } from "@/components/ui";

const STEPS = [
  {
    n: "01",
    title: "Plant your website",
    body: "Paste your store. We read it and work out your customers, pain points and tone, all on one label you can edit.",
    tag: "About 20 seconds",
  },
  {
    n: "02",
    title: "Pick the harvest",
    body: "Posts that remix hooks already trending on Reels onto your angles, over real-looking footage. Skip what's bad, for free.",
    tag: "Free to browse",
  },
  {
    n: "03",
    title: "Ship the good ones",
    body: "Approve a post and we render the final vertical video, ready for Instagram. One credit, only for the ones you keep.",
    tag: "1 credit per video",
  },
];

export default async function Home() {
  const me = await getSignedInUser();
  const { data: brand } = me
    ? await createAdminClient().from("brands").select("id").eq("user_id", me.id).maybeSingle()
    : { data: null };

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6">
      <section className="grid items-center gap-12 py-14 md:grid-cols-[1.15fr_0.85fr] md:py-20">
        <div>
          <Sticker tone="leaf" rotate={-2}>
            Short-form for D2C brands
          </Sticker>
          <h1 className="mt-6 font-display text-[clamp(3rem,8vw,6.2rem)] font-extrabold leading-[0.92] tracking-[-0.03em]">
            Organic content<span className="text-tomato">*</span>
            <br />
            <span className="text-leaf">grown daily.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-ink-soft">
            Reels that look like a real person posted them, written around your customers&apos; actual problems.
            You swipe, you keep the good ones, you post.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <ButtonLink href={!me ? "/login" : brand ? "/cards" : "/onboarding"} className="px-6 py-3 text-lg">
              {brand ? "Go to today's harvest" : "Plant your brand"} →
            </ButtonLink>
            {brand && (
              <ButtonLink href="/dashboard" variant="ghost">
                See your brand label
              </ButtonLink>
            )}
          </div>
          <FinePrint className="mt-8">
            <span className="text-tomato">*</span> Not organic. Made by a machine in about 4 seconds. Looks organic,
            which is the point.
          </FinePrint>
        </div>

        <PhoneMock />
      </section>

      <hr className="border-t-2 border-dashed border-ink/30" />

      <section className="grid gap-6 py-14 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <Panel key={s.n} className="relative p-6">
            <span className="font-mono text-sm font-bold text-ink-faint">{s.n}</span>
            <h3 className="mt-2 font-display text-2xl font-extrabold tracking-tight">{s.title}</h3>
            <p className="mt-2 text-ink-soft">{s.body}</p>
            <Sticker tone={i === 2 ? "tomato" : "yolk"} rotate={i % 2 ? 3 : -3} className="mt-5">
              {s.tag}
            </Sticker>
          </Panel>
        ))}
      </section>

      <section className="mb-16 flex flex-col items-center gap-6 rounded-2xl border-2 border-dashed border-ink/40 px-6 py-10 text-center md:flex-row md:text-left">
        <Stamp top="CERTIFIED" center="100%" bottom="AI-GROWN" tone="tomato" size={110} />
        <div className="flex-1">
          <h2 className="font-display text-3xl font-extrabold tracking-tight">No avatars. No fake influencers.</h2>
          <p className="mt-2 max-w-2xl text-ink-soft">
            Just text over footage, the format that already works on Reels. Every post shows which trending hook it
            remixed and why it should land, so you can judge it before spending anything.
          </p>
        </div>
      </section>
    </main>
  );
}

// A static phone with a sample post in the same TikTok-style text the real
// renders use. Illustrative only: the footage is a gradient, not a clip.
function PhoneMock() {
  return (
    <div className="relative mx-auto w-full max-w-[300px]">
      <div className="absolute -right-6 -top-6 z-10">
        <Stamp top="FRESH" center="REEL" bottom="PICKED DAILY" size={92} rotate={14} />
      </div>
      <div className="relative aspect-[9/16] overflow-hidden rounded-[2.2rem] border-[3px] border-ink bg-ink shadow-[8px_8px_0_var(--color-leaf)]">
        <div className="absolute inset-0 bg-[radial-gradient(120%_70%_at_30%_20%,#c9a27a_0%,#7a5a3f_38%,#2c2520_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-[linear-gradient(transparent,rgb(0_0_0/0.45))]" />
        <div className="absolute inset-x-6 top-[30%] text-center text-[15px] font-semibold leading-snug text-white [paint-order:stroke_fill] [-webkit-text-stroke:3px_rgb(0_0_0/0.85)] [text-shadow:0_2px_8px_rgb(0_0_0/0.45)]">
          me at 10pm: tomorrow I&apos;m meal prepping for the whole week
          <br />
          me at 6am: cereal. again.
        </div>
        <div className="absolute bottom-5 left-4 right-14 space-y-1.5">
          <div className="h-2 w-24 rounded-full bg-white/80" />
          <div className="h-2 w-40 rounded-full bg-white/50" />
        </div>
        <div className="absolute bottom-6 right-3 flex flex-col items-center gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="size-6 rounded-full bg-white/70" />
          ))}
        </div>
      </div>
    </div>
  );
}
