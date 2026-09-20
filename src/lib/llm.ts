import "server-only";
import Groq from "groq-sdk";
import { z } from "zod";

// The only file that knows which LLM provider we use. v1 runs on Groq's free
// tier; swapping providers later (e.g. back to Claude) should only touch this.
//
// Free-tier limits for gpt-oss-120b: 30 req/min, 1,000 req/day,
// 8,000 tokens/min, 200,000 tokens/day — keep prompts small.
// https://console.groq.com/docs/rate-limits
const MODEL = "openai/gpt-oss-120b";

const client = new Groq();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A card makes several calls (drafts, judge, rewrites), so bursts hit the
// free tier's 30-a-minute limit; wait for the window Groq asks for instead
// of failing the card.
const RATE_LIMIT_TRIES = 4;

export async function generateObject<T extends z.ZodType>(opts: {
  name: string;
  schema: T;
  system: string;
  prompt: string;
}): Promise<z.infer<T>> {
  // The model occasionally emits JSON that doesn't match the schema (Groq
  // rejects it with a 400) or is empty; a second try almost always works.
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await withRateLimit(() => complete(opts));
    } catch (err) {
      const malformed =
        (err instanceof Groq.APIError && err.status === 400) || err instanceof SyntaxError || err instanceof z.ZodError;
      if (!malformed) throw err;
      lastError = err;
    }
  }
  console.error(`${opts.name}: malformed output twice`, lastError);
  throw new Error("The AI returned a broken answer. Try again.");
}

async function withRateLimit<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      const rateLimited = err instanceof Groq.APIError && (err.status === 429 || err.status === 503);
      if (!rateLimited || attempt >= RATE_LIMIT_TRIES - 1) throw err;
      // Groq says how long to wait; fall back to a growing pause.
      const headers = (err as { headers?: Record<string, string> }).headers;
      const retryAfter = Number(headers?.["retry-after"]) * 1000;
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30_000) : 2000 * 2 ** attempt);
    }
  }
}

async function complete<T extends z.ZodType>(opts: {
  name: string;
  schema: T;
  system: string;
  prompt: string;
}): Promise<z.infer<T>> {
  // Strict structured output: https://console.groq.com/docs/structured-outputs
  const completion = await client.chat.completions.create({
    model: MODEL,
    reasoning_effort: "low",
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.prompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: opts.name, strict: true, schema: z.toJSONSchema(opts.schema) },
    },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new SyntaxError("Empty response");
  return opts.schema.parse(JSON.parse(content));
}
