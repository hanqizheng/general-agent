// Built-in tool: web_search — Google Search via Gemini grounding

import { z } from "zod";

import type { ToolDefinition } from "../types";
import { outboundFetch, formatNetworkError } from "@/core/network/http";
import { truncateOutput } from "../utils";
import { MAX_TOOL_OUTPUT_CHARS } from "@/lib/constants";

const webSearchParams = z.object({
  query: z.string().describe("The search query"),
});

interface WebSearchToolOptions {
  apiKey: string;
  model?: string;
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

export function createWebSearchTool(
  options: WebSearchToolOptions,
): ToolDefinition<z.infer<typeof webSearchParams>> {
  const { apiKey, model = "gemini-2.5-flash" } = options;

  const baseUrl = "https://generativelanguage.googleapis.com/v1beta";

  return {
    name: "web_search",
    description:
      "Search the web using Google Search. Returns a list of search results with titles, URLs, and snippets. Use this when you need up-to-date information from the internet.",
    riskLevel: "low",
    parameters: webSearchParams,

    async execute(input) {
      const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;
      try {
        const body = JSON.stringify({
          contents: [{ parts: [{ text: input.query }] }],
          tools: [{ googleSearch: {} }],
        });

        const { response } = await outboundFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
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
        return {
          output: `Error performing web search: ${formatNetworkError(error)}.`,
          isError: true,
        };
      }
    },
  };
}
