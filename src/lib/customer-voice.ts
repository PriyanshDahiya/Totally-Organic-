import "server-only";
import * as cheerio from "cheerio";
import { z } from "zod";
import { generateObject } from "./llm";
import { assertPublicUrl } from "./scrape";
import { MAX_CUSTOMER_PHRASES } from "./voice";

// Voice of the customer: how real buyers describe the problem and the
// product, in their own words. Posts that reuse those words feel written by
// a customer rather than a marketer.
//
// Sources: reviews on the store's own product pages (schema.org Review data
// and common Shopify review widgets rendered in the HTML), plus anything the
// founder pastes in (reviews, DMs, comments). We deliberately don't scrape
// Amazon or Reddit: both forbid it for commercial use without their API
// agreements.

const MAX_PAGES = 4;
const MAX_REVIEWS = 60;
const FETCH_TIMEOUT_MS = 8000;

function clean(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function reviewsInPage(html: string): string[] {
  const $ = cheerio.load(html);
  const found: string[] = [];

  // schema.org Review, in JSON-LD (Judge.me, Yotpo, Okendo and many themes emit it).
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const { reviewBody } = node as { reviewBody?: unknown };
    if (typeof reviewBody === "string") found.push(reviewBody);
    Object.values(node).forEach(visit);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      visit(JSON.parse($(el).text()));
    } catch {
      // Malformed JSON-LD is common; skip it.
    }
  });

  // Microdata and the widgets that render review text into the HTML.
  $('[itemprop="reviewBody"], .jdgm-rev__body, .spr-review-content-body, .okeReviews-review-main-content').each((_, el) => {
    found.push($(el).text());
  });

  return found.map(clean).filter((r) => r.length >= 15 && r.length <= 1200);
}

export async function reviewsFromProductPages(productUrls: string[]): Promise<string[]> {
  const pages = await Promise.all(
    productUrls.slice(0, MAX_PAGES).map(async (raw) => {
      try {
        const url = await assertPublicUrl(raw);
        const res = await fetch(url, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          headers: { "user-agent": "Mozilla/5.0 (compatible; BrandProfileBot/1.0)" },
        });
        return res.ok ? reviewsInPage(await res.text()) : [];
      } catch {
        return [];
      }
    }),
  );
  return [...new Set(pages.flat())].slice(0, MAX_REVIEWS);
}

const PhrasesSchema = z.object({
  phrases: z
    .array(z.string())
    .describe(`Up to ${MAX_CUSTOMER_PHRASES} short quotes copied exactly from the reviews`),
});

const SYSTEM_PROMPT = `You pick the most relatable phrases from real customer reviews, for a brand's social posts to echo.

Pick short quotes (4-20 words) that capture how customers describe their problem, their frustration before the product, or the moment it worked for them, in vivid everyday language. Prefer specific, funny or emotional wording over generic praise ("great product", "fast delivery" are useless).

Copy each quote EXACTLY as written in the reviews, character for character, including casual spelling and Hinglish. Never paraphrase, combine or invent. If nothing is vivid, return fewer quotes or none.`;

const normalise = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// Picks the phrases worth reusing. Anything the model returns that doesn't
// actually appear in the source text is dropped, so posts can only ever
// echo real customer words.
export async function extractCustomerPhrases(texts: string[]): Promise<string[]> {
  const corpus = texts.map(clean).filter(Boolean);
  if (corpus.length === 0) return [];
  // Keep the prompt inside Groq's free-tier token budget.
  let budget = 9000;
  const sample = corpus.filter((t) => (budget -= t.length) > 0);

  const { phrases } = await generateObject({
    name: "customer_phrases",
    schema: PhrasesSchema,
    system: SYSTEM_PROMPT,
    prompt: sample.map((t, i) => `Review ${i + 1}: ${t}`).join("\n"),
  });

  const haystack = normalise(sample.join(" \n "));
  return [...new Set(phrases.map(clean))]
    .filter((p) => p.split(/\s+/).length >= 3 && haystack.includes(normalise(p)))
    .slice(0, MAX_CUSTOMER_PHRASES);
}
