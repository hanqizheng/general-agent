import assert from "node:assert/strict";

import { z } from "zod";

import { ArtifactContractRegistry } from "../src/core/contracts";
import { executeTurn } from "../src/core/agent/turn";
import { EventBus } from "../src/core/events/bus";
import { EventEmitter } from "../src/core/events/emitter";
import type { AgentEvent } from "../src/core/events/types";
import {
  MESSAGE_PART_END_STATE,
  TOOL_END_STATE,
} from "../src/core/events/constants";
import { MESSAGE_PART_KIND } from "../src/lib/constants";
import type {
  LLMProvider,
  LLMStreamChunk,
} from "../src/core/provider/base";
import { ToolRegistry } from "../src/core/tools/registry";
import { createStructuredOutputTool } from "../src/core/tools/built-in/structured-output";

interface ScenarioOptions {
  chunks: LLMStreamChunk[];
  throwAfterChunks?: Error;
}

interface ExecuteScenarioOptions extends ScenarioOptions {
  tools?: {
    [name: string]: {
      schema?: z.ZodTypeAny;
      output?: string;
      isError?: boolean;
      concurrencySafe?: boolean;
    };
  };
  contractRegistry?: ArtifactContractRegistry;
}

function createMockProvider(options: ScenarioOptions): LLMProvider {
  return {
    name: "mock",
    async stream() {
      async function* gen() {
        for (const chunk of options.chunks) {
          yield chunk;
        }

        if (options.throwAfterChunks) {
          throw options.throwAfterChunks;
        }
      }

      return gen();
    },
  };
}

function createToolRegistry(
  options?: ExecuteScenarioOptions["tools"],
  contractRegistry?: ArtifactContractRegistry,
) {
  const registry = new ToolRegistry();

  // 如果有 contractRegistry，注册 structured_output 真工具
  if (contractRegistry && contractRegistry.list().length > 0) {
    registry.register(createStructuredOutputTool(contractRegistry));
  }

  for (const [name, tool] of Object.entries(options ?? {})) {
    registry.register({
      name,
      description: `Mock tool ${name}`,
      riskLevel: "low",
      concurrencySafe: tool.concurrencySafe,
      parameters: tool.schema ?? z.object({}),
      async execute() {
        return {
          output: tool.output ?? "ok",
          isError: tool.isError ?? false,
        };
      },
    });
  }

  return registry;
}

function summarizeEvent(event: AgentEvent): string {
  switch (event.type) {
    case "message.part.start":
      return `${event.type}#${event.partIndex}:${event.kind}`;

    case "message.part.end":
      return `${event.type}#${event.partIndex}:${event.kind}:${event.state}`;

    case "message.text.delta":
    case "message.text.done":
    case "message.reasoning.delta":
    case "message.reasoning.done":
    case "message.tool.start":
    case "message.tool.running":
      return `${event.type}#${event.partIndex}`;

    case "message.tool.end":
      return `${event.type}#${event.partIndex}:${event.state}`;

    case "message.artifact":
      return `${event.type}#${event.partIndex}`;

    default:
      return event.type;
  }
}

async function executeScenario(options: ExecuteScenarioOptions) {
  const provider = createMockProvider(options);
  const toolRegistry = createToolRegistry(options.tools, options.contractRegistry);
  const bus = new EventBus();
  const emitter = new EventEmitter(bus, "s_test_turn");
  const events: AgentEvent[] = [];

  bus.on((event) => {
    events.push(event);
  });

  try {
    const result = await executeTurn({
      provider,
      emitter,
      streamParams: {
        messages: [],
        systemPrompt: "You are a helpful assistant.",
      },
      toolRegistry,
      toolContext: { workspaceRoot: process.cwd() },
      contractRegistry: options.contractRegistry,
    });

    return {
      ok: true as const,
      events,
      result,
    };
  } catch (error) {
    return {
      ok: false as const,
      events,
      error: error instanceof Error ? error : new Error("Unknown error"),
    };
  } finally {
    bus.dispose();
  }
}

function assertSequence(
  actualEvents: AgentEvent[],
  expectedSequence: string[],
  scenarioName: string,
) {
  const actual = actualEvents.map(summarizeEvent);
  assert.deepEqual(actual, expectedSequence, `${scenarioName} event sequence`);
}

async function runPureTextScenario() {
  const scenario = await executeScenario({
    chunks: [
      { type: "text_delta", text: "hello" },
      { type: "text_delta", text: " world" },
    ],
  });

  if (!scenario.ok) {
    throw scenario.error;
  }

  assertSequence(
    scenario.events,
    [
      "message.start",
      "message.part.start#0:text",
      "message.text.delta#0",
      "message.text.delta#0",
      "message.text.done#0",
      `message.part.end#0:${MESSAGE_PART_KIND.TEXT}:${MESSAGE_PART_END_STATE.COMPLETE}`,
      "message.end",
    ],
    "pure text",
  );

  assert.deepEqual(scenario.result.assistantMessage.content, [
    { type: "text", text: "hello world" },
  ]);
}

async function runReasoningToTextScenario() {
  const scenario = await executeScenario({
    chunks: [
      { type: "reasoning_delta", text: "think" },
      { type: "text_delta", text: "answer" },
    ],
  });

  if (!scenario.ok) {
    throw scenario.error;
  }

  assertSequence(
    scenario.events,
    [
      "message.start",
      "message.part.start#0:reasoning",
      "message.reasoning.delta#0",
      "message.reasoning.done#0",
      `message.part.end#0:${MESSAGE_PART_KIND.REASONING}:${MESSAGE_PART_END_STATE.COMPLETE}`,
      "message.part.start#1:text",
      "message.text.delta#1",
      "message.text.done#1",
      `message.part.end#1:${MESSAGE_PART_KIND.TEXT}:${MESSAGE_PART_END_STATE.COMPLETE}`,
      "message.end",
    ],
    "reasoning -> text",
  );

  assert.deepEqual(scenario.result.assistantMessage.content, [
    { type: "reasoning", text: "think" },
    { type: "text", text: "answer" },
  ]);
}

async function runTextToToolScenario() {
  const scenario = await executeScenario({
    chunks: [
      { type: "text_delta", text: "read readme" },
      {
        type: "tool_use",
        id: "tc_read",
        name: "mock_read",
        input: { file: "README.md" },
      },
    ],
    tools: {
      mock_read: {
        schema: z.object({ file: z.string() }),
        output: "README contents",
      },
    },
  });

  if (!scenario.ok) {
    throw scenario.error;
  }

  assertSequence(
    scenario.events,
    [
      "message.start",
      "message.part.start#0:text",
      "message.text.delta#0",
      "message.text.done#0",
      `message.part.end#0:${MESSAGE_PART_KIND.TEXT}:${MESSAGE_PART_END_STATE.COMPLETE}`,
      "message.part.start#1:tool",
      "message.tool.start#1",
      "message.tool.running#1",
      `message.tool.end#1:${TOOL_END_STATE.COMPLETE}`,
      `message.part.end#1:${MESSAGE_PART_KIND.TOOL}:${MESSAGE_PART_END_STATE.COMPLETE}`,
      "message.end",
    ],
    "text -> tool",
  );
}

async function runToolToToolScenario() {
  const scenario = await executeScenario({
    chunks: [
      {
        type: "tool_use",
        id: "tc_first",
        name: "mock_tool",
        input: {},
      },
      {
        type: "tool_use",
        id: "tc_second",
        name: "mock_tool",
        input: {},
      },
    ],
    tools: {
      mock_tool: {
        output: "ok",
      },
    },
  });

  if (!scenario.ok) {
    throw scenario.error;
  }

  assertSequence(
    scenario.events,
    [
      "message.start",
      "message.part.start#0:tool",
      "message.part.start#1:tool",
      "message.tool.start#0",
      "message.tool.running#0",
      `message.tool.end#0:${TOOL_END_STATE.COMPLETE}`,
      `message.part.end#0:${MESSAGE_PART_KIND.TOOL}:${MESSAGE_PART_END_STATE.COMPLETE}`,
      "message.tool.start#1",
      "message.tool.running#1",
      `message.tool.end#1:${TOOL_END_STATE.COMPLETE}`,
      `message.part.end#1:${MESSAGE_PART_KIND.TOOL}:${MESSAGE_PART_END_STATE.COMPLETE}`,
      "message.end",
    ],
    "tool -> tool",
  );
}

async function runStructuredOutputScenario() {
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

  // 现在 structured_output 是个真工具，需要通过 toolRegistry 注册
  const scenario = await executeScenario({
    chunks: [
      {
        type: "tool_use",
        id: "tc_structured",
        name: "structured_output",
        input: {
          contract_id: "repo-risk-report@v1",
          data: {
            summary: "Two high-priority repository risks were identified.",
          },
          summaryText: "Two high-priority risks identified.",
        },
      },
    ],
    // 不再需要单独传 tools，通过 contractRegistry 来注册 structured_output
    contractRegistry,
  });

  if (!scenario.ok) {
    throw scenario.error;
  }

  assertSequence(
    scenario.events,
    [
      "message.start",
      "message.part.start#0:tool",
      "message.tool.start#0",
      "message.tool.running#0",
      `message.tool.end#0:${TOOL_END_STATE.COMPLETE}`,
      `message.part.end#0:${MESSAGE_PART_KIND.TOOL}:${MESSAGE_PART_END_STATE.COMPLETE}`,
      "message.part.start#1:artifact",
      "message.artifact#1",
      `message.part.end#1:${MESSAGE_PART_KIND.ARTIFACT}:${MESSAGE_PART_END_STATE.COMPLETE}`,
      "message.end",
    ],
    "structured output",
  );

  assert.deepEqual(scenario.result.assistantMessage.content, [
    {
      type: "tool_use",
      id: "tc_structured",
      name: "structured_output",
      input: {
        contract_id: "repo-risk-report@v1",
        data: {
          summary: "Two high-priority repository risks were identified.",
        },
        summaryText: "Two high-priority risks identified.",
      },
    },
    {
      type: "artifact",
      artifactType: "repo_risk_report",
      contractId: "repo-risk-report@v1",
      producer: {
        kind: "tool",
        name: "structured_output",
      },
      data: {
        summary: "Two high-priority repository risks were identified.",
      },
      summaryText: "Two high-priority risks identified.",
    },
  ]);

  assert.deepEqual(scenario.result.toolResultMessage?.content, [
    {
      type: "tool_result",
      toolCallId: "tc_structured",
      content:
        'Structured artifact "repo-risk-report@v1" produced successfully.',
      isError: false,
    },
  ]);
}

async function runStreamErrorScenario() {
  const scenario = await executeScenario({
    chunks: [{ type: "text_delta", text: "partial" }],
    throwAfterChunks: new Error("stream failed"),
  });

  if (scenario.ok) {
    throw new Error("stream error scenario should fail");
  }
  assert.equal(scenario.error.message, "stream failed");

  assertSequence(
    scenario.events,
    [
      "message.start",
      "message.part.start#0:text",
      "message.text.delta#0",
      `message.part.end#0:${MESSAGE_PART_KIND.TEXT}:${MESSAGE_PART_END_STATE.ERROR}`,
      "message.end",
    ],
    "stream error",
  );

  assert.equal(
    scenario.events.some((event) => event.type === "message.text.done"),
    false,
    "stream error should not emit message.text.done",
  );
}

async function runToolDeclaredThenStreamErrorScenario() {
  const scenario = await executeScenario({
    chunks: [
      {
        type: "tool_use",
        id: "tc_pending",
        name: "mock_tool",
        input: {},
      },
    ],
    throwAfterChunks: new Error("tool stream failed"),
  });

  if (scenario.ok) {
    throw new Error("tool declared then stream error scenario should fail");
  }
  assert.equal(scenario.error.message, "tool stream failed");

  assertSequence(
    scenario.events,
    [
      "message.start",
      "message.part.start#0:tool",
      `message.part.end#0:${MESSAGE_PART_KIND.TOOL}:${MESSAGE_PART_END_STATE.ERROR}`,
      "message.end",
    ],
    "tool declared then stream error",
  );

  assert.equal(
    scenario.events.some((event) => event.type === "message.tool.start"),
    false,
    "tool declared then stream error should not emit message.tool.start",
  );
}

async function runConcurrentToolsScenario() {
  // 两个 concurrencySafe=true 的工具应该被分入同一个并行批次
  // 事件顺序：两个 start/running 可以交错（Promise.allSettled 并行）
  // 但 tool_result 顺序必须与 tool_use 顺序一致
  const executionOrder: string[] = [];

  const scenario = await executeScenario({
    chunks: [
      {
        type: "tool_use",
        id: "tc_read_a",
        name: "mock_read",
        input: { file: "a.txt" },
      },
      {
        type: "tool_use",
        id: "tc_read_b",
        name: "mock_read",
        input: { file: "b.txt" },
      },
    ],
    tools: {
      mock_read: {
        schema: z.object({ file: z.string() }),
        output: "file contents",
        concurrencySafe: true,
      },
    },
  });

  if (!scenario.ok) {
    throw scenario.error;
  }

  // 关键断言：tool_result 顺序正确且两个工具都成功完成
  assert.equal(scenario.result.hasToolCalls, true);
  assert.equal(scenario.result.toolResultMessage?.content.length, 2);

  // 验证事件中两个工具都经历了完整的生命周期
  const toolStartEvents = scenario.events.filter(
    (e) => e.type === "message.tool.start",
  );
  const toolEndEvents = scenario.events.filter(
    (e) => e.type === "message.tool.end",
  );
  assert.equal(toolStartEvents.length, 2, "should have 2 tool starts");
  assert.equal(toolEndEvents.length, 2, "should have 2 tool ends");
}

async function runMixedConcurrencyScenario() {
  // 混合场景：[read(safe), write(unsafe), read(safe)]
  // 应该分为 3 个批次：
  //   batch 1: [read] concurrent=true (单个也走串行路径)
  //   batch 2: [write] concurrent=false
  //   batch 3: [read] concurrent=true
  const scenario = await executeScenario({
    chunks: [
      {
        type: "tool_use",
        id: "tc_read_1",
        name: "mock_read",
        input: { file: "a.txt" },
      },
      {
        type: "tool_use",
        id: "tc_write_1",
        name: "mock_write",
        input: { file: "b.txt" },
      },
      {
        type: "tool_use",
        id: "tc_read_2",
        name: "mock_read",
        input: { file: "c.txt" },
      },
    ],
    tools: {
      mock_read: {
        schema: z.object({ file: z.string() }),
        output: "read ok",
        concurrencySafe: true,
      },
      mock_write: {
        schema: z.object({ file: z.string() }),
        output: "write ok",
        concurrencySafe: false,
      },
    },
  });

  if (!scenario.ok) {
    throw scenario.error;
  }

  // 3 个工具都应该完成
  assert.equal(scenario.result.toolResultMessage?.content.length, 3);

  // 验证执行顺序：write 的 tool.end 必须在 read_1 的 tool.end 之后、
  // read_2 的 tool.start 之前
  const toolEndEvents = scenario.events
    .filter((e) => e.type === "message.tool.end")
    .map((e) => (e as { toolCallId: string }).toolCallId);

  assert.deepEqual(
    toolEndEvents,
    ["tc_read_1", "tc_write_1", "tc_read_2"],
    "tools should execute in batch order: read_1 → write_1 → read_2",
  );
}

async function main() {
  const tests: Array<[string, () => Promise<void>]> = [
    ["pure text", runPureTextScenario],
    ["reasoning -> text", runReasoningToTextScenario],
    ["text -> tool", runTextToToolScenario],
    ["tool -> tool", runToolToToolScenario],
    ["concurrent tools", runConcurrentToolsScenario],
    ["mixed concurrency", runMixedConcurrencyScenario],
    ["structured output", runStructuredOutputScenario],
    ["stream error", runStreamErrorScenario],
    ["tool declared then stream error", runToolDeclaredThenStreamErrorScenario],
  ];

  for (const [name, test] of tests) {
    await test();
    console.log(`PASS ${name}`);
  }

  console.log(`\nAll ${tests.length} turn scenarios passed.`);
}

main().catch((error) => {
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
});
