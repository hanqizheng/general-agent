import { createAnthropicProvider } from "./anthropic";
import { createMoonshotProvider } from "./moonshot";

import { env } from "@/lib/config";

export function getDefaultProviderConfig() {
  if (env.ANTHROPIC_AUTH_TOKEN && env.ANTHROPIC_BASE_URL) {
    const model = "claude-opus-4-6-v1";
    return {
      provider: createAnthropicProvider({
        apiKey: env.ANTHROPIC_AUTH_TOKEN,
        baseURL: env.ANTHROPIC_BASE_URL,
        model,
      }),
      model,
    };
  }

  if (env.MOONSHOT_API_KEY) {
    const model = "kimi-k2-0711-preview";
    return {
      provider: createMoonshotProvider({
        apiKey: env.MOONSHOT_API_KEY,
        model,
      }),
      model,
    };
  }

  throw new Error("No LLM provider is configured");
}
