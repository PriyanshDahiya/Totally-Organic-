import "server-only";
import { z } from "zod";
import { generateObject } from "./llm";
import type { BrandProfile } from "./brand-profile";
import type { Culture } from "./voice";
import type { Moment } from "./moments";

export type Format = "wall_of_text" | "slideshow";

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
};

// Length limits are enforced here rather than in the JSON schema: Groq's
// strict mode is picky about array/string constraints, and a clear retry
// message works better than a schema rejection.
const LIMITS = {
  // A "line" is a paragraph here: story posts run to ~250 characters, like
  // the first-person posts that do well on Reels.
  wall_of_text: { minLines: 1, maxLines: 4, maxLineChars: 200, maxTotalChars: 260 },
  slideshow: { minLines: 3, maxLines: 6, maxLineChars: 90, maxTotalChars: 450 },
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
  why: z.string().describe("One sentence for the founder on why this post should work, naming the hook pattern"),
  emotion: z
    .enum(EMOTIONS)
    .describe("The feeling a person in the background video should show so the joke lands, e.g. the pain point -> frustrated or tired, the payoff -> smug or happy"),
});

export type Remix = z.infer<typeof RemixSchema>;

const SYSTEM_PROMPT = `You write short-form social posts for small direct-to-consumer brands by remixing hooks that are already trending.

You get one trending hook and one of the brand's content angles. Keep the hook's structure, rhythm and pattern (the "POV:", the "me at 10pm vs 6am" contrast, the list, the "the worst part about..." setup) and swap its subject for the angle's pain point, so it still reads like something a real person posted, not an ad.

You'll be told which of two styles to write:
- Meme: one complete, relatable joke or moment that makes sense to someone who has never heard of the brand. Land the punchline on the pain point. Don't name or pitch the brand in the overlay; the caption does that.
- Story: a first-person post from a real customer, 2-4 sentences. Open with the hook's structure, describe the pain honestly, and end by naming the brand and what it does for you, like a friend's recommendation. Only use what the brand's description says it does.

Rules for both:
- Write like a person typing a caption: normal sentence case, plain words. Write words out in full: no abbreviations like "2h", "u", "bc", "w/".
- If you're given real customer phrases, echo their wording where it fits naturally: quote a phrase or build the joke on it. That's what makes a post feel written by a customer. Never attribute a quote to a named person.
- If you're given posts the brand loves, match their rhythm, length and humour. Don't copy them.
- If you're given a timely moment, tie the post to it only when it fits the pain point naturally; ignore it if it would feel forced.
- Never stereotype or mock any religion, region, caste, community or gender.
- Never mock or dismiss the kind of product the brand sells; the joke is about the pain point, not the category.
- Follow the brand's tone do's and don'ts exactly.
- Never invent facts about the product: no prices, ingredients, stats, results or claims beyond what you're given. No medical or health claims.
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

export async function remixHook(input: RemixInput): Promise<Remix> {
  const { brand, angle, hook, mentionBrand, product } = input;
  const format = hook.format === "wall_of_text" ? "Wall of Text (text over a background video)" : "Slideshow (text over product photos, one line per slide)";

  const prompt = `Brand: ${brand.name} — ${brand.one_liner} (${brand.category})
Tone do's:
${brand.tone_dos.map((t) => `- ${t}`).join("\n")}
Tone don'ts:
${brand.tone_donts.map((t) => `- ${t}`).join("\n")}
${product ? `\nProduct shown in the post: ${product.name}${product.price ? ` (${product.price})` : ""}${product.description ? ` — ${product.description.slice(0, 300)}` : ""}\n` : ""}
Angle: ${angle.title}
Pain point: ${angle.pain_point}

Trending hook to remix:
"""${hook.text}"""

Format: ${format}
${languageRule(input.language, input.culture)}${voiceBlock(input)}
${
    mentionBrand
      ? `Style: story. Name ${product ? "the product or " : ""}the brand once, near the end, as the thing that fixed it for you. No call to action ("try it", "link in bio").`
      : "Style: meme. Do not name the brand or product in the overlay text."
  }`;

  // Up to two rewrites: story posts sometimes overshoot on the first try.
  let feedback = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const remix = await generateObject({
      name: "hook_remix",
      schema: RemixSchema,
      system: SYSTEM_PROMPT,
      prompt: prompt + feedback,
    });
    const problem = checkLimits(remix, hook.format);
    if (!problem) return { ...remix, lines: cleanLines(remix.lines) };
    feedback = `\n\nYour previous attempt broke a length rule: ${problem} Rewrite it shorter.`;
  }
  throw new Error("The AI couldn't fit this post into the length limits. Try regenerating.");
}
