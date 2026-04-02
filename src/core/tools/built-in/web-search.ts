// Built-in tool: web_search — Google Search via Gemini grounding

import { z } from "zod";

import type { ToolDefinition } from "../types";
import {
  outboundFetch,
  formatNetworkError,
  isRetryableNetworkError,
} from "@/core/network/http";
import { truncateOutput } from "../utils";
import { MAX_TOOL_OUTPUT_CHARS } from "@/lib/constants";
import { createLogger } from "@/lib/logger";

const webSearchParams = z.object({
  query: z.string().describe("The search query"),
});

const DEFAULT_WEB_SEARCH_TIMEOUT_MS = 30_000;
const DEFAULT_WEB_SEARCH_MAX_RETRIES = 1;

interface WebSearchToolOptions {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

// ── Gemini REST API response types (only the fields we use) ──

interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    groundingMetadata?: {
      groundingChunks?: { web?: { title?: string; uri?: string } }[];
    };
  }[];
}

const logger = createLogger("tool:web-search");

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createWebSearchTool(
  options: WebSearchToolOptions,
): ToolDefinition<z.infer<typeof webSearchParams>> {
  const {
    apiKey,
    model = "gemini-2.5-flash",
    timeoutMs = DEFAULT_WEB_SEARCH_TIMEOUT_MS,
    maxRetries = DEFAULT_WEB_SEARCH_MAX_RETRIES,
  } = options;

  const baseUrl = "https://generativelanguage.googleapis.com/v1beta";

  return {
    name: "web_search",
    description:
      "Search the web using Google Search. Returns a list of search results with titles, URLs, and snippets. Use this when you need up-to-date information from the internet.",
    riskLevel: "low",
    concurrencySafe: true,
    parameters: webSearchParams,

    async execute(input) {
      const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;
      const totalAttempts = Math.max(1, maxRetries + 1);
      const body = JSON.stringify({
        contents: [{ parts: [{ text: input.query }] }],
        tools: [{ googleSearch: {} }],
      });

      let lastError: unknown;

      for (let attempt = 1; attempt <= totalAttempts; attempt++) {
        try {
          const { response } = await outboundFetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            timeoutMs,
          });

          if (!response.ok) {
            const errText = await response.text();
            return {
              output: `Gemini API error (${response.status}): ${errText}`,
              isError: true,
            };
          }

          const data = (await response.json()) as GeminiResponse;
          const candidate = data.candidates?.[0];
          const groundingMetadata = candidate?.groundingMetadata;

          // Extract model text
          const summaryText = candidate?.content?.parts
            ?.map((p) => p.text)
            .filter(Boolean)
            .join("\n");

          if (!groundingMetadata?.groundingChunks?.length) {
            return {
              output: summaryText || "No search results found.",
              isError: false,
            };
          }

          // Format search results
          const results = groundingMetadata.groundingChunks.map((chunk, i) => {
            const web = chunk.web;
            return `[${i + 1}] ${web?.title || "Untitled"}\n    URL: ${web?.uri || "N/A"}`;
          });

          let output = `Search results for: "${input.query}"\n\n${results.join("\n\n")}`;

          if (summaryText) {
            output += `\n\n--- Summary ---\n${summaryText}`;
          }

          return {
            output: truncateOutput(output, MAX_TOOL_OUTPUT_CHARS),
            isError: false,
          };
        } catch (error: unknown) {
          lastError = error;

          if (attempt >= totalAttempts || !isRetryableNetworkError(error)) {
            break;
          }

          logger.warn("Web search attempt failed, retrying", {
            attempt,
            totalAttempts,
            timeoutMs,
            query: input.query,
            error: formatNetworkError(error),
          });

          await sleep(Math.min(500 * 2 ** (attempt - 1), 1_500));
        }
      }

      return {
        output: `Error performing web search after ${totalAttempts} attempt(s) with timeout ${timeoutMs}ms: ${formatNetworkError(lastError)}.`,
        isError: true,
      };
    },
  };
}
