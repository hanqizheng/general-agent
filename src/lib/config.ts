import { z } from "zod";

const envBoolean = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return value;
}, z.boolean());

const envSchema = z.object({
  // Anthropic (via AWS)
  ANTHROPIC_AUTH_TOKEN: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().url().optional(),

  // Moonshot
  MOONSHOT_API_KEY: z.string().optional(),

  // Gemini (Google AI Studio) — for web search grounding
  GEMINI_API_KEY: z.string().optional(),
  WEB_SEARCH_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  WEB_SEARCH_MAX_RETRIES: z.coerce.number().int().nonnegative().optional(),

  // Optional outbound HTTP policy for web-capable tools
  OUTBOUND_HTTP_MODE: z.enum(["auto", "direct", "proxy"]).optional(),
  OUTBOUND_PROXY_URL: z.string().url().optional(),
  OUTBOUND_NO_PROXY: z.string().optional(),
  OUTBOUND_ALLOW_DIRECT_FALLBACK: envBoolean.optional(),
  OUTBOUND_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().optional(),

  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_STALE_RUN_MS: z.coerce.number().int().positive().optional(),
  ARTIFACTS_DIR: z.string().min(1).optional(),

  // Auth
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),

  // Node environment
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

const nodeEnvSchema = z
  .enum(["development", "production", "test"])
  .default("development");
const DEV_AUTH_SECRET = "local-dev-auth-secret";

function loadEnv(): Env {
  const nodeEnv = nodeEnvSchema.parse(process.env.NODE_ENV);
  const authSecret =
    process.env.AUTH_SECRET ||
    (nodeEnv === "production" ? undefined : DEV_AUTH_SECRET);

  if (!process.env.AUTH_SECRET && nodeEnv !== "production") {
    console.warn(
      "AUTH_SECRET is not set. Falling back to a local development secret. Set AUTH_SECRET explicitly for shared or production environments.",
    );
  }

  const result = envSchema.safeParse({
    ...process.env,
    NODE_ENV: nodeEnv,
    AUTH_SECRET: authSecret,
  });

  if (!result.success) {
    console.error("Invalid environment variables:");
    console.error(result.error.format());
    throw new Error("Invalid environment variables");
  }

  return result.data;
}

export const env = loadEnv();
