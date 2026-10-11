import { z } from "zod";

/**
 * Server environment, validated once when this module is first imported.
 * `src/instrumentation.ts` imports it at server start, so a missing or bad
 * variable stops the server before it takes a request (technical design section 10).
 */
const EnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  LLM_API_KEY: z.string().min(1),
  LLM_BASE_URL: z.url().default("https://api.groq.com/openai/v1"),
  LLM_MODEL: z.string().min(1).default("openai/gpt-oss-120b"),
  FAULT_INJECTION: z.stringbool().default(false),
});

export type Env = z.infer<typeof EnvSchema>;

function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(
      `Invalid environment variables:\n${z.prettifyError(result.error)}\n` +
        "For local development, copy .env.example to .env.",
    );
  }
  return result.data;
}

export const env = parseEnv(process.env);
