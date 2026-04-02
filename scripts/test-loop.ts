import assert from "node:assert/strict";

import { ArtifactContractRegistry } from "../src/core/contracts";
import { runAgentLoop } from "../src/core/agent/loop";
import { EventBus } from "../src/core/events/bus";
import { EventEmitter } from "../src/core/events/emitter";
import type { AgentEvent } from "../src/core/events/types";
import { LOOP_END_REASON } from "../src/core/events/constants";
import { MESSAGE_ROLE } from "../src/lib/constants";
import type { LLMProvider, LLMStreamChunk } from "../src/core/provider/base";
import { ToolRegistry } from "../src/core/tools/registry";
import { createStructuredOutputTool } from "../src/core/tools/built-in/structured-output";

/**
 * 测试：当 targetArtifactContractId 被设置但 LLM 没有主动调用 structured_output 时，
 * loop 应该注入一条提醒消息让 LLM 继续循环。
 *
 * 模拟 2 个 turn：
 * - Turn 1：LLM 只输出文本（没有调工具）→ loop 检测到 artifact 缺失，注入提醒，continue
 * - Turn 2：LLM 调用 structured_output 工具 → 工具验证通过 → loop 正常结束
 */

let callCount = 0;

function createMockProvider(
  firstChunks: LLMStreamChunk[],
  secondChunks: LLMStreamChunk[],
  thirdChunks?: LLMStreamChunk[],
): LLMProvider {
  return {
    name: "mock",
    async stream() {
      callCount += 1;
      const chunks =
        callCount === 1
          ? firstChunks
          : callCount === 2
            ? secondChunks
            : thirdChunks ?? [{ type: "text_delta" as const, text: "Done." }];
      async function* gen() {
        for (const chunk of chunks) {
          yield chunk;
        }
      }
      return gen();
    },
  };
}

async function runArtifactReminderScenario() {
  callCount = 0;
  const bus = new EventBus();
  const emitter = new EventEmitter(bus, "s_test_loop");
  const events: AgentEvent[] = [];
  const contractRegistry = new ArtifactContractRegistry();

  contractRegistry.register({
    id: "repo-risk-report@v1",
    artifactType: "repo_risk_report",
    schema: {
      type: "object",
      required: ["summary"],
      properties: {
        summary: { type: "string" },
      },
      additionalProperties: false,
    },
  });

  const toolRegistry = new ToolRegistry();
  toolRegistry.register(createStructuredOutputTool(contractRegistry));

  bus.on((event) => {
    events.push(event);
  });

  try {
    const result = await runAgentLoop({
      emitter,
      history: [],
      userContent: [{ type: "text", text: "Summarize the repository risks." }],
      provider: createMockProvider(
        // Turn 1: LLM only outputs text (no tool calls)
        [{ type: "text_delta", text: "Risk summary is ready." }],
        // Turn 2: LLM calls structured_output tool
        [
          { type: "text_delta", text: "Here is the structured report." },
          {
            type: "tool_use",
            id: "tool_001",
            name: "structured_output",
            input: {
              contract_id: "repo-risk-report@v1",
              data: { summary: "The repository has one high-priority risk." },
              summaryText: "One high-priority risk identified.",
            },
          },
        ],
      ),
      systemPrompt: "You are a helpful assistant.",
      maxTurns: 5,
      contractRegistry,
      targetArtifactContractId: "repo-risk-report@v1",
      toolContext: { workspaceRoot: "/tmp" },
      toolRegistry,
    });

    // Turn 1: text only → artifact missing → inject reminder → continue
    // Turn 2: LLM calls structured_output → tool validates → produces artifact → has tool calls → continue
    // Turn 3: LLM outputs final text → no tool calls → COMPLETE
    assert.equal(result.endReason, LOOP_END_REASON.COMPLETE);
    assert.equal(result.turnCount, 3);

    // Verify the reminder message was injected
    const reminderMessage = result.messages.find(
      (m) =>
        m.role === MESSAGE_ROLE.USER &&
        m.content.some(
          (b) =>
            b.type === "text" &&
            b.text.includes("You must call the structured_output tool"),
        ),
    );
    assert.ok(reminderMessage, "expected artifact reminder message to be injected");

    // Verify the artifact event was emitted via the tool system
    const artifactEvent = events.find(
      (event) =>
        event.type === "message.artifact" &&
        event.artifact.contractId === "repo-risk-report@v1",
    );
    assert.ok(artifactEvent, "expected structured artifact event from tool");

    console.log("PASS structured_output via tool system with artifact reminder");
  } finally {
    bus.dispose();
  }
}

/**
 * 测试：Doom loop 检测。
 *
 * 模拟 LLM 每个 turn 都调用同一个不存在的工具 → 连续 4 次相同错误 → 检测到 doom loop。
 */
async function runDoomLoopScenario() {
  const bus = new EventBus();
  const emitter = new EventEmitter(bus, "s_test_doom");
  const events: AgentEvent[] = [];

  // LLM 每次都调用 read_file({ path: "/nonexistent" })，工具会报错
  const failingToolChunks: LLMStreamChunk[] = [
    {
      type: "tool_use",
      id: "tc_read",
      name: "mock_read",
      input: { path: "/nonexistent" },
    },
  ];

  const toolRegistry = new ToolRegistry();
  toolRegistry.register({
    name: "mock_read",
    description: "Mock read",
    riskLevel: "low",
    parameters: (await import("zod")).z.object({ path: (await import("zod")).z.string() }),
    async execute() {
      return { output: "Error: file not found", isError: true };
    },
  });

  const provider: LLMProvider = {
    name: "mock",
    async stream() {
      async function* gen() {
        for (const chunk of failingToolChunks) {
          yield chunk;
        }
      }
      return gen();
    },
  };

  bus.on((event) => {
    events.push(event);
  });

  try {
    const result = await runAgentLoop({
      emitter,
      history: [],
      userContent: [{ type: "text", text: "Read the file." }],
      provider,
      systemPrompt: "You are a helpful assistant.",
      maxTurns: 10,
      toolContext: { workspaceRoot: "/tmp" },
      toolRegistry,
    });

    // DOOM_LOOP_THRESHOLD=4，所以应该在第 4 个 turn 停止
    assert.equal(result.endReason, LOOP_END_REASON.DOOM_LOOP);
    assert.equal(result.turnCount, 4);

    // 验证 doom loop 错误事件被发出
    const doomEvent = events.find(
      (e) =>
        e.type === "session.error" &&
        "error" in e &&
        (e as { error: { code: string } }).error.code === "DOOM_LOOP",
    );
    assert.ok(doomEvent, "expected DOOM_LOOP error event");

    console.log("PASS doom loop detection");
  } finally {
    bus.dispose();
  }
}

/**
 * 测试：max_output_tokens 截断恢复。
 *
 * 模拟 LLM 第一次输出被截断（stop reason = "max_tokens"），
 * loop 注入续接提示后第二次正常完成。
 */
async function runTruncationRecoveryScenario() {
  let turnCallCount = 0;

  const provider: LLMProvider = {
    name: "mock",
    async stream() {
      turnCallCount += 1;
      async function* gen() {
        if (turnCallCount === 1) {
          // 第一次：输出文本后 stop reason = max_tokens
          yield { type: "text_delta" as const, text: "This is a long response that gets cut off at the lim" };
          yield { type: "stop" as const, stopReason: "max_tokens" };
        } else if (turnCallCount === 2) {
          // 第二次：LLM 续接输出，正常结束
          yield { type: "text_delta" as const, text: "it. Here is the rest of the response." };
          yield { type: "stop" as const, stopReason: "end_turn" };
        } else {
          yield { type: "text_delta" as const, text: "Done." };
          yield { type: "stop" as const, stopReason: "end_turn" };
        }
      }
      return gen();
    },
  };

  const bus = new EventBus();
  const emitter = new EventEmitter(bus, "s_test_truncation");
  const events: AgentEvent[] = [];

  bus.on((event) => {
    events.push(event);
  });

  try {
    const result = await runAgentLoop({
      emitter,
      history: [],
      userContent: [{ type: "text", text: "Write a long essay." }],
      provider,
      systemPrompt: "You are helpful.",
      maxTurns: 5,
      toolContext: { workspaceRoot: "/tmp" },
    });

    // Turn 1: text truncated → inject continuation prompt → continue
    // Turn 2: text completes normally → no tool calls → COMPLETE
    assert.equal(result.endReason, LOOP_END_REASON.COMPLETE);
    assert.equal(result.turnCount, 2);

    // 验证续接提示被注入
    const continuationMessage = result.messages.find(
      (m) =>
        m.role === "user" &&
        m.content.some(
          (b) =>
            b.type === "text" &&
            b.text.includes("continue exactly where you left off"),
        ),
    );
    assert.ok(continuationMessage, "expected continuation prompt to be injected");

    console.log("PASS truncation recovery");
  } finally {
    bus.dispose();
  }
}

async function main() {
  await runArtifactReminderScenario();
  await runDoomLoopScenario();
  await runTruncationRecoveryScenario();
  console.log("\nAll loop scenarios passed.");
}

main().catch((error) => {
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
});
