import path from "path";

import { genSessionId } from "@/lib/id";
import { EventBus } from "@/core/events/bus";
import { EventEmitter } from "@/core/events/emitter";
import { SSEBatcher } from "@/core/sse/batcher";
import { createAnthropicProvider } from "@/core/provider/anthropic";
import { runAgentLoop } from "@/core/agent/loop";
import { ToolRegistry } from "@/core/tools/registry";
import { readTool } from "@/core/tools/built-in/read";
import { writeTool } from "@/core/tools/built-in/write";
import { editTool } from "@/core/tools/built-in/edit";
import { bashTool } from "@/core/tools/built-in/bash";
import { grepTool } from "@/core/tools/built-in/grep";
import { globTool } from "@/core/tools/built-in/glob";
import { loadSkills, buildSkillsXml } from "@/core/skills";
import { buildSystemPrompt } from "@/core/prompt/system";

// POST /api/chat — send message, trigger agent loop
export async function POST(req: Request) {
  const body = (await req.json()) as { message?: unknown };
  const { message } = body;
  const workspaceRoot = process.cwd();

  if (!message || typeof message !== "string") {
    return new Response("message is required", { status: 400 });
  }
  // TODO: 后续接入 session API / DB 后，这里应该从 body 或 route params 中读取 sessionId
  const sessionId = genSessionId();

  const bus = new EventBus();
  const emitter = new EventEmitter(bus, sessionId);

  const { readable, writable } = new TransformStream<Uint8Array>();
  const batcher = new SSEBatcher(writable);

  bus.on((event) => {
    batcher.push(event);
  });

  const provider = createAnthropicProvider({
    apiKey: process.env.ANTHROPIC_AUTH_TOKEN!,
    baseURL: process.env.ANTHROPIC_BASE_URL!,
  });

  const toolRegistry = new ToolRegistry();
  toolRegistry.register(readTool);
  toolRegistry.register(writeTool);
  toolRegistry.register(editTool);
  toolRegistry.register(bashTool);
  toolRegistry.register(grepTool);
  toolRegistry.register(globTool);

  const skillsRoot = path.resolve(process.cwd(), "src/skills");
  const skills = await loadSkills(skillsRoot);
  const skillsXml = buildSkillsXml(skills);
  const systemPrompt = await buildSystemPrompt({
    skillsXml,
    workspaceRoot,
  });

  void runAgentLoop({
    emitter,
    provider,
    systemPrompt,
    userMessage: message,
    history: [],
    toolContext: { workspaceRoot },
    toolRegistry,
  })
    .catch((error: unknown) => {
      emitter.emit({
        type: "session.error",
        error: {
          code: "AGENT_LOOP_UNCAUGHT",
          message:
            error instanceof Error ? error.message : "Unknown agent loop error",
          recoverable: false,
        },
      });
    })
    .finally(() => {
      void batcher.close();
      bus.dispose();
    });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
