import "server-only";
import { z } from "zod";
import { generateObject } from "./llm";
import type { BrandProfile } from "./brand-profile";

// Background "scenes": stock-footage searches showing the brand's customers
// in their everyday life. Written once per brand and rotated card to card,
// because letting each card pick its own background made every card land on
// the same few clips (the copy is about scrolling, so: person on phone).

export const SCENE_COUNT = 8;

const ScenesSchema = z.object({
  scenes: z
    .array(z.string())
    .describe(`Exactly ${SCENE_COUNT} stock-footage searches, 3-4 words each`),
});

const SYSTEM_PROMPT = `You pick background footage for a brand's short-form videos. The text on top is a relatable post; the footage behind it should look like a real person filmed a moment of their day on a phone.

Write ${SCENE_COUNT} stock-footage searches, each showing ONE person from the brand's customer base doing something in their everyday life that fits the brand's world.
- Every scene in a different setting (home, gym, kitchen, street, cafe, office, outdoors, car...) and a different activity. No two alike.
- Short, common stock-footage wording, 3-4 words: person + one action + one place, e.g. "woman running in park", "man lifting weights gym", "woman cooking in kitchen", "man drinking coffee cafe". Plain words stock sites use, nothing oddly specific.
- About half the scenes should be selfie-style: the person filming themselves or talking to the camera, like creator UGC ("woman talking to camera in car", "man selfie video in gym", "woman vlogging in kitchen"). These look the most like a real person's post.
- Otherwise no phones, laptops, screens or social media in any scene. No product shots, no text, no crowds.
- Match the customers' age and lifestyle from the profile.`;

export async function generateScenes(profile: Pick<BrandProfile, "identity" | "segments">, angles: BrandProfile["angles"]) {
  const { scenes } = await generateObject({
    name: "scenes",
    schema: ScenesSchema,
    system: SYSTEM_PROMPT,
    prompt: `Brand: ${profile.identity.name} — ${profile.identity.one_liner} (${profile.identity.category})
Customers:
${profile.segments.map((s) => `- ${s.name}: ${s.description}`).join("\n")}
What their posts are about:
${angles.map((a) => `- ${a.title}: ${a.pain_point}`).join("\n")}`,
  });
  return cleanScenes(scenes);
}

export function cleanScenes(scenes: string[]) {
  return [...new Set(scenes.map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
}
