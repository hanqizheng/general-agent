import type { LLMProvider } from "@/core/provider/base";
import { db } from "@/db";
import { getSessionPresentationSeed } from "@/db/repositories/message-repository";
import { updateSessionPresentation } from "@/db/repositories/session-repository";
import { SESSION_EVENT_TYPE } from "@/lib/constants";
import { liveSessionRegistry } from "./live-session-registry";

const MAX_SEED_CHARS = 1_200;

function truncate(input: string, limit = MAX_SEED_CHARS) {
  const normalized = input.trim().replace(/\s+/g, " ");
  return normalized.length > limit
    ? `${normalized.slice(0, limit).trimEnd()}...`
    : normalized;
}

function sanitizeTitle(input: string) {
  return input
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function parsePresentation(raw: string) {
  const titleMatch = raw.match(/^title:\s*(.+)$/im);
  return sanitizeTitle(titleMatch?.[1] ?? raw);
}

async function collectTextResponse(provider: LLMProvider, prompt: string) {
  const stream = await provider.stream({
    systemPrompt: [
      "You generate short chat titles.",
      "Return exactly one line in plain text:",
      "Title: <short title>",
      "Do not add bullets, markdown, quotes, or extra commentary.",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: prompt }],
      },
    ],
    temperature: 0,
    maxTokens: 120,
  });

  let output = "";
  for await (const chunk of stream) {
    if (chunk.type === "text_delta") {
      output += chunk.text;
    }
  }

  return output;
}

export async function maybeGenerateSessionPresentation(params: {
  provider: LLMProvider;
  sessionId: string;
}) {
  const seed = await getSessionPresentationSeed(params.sessionId);
  if (!seed) {
    return null;
  }

  const prompt = [
    "Generate a short title for this chat.",
    "Use the conversation language when reasonable.",
    "Keep the title concise and useful for a sidebar.",
    "",
    "First user message:",
    truncate(seed.userText),
    "",
    "First assistant response:",
    truncate(seed.assistantText),
  ].join("\n");

  const raw = await collectTextResponse(params.provider, prompt).catch(
    () => null,
  );
  if (!raw) {
    return null;
  }

  const title = parsePresentation(raw);
  if (!title) {
    return null;
  }

  await db.transaction(async (tx) => {
    await updateSessionPresentation(tx, params.sessionId, {
      title,
      titleSource: "ai",
    });
  });

  liveSessionRegistry.broadcast(params.sessionId, {
    type: SESSION_EVENT_TYPE.PRESENTATION,
    sessionId: params.sessionId,
    seq: -1,
    timestamp: Date.now(),
    title,
  });

  return { title };
}
