// One-off: puts hand-written hooks onto the Totally Organic brand's cards,
// picks footage, renders each (1 credit) and downloads the MP4s.
// Run: node --env-file=.env.local --require ./scripts/server-only-stub.cjs --import tsx scripts/make-own-posts.ts <outDir>
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { generateCard } from "../src/lib/generate";
import { searchClips } from "../src/lib/stock";
import { findFaces, placeAroundFaces } from "../src/lib/faces";
import { saveCardEdit } from "../src/lib/edit";
import { startApproval } from "../src/lib/approve";
import { DEFAULT_STYLE, wallOfTextFontSize } from "../src/remotion/style";

const EMAIL = "totallyorganic@d2c-content-engine.local";
const CAPTION_MEME = "If this is you, we built a thing. Paste your store link → swipe → post. Waitlist in bio 🌱 #d2cbrands #founderlife #shopifyindia #reelsmarketing #startupindia";
const CAPTION_STORY = "Made by a machine in 4 seconds. Yes, including this one. Link in bio 🌱 #d2cindia #contentcreation #shopifyseller #instagramreels #smallbusinessindia";

const POSTS: { name: string; lines: string[]; footage: string; story?: boolean }[] = [
  { name: "01-pov-one-reel-a-day", footage: "tired woman laptop night", lines: ["POV: you told yourself you'd post one Reel a day", "it's day 4", "you've posted zero Reels and three stories of your packaging"] },
  { name: "02-capcut-tutorial", footage: "frustrated man laptop night", lines: ["me: we don't need an agency, I'll make the Reels myself", "also me, 11:40pm: watching a 25-minute CapCut tutorial for a 7-second transition"] },
  { name: "03-things-founders-say", footage: "man thinking office", lines: ["things D2C founders say:", "\"the product will speak for itself\"", "\"we'll start posting after the next batch\"", "\"organic is dead anyway\"", "(it's not. you just stopped posting)"] },
  { name: "04-agency-quote", footage: "shocked man phone", lines: ["agency: ₹45,000 for 12 Reels", "me: that's 6 months of my ad budget", "agency: they'll be very aesthetic", "me: my customers are on the metro, bhai"] },
  { name: "05-tell-me-d2c", footage: "woman photographing product", lines: ["tell me you run a D2C brand without telling me:", "your camera roll is 400 photos of the same bottle from slightly different angles"] },
  { name: "06-nobody-2am", footage: "man awake night bed phone", lines: ["nobody:", "absolutely nobody:", "founders at 2am: \"what if we just do a trending audio with our product on a table\""] },
  { name: "07-mummy-business", footage: "mother son talking home", lines: ["mummy: beta business kaisa chal raha hai", "me: product toh mast hai", "mummy: toh log kharid kyun nahi rahe", "me: kyunki Instagram pe koi dekh hi nahi raha"] },
  { name: "08-kal-se-roz-reel", footage: "man drinking coffee thinking", lines: ["\"kal se roz Reel daalenge\"", "said every founder, every Monday, since 2021"] },
  { name: "09-content-calendar", footage: "woman calendar desk stressed", lines: ["content calendar banaya tha", "30 din ka", "3 din chala", "ab calendar bhi nahi dikhta"] },
  { name: "10-agency-story", footage: "woman smiling phone cafe", story: true, lines: ["I spent ₹38k on an agency last quarter.", "12 Reels. 2 of them were good.", "Now I paste my store link, swipe through posts like dating profiles, and keep the ones that sound like my customers.", "₹75 a video. I'm not going back."] },
  { name: "11-red-flag-green-flag", footage: "woman tea phone relaxed", story: true, lines: ["red flag: you have a great product and your last Reel was 23 days ago", "green flag: swiping right on 3 ready-made posts during your chai break"] },
  { name: "12-content-that-exists", footage: "man talking camera confident", story: true, lines: ["unpopular opinion: you don't need better content, you need content that exists", "posting 5 okay Reels beats planning 1 perfect one", "that's the whole reason I built Totally Organic"] },
];

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});

async function main() {
  const outDir = process.argv[2];
  if (!outDir) throw new Error("Pass an output folder.");
  await mkdir(outDir, { recursive: true });

  const { data: user } = await supabase.from("users").select("id").eq("email", EMAIL).single();
  const { data: brand } = await supabase.from("brands").select("id").eq("user_id", user!.id).single();

  // Reuse this brand's pending Wall of Text cards, then make more if needed.
  const { data: pending } = await supabase
    .from("generation_jobs")
    .select("id, video_assets!inner(id, review_status)")
    .eq("brand_id", brand!.id)
    .eq("status", "done")
    .eq("format", "wall_of_text")
    .eq("video_assets.review_status", "pending");
  const cards = (pending ?? []).map((j) => ({ jobId: j.id as string, assetId: (j.video_assets as { id: string }[])[0].id }));

  const used = new Set<string>();
  const done = new Set<string>();
  for (const post of POSTS) {
    try {
      let card = cards.shift();
      if (!card) {
        await generateCard(brand!.id, { format: "wall_of_text" });
        const { data } = await supabase
          .from("generation_jobs")
          .select("id, video_assets!inner(id, review_status)")
          .eq("brand_id", brand!.id)
          .eq("format", "wall_of_text")
          .eq("video_assets.review_status", "pending");
        const j = data!.find((x) => !done.has(x.id as string))!;
        card = { jobId: j.id, assetId: (j.video_assets as { id: string }[])[0].id };
      }

      const clip = (await searchClips(post.footage, 12)).find((c) => c.credit && !used.has(c.credit.pexelsUrl));
      done.add(card.jobId);
      if (!clip) throw new Error(`no footage for "${post.footage}"`);
      used.add(clip.credit!.pexelsUrl);

      const faces = clip.frames?.length ? await findFaces(clip.frames).catch(() => []) : [];
      const style = { ...DEFAULT_STYLE, textPosition: "upper" as const };
      const textBox = placeAroundFaces(faces, post.lines, wallOfTextFontSize(post.lines, style));

      const saved = await saveCardEdit(card.jobId, user!.id, {
        lines: post.lines,
        textPosition: "upper",
        textBox,
        font: "classic",
        textScale: 1,
        product: null,
        background: clip,
      });
      if (!saved.ok) throw new Error(saved.error);
      await supabase
        .from("video_assets")
        .update({ caption_text: post.story ? CAPTION_STORY : CAPTION_MEME })
        .eq("id", card.assetId);

      const approval = await startApproval(card.assetId, user!.id);
      if (!approval.ok) throw new Error(approval.error);
      await approval.render();

      const { data: asset } = await supabase.from("video_assets").select("render_status, video_url").eq("id", card.assetId).single();
      if (asset?.render_status !== "rendered") throw new Error("render failed (credit refunded)");
      const mp4 = Buffer.from(await (await fetch(asset.video_url)).arrayBuffer());
      await writeFile(path.join(outDir, `${post.name}.mp4`), mp4);
      console.log(`✓ ${post.name} (${(mp4.length / 1e6).toFixed(1)} MB)`);
    } catch (err) {
      console.log(`✗ ${post.name}: ${err instanceof Error ? err.message : err}`);
    }
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
