import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { ScrapedSite } from "./scrape";

export const BrandProfileSchema = z.object({
  identity: z.object({
    name: z.string(),
    one_liner: z.string().describe("What the brand sells, in one plain sentence"),
    category: z.string().describe("Product category, e.g. 'skincare', 'coffee', 'pet supplements'"),
  }),
  product: z.object({
    summary: z.string(),
    key_benefits: z.array(z.string()),
  }),
  segments: z
    .array(
      z.object({
        name: z.string(),
        share_percent: z.number().describe("Estimated share of customers; all segments sum to 100"),
        description: z.string(),
      }),
    )
    .describe("2-4 customer segments"),
  competitors: z.array(z.object({ name: z.string(), how_we_differ: z.string() })),
  angles: z
    .array(
      z.object({
        title: z.string(),
        pain_point: z.string().describe("The everyday frustration this angle speaks to"),
        example_hook: z.string().describe("One short, relatable meme-style line, not ad copy"),
      }),
    )
    .describe("Exactly 3 content angles"),
  tone_dos: z.array(z.string()),
  tone_donts: z.array(z.string()),
  niche_tags: z.array(z.string()).describe("3-6 lowercase tags used to match trending posts, e.g. 'skincare', 'gym'"),
});

export type BrandProfile = z.infer<typeof BrandProfileSchema>;

const SYSTEM_PROMPT = `You build brand profiles for small direct-to-consumer brands so we can write short-form social content for them.
Base every field on the website content you are given. Where you have to infer (segments, competitors), make a sensible estimate from the product and category.
Angles are pain points or everyday moments a customer would recognize, written for relatable meme-style posts on Instagram and TikTok, not polished ad copy.
Tone rules should be concrete enough for a copywriter to follow.`;

const client = new Anthropic();

export async function generateBrandProfile(site: ScrapedSite): Promise<BrandProfile> {
  const products = site.products
    .map((p) => `- ${p.name}${p.price ? ` (${p.price})` : ""}: ${p.description?.slice(0, 600) ?? ""}`)
    .join("\n");

  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(BrandProfileSchema) },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Website: ${site.url}
Title: ${site.title}
Meta description: ${site.metaDescription}

Products:
${products}

Page text:
${site.text}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new Error("The model declined to profile this website.");
  if (!response.parsed_output) throw new Error("Couldn't build a brand profile from that website. Try again.");
  return response.parsed_output;
}
