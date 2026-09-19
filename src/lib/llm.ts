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
      return await complete(opts);
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
