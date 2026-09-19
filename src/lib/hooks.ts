import "server-only";
import { z } from "zod";
import { generateObject } from "./llm";
import { memeById } from "./memes";
import type { BrandProfile } from "./brand-profile";
import type { Culture } from "./voice";
import type { Moment } from "./moments";

export type Format = "wall_of_text" | "slideshow" | "green_screen";

export type RemixInput = {
  brand: {
    name: string;
    one_liner: string;
    category: string;
    tone_dos: string[];
    tone_donts: string[];
  };
  angle: BrandProfile["angles"][number];
  hook: { text: string; format: Format };
  // Decided by the caller from brands.mention_frequency, so the model doesn't
  // have to guess how often to name the brand.
  mentionBrand: boolean;
  product?: { name: string; price: string | null; description: string | null };
  // Per card: a "mixed" brand gets some of each.
  language: "english" | "hinglish";
  culture: Culture;
  // Posts the founder loves, as style references.
  voiceExamples: string[];
  // Real customer wording, from reviews.
  customerPhrases: string[];
  // A timely moment to tie into, if any.
  moment: Moment | null;
  // Meme format: the reaction memes to choose from.
  memeMenu?: string;
};

// Length limits are enforced here rather than in the JSON schema: Groq's
// strict mode is picky about array/string constraints, and a clear retry
// message works better than a schema rejection.
const LIMITS = {
  // A "line" is a paragraph here: story posts run to ~250 characters, like
  // the first-person posts that do well on Reels.
  wall_of_text: { minLines: 1, maxLines: 4, maxLineChars: 200, maxTotalChars: 260 },
  slideshow: { minLines: 3, maxLines: 6, maxLineChars: 90, maxTotalChars: 450 },
  // Meme: a short setup; the reaction meme is the punchline.
  green_screen: { minLines: 1, maxLines: 2, maxLineChars: 110, maxTotalChars: 150 },
} as const;

// The feeling the footage should show. Matched against stock clip titles,
// so these are words stock sites actually tag clips with.
export const EMOTIONS = [
  "frustrated",
  "tired",
  "shocked",
  "smug",
  "happy",
  "confused",
  "determined",
  "relaxed",
  "embarrassed",
] as const;
export type Emotion = (typeof EMOTIONS)[number];

const RemixSchema = z.object({
  lines: z
    .array(z.string())
    .describe(
      "Wall of Text: 1-4 lines or short paragraphs of overlay text, shown stacked on one screen. " +
        "Slideshow: 3-6 slides, one line each; the first slide is the hook, the rest pay it off.",
    ),
  caption: z.string().describe("Instagram caption: 1-2 casual sentences, then 3-5 relevant hashtags"),
  why: z
    .string()
    .describe("Two short sentences for the founder: why the moment hits emotionally, then how the post positions the product as the fix"),
  scene: z
    .string()
    .describe("Meme format only: a short stock-photo search for the backdrop: the PLACE or OBJECTS where the joke happens, with no people in it, e.g. 'messy desk laptop night', 'empty office meeting room', 'invoice papers on table'. Empty for other formats."),
  meme_id: z
    .number()
    .describe("Meme format only: the id of the reaction meme from the list that lands the punchline. 0 for other formats."),
  emotion: z
    .enum(EMOTIONS)
    .describe("The feeling a person in the background video should show so the joke lands, e.g. the pain point -> frustrated or tired, the payoff -> smug or happy"),
});

export type Remix = z.infer<typeof RemixSchema>;

const SYSTEM_PROMPT = `You write short-form social posts for small direct-to-consumer brands by remixing posts that are already trending.

You get one trending hook and one of the brand's angles (a pain point and what the product changes about it). Keep the hook's exact structure and rhythm (the "POV:", the "when your X is Y", the "me after...", the "me at 10pm vs 6am" contrast, the list) and swap in the brand's world, so it still reads like something a real person posted, not an ad.

The most important rule: write a specific moment, not a statement.
- A moment is something the viewer has lived: a time, a place, an action, a thing someone said. "when you open the agency invoice at 11pm and it's more than your ad budget" is a moment. "agencies are too expensive" is a statement.
- Statements, abstract nouns and marketing words kill posts. Never use: journey, game-changer, level up, unlock, elevate, hustle, grind, chase/chasing, seamless, effortless, transform, empower, revolutionary, "the struggle is real".
- Short beats long. Every word has to earn its place. If a line works without a word, cut the word.

Posts sell by showing the product as the relief, the way a friend would, never like an ad:
- You'll be told a style. Story: first-person, 2-4 sentences, the pain as a real moment, then the brand named near the end as what fixed it. Meme: one joke that lands on its own.
- When told to name the brand, make the brand part of the joke or the payoff ("when your whole marketing team is [brand] and one store link", "me after switching to [brand]"), not a pitch tacked on.
- Only claim what the brand's description and the angle's benefit say it does.

Rules:
- Write like a person typing a caption: normal sentence case, plain words, words written out in full (no "u", "bc", "w/", "2h").
- If you're given real customer phrases, echo their wording where it fits: that's what makes a post feel written by a customer. Never attribute a quote to a named person.
- If you're given posts the brand loves, match their rhythm, length and humour. Don't copy them.
- If you're given a timely moment, use it only when it fits naturally.
- Never stereotype or mock any religion, region, caste, community or gender. Never mock the kind of product the brand sells.
- Follow the brand's tone do's and don'ts exactly.
- Never invent facts: no prices, ingredients, stats, results or claims beyond what you're given. No medical or health claims.
- No hashtags or emojis in the overlay lines; hashtags go in the caption only.
- The caption may always mention the brand once.`;

function languageRule(language: RemixInput["language"], culture: Culture) {
  const lang =
    language === "hinglish"
      ? "Language: Hinglish. Hindi words written in English letters, mixed naturally with English the way urban Indians text (\"mummy ne bola tha\", \"yaar\", \"bas\", \"kya scene hai\"). Readable to someone who mostly reads English. Never Devanagari script."
      : "Language: English.";
  const place =
    culture === "india"
      ? "Audience: India. Draw on everyday Indian life when it fits: chai, mummy and papa, office, metro and autos, exams, weddings, festivals, salary day. Prices in rupees if any."
      : "Audience: global. Avoid country-specific references.";
  return `${lang}\n${place}`;
}

function voiceBlock({ voiceExamples, customerPhrases, moment }: RemixInput) {
  let out = "";
  if (customerPhrases.length)
    out += `\n\nHow real customers describe it (their exact words):\n${customerPhrases.map((p) => `- "${p}"`).join("\n")}`;
  if (voiceExamples.length)
    out += `\n\nPosts the brand loves (match the voice, don't copy):\n${voiceExamples.map((p) => `- """${p.slice(0, 400)}"""`).join("\n")}`;
  if (moment) out += `\n\nTimely moment this week: ${moment.label}, e.g. ${moment.angle}.`;
  return out;
}

// The prompt says no emojis in the overlay, but the model slips some in, and
// they render inconsistently over video, so strip them here.
const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

function cleanLines(lines: string[]) {
  return lines.map((s) => s.replace(EMOJI, "").replace(/\s+/g, " ").trim()).filter(Boolean);
}

function checkLimits(remix: Remix, format: Format): string | null {
  const l = LIMITS[format];
  const lines = cleanLines(remix.lines);
  if (lines.length < l.minLines || lines.length > l.maxLines)
    return `Use ${l.minLines}-${l.maxLines} lines; you used ${lines.length}.`;
  const long = lines.find((s) => s.length > l.maxLineChars);
  if (long) return `Every line must be at most ${l.maxLineChars} characters; "${long}" is ${long.length}.`;
  const total = lines.reduce((n, s) => n + s.length, 0);
  if (total > l.maxTotalChars) return `Keep all lines together under ${l.maxTotalChars} characters; you used ${total}.`;
  return null;
}

// Drafts per card: the judge picks the best, which beats taking the first
// thing the model writes. Three keeps a card at ~4-6 calls on Groq's
// free tier (30 requests a minute).
const DRAFTS = 3;

const JudgeSchema = z.object({
  scores: z.array(
    z.object({
      n: z.number(),
      lived_moment: z.number().describe("1-5: a specific moment the viewer has lived, not a general statement"),
      funny: z.number().describe("1-5: would the target customer laugh or feel seen"),
      product_link: z.number().describe("1-5: the post makes the brand or product feel like the relief, naturally"),
      clean: z.number().describe("1-5: short, natural, no marketing words, reads like a real person"),
    }),
  ),
  best: z.number().describe("Number of the best draft"),
});

function formatBrief(input: RemixInput) {
  const { hook } = input;
  if (hook.format === "wall_of_text") return "Wall of Text (text over a background video)";
  if (hook.format === "slideshow") return "Slideshow (text over product photos, one line per slide)";
  return `Meme (a short setup on screen, then a famous reaction meme plays underneath as the punchline).
Write only the setup: 1-2 short lines, under 150 characters, that make the meme's reaction land. Keep the hook's structure; the meme is the reaction to the moment you describe. Don't repeat or describe the meme's own line.
Pick meme_id from this list. A meme everyone recognises makes the post travel, so prefer high popularity when two memes fit; never force a popular meme that doesn't match the moment.
${input.memeMenu ?? ""}`;
}

function styleBrief({ hook, mentionBrand, product, brand }: RemixInput) {
  const name = product ? `${brand.name} (or "${product.name}")` : brand.name;
  if (hook.format === "green_screen") {
    return mentionBrand
      ? `Style: branded meme. Name ${name} in the setup as part of the joke or the payoff, e.g. "when your whole Reels team is ${brand.name} and one store link" or "me after switching to ${brand.name}". Pick a meme whose reaction matches (smug, winning, relieved for a payoff; shocked or crying for the pain).`
      : `Style: meme. Don't name the brand; make the moment one only ${brand.name}'s customers would recognise, so the product is implied.`;
  }
  return mentionBrand
    ? `Style: story. Name ${name} once, near the end, as the thing that fixed it for you. No call to action ("try it", "link in bio").`
    : "Style: meme. Do not name the brand or product in the overlay text.";
}

async function draft(input: RemixInput, prompt: string): Promise<Remix | null> {
  let feedback = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const remix = await generateObject({ name: "hook_remix", schema: RemixSchema, system: SYSTEM_PROMPT, prompt: prompt + feedback });
    const problem = checkLimits(remix, input.hook.format);
    if (!problem) return { ...remix, lines: cleanLines(remix.lines) };
    feedback = `

Your previous attempt broke a length rule: ${problem} Rewrite it shorter.`;
  }
  return null;
}

export async function remixHook(input: RemixInput): Promise<Remix> {
  const { brand, angle, hook, product } = input;
  const prompt = `Brand: ${brand.name} — ${brand.one_liner} (${brand.category})
Tone do's:
${brand.tone_dos.map((t) => `- ${t}`).join("\n")}
Tone don'ts:
${brand.tone_donts.map((t) => `- ${t}`).join("\n")}
${product ? `\nProduct shown in the post: ${product.name}${product.price ? ` (${product.price})` : ""}${product.description ? ` — ${product.description.slice(0, 300)}` : ""}\n` : ""}
Angle: ${angle.title}
Pain point: ${angle.pain_point}
${"benefit" in angle && angle.benefit ? `What the product changes: ${angle.benefit}\n` : ""}
Trending post to remix (keep its structure):
"""${hook.text}"""

Format: ${formatBrief(input)}
${languageRule(input.language, input.culture)}${voiceBlock(input)}
${styleBrief(input)}`;

  const drafts = (await Promise.all(Array.from({ length: DRAFTS }, () => draft(input, prompt).catch(() => null)))).filter(
    (d): d is Remix => d !== null,
  );
  if (drafts.length === 0) throw new Error("The AI couldn't write this post. Try regenerating.");
  if (drafts.length === 1) return drafts[0];

  // The judge sees only the on-screen text (and the meme picked), like a viewer would.
  const judged = await generateObject({
    name: "hook_judge",
    schema: JudgeSchema,
    system:
      "You're a sharp social media editor for small D2C brands. You score draft Reels for the brand's target customer and pick the one most likely to be watched, shared and remembered with the brand. Be strict: generic statements and marketing language score low. For meme drafts, a meme that fits the moment and that everyone recognises (high popularity) is worth more.",
    prompt: `Brand: ${brand.name} — ${brand.one_liner}
Angle: ${angle.pain_point}

${drafts
  .map((d, i) => `Draft ${i + 1}:\n${d.lines.join("\n")}${hook.format === "green_screen" ? `\n[meme: ${memeLabel(d.meme_id)}]` : ""}`)
  .join("\n\n")}`,
  }).catch(() => null);
  const best = judged ? drafts[judged.best - 1] : null;
  return best ?? drafts[0];
}

function memeLabel(id: number) {
  const m = memeById(id);
  return m ? `${m.name}, popularity ${m.popularity}/10` : "none";
}
