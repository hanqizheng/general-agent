import assert from "node:assert/strict";

import {
  estimateBlockTokens,
  estimateMessageTokens,
  estimateMessagesTokens,
  trimMessagesToFitBudget,
} from "../src/core/agent/token-budget";
import type { LLMMessage } from "../src/core/provider/base";
import type { ContextWindowConfig } from "../src/core/agent/token-budget";

function makeTextMessage(role: "user" | "assistant", text: string): LLMMessage {
  return { role, content: [{ type: "text", text }] };
}

async function testEstimateBlockTokens() {
  // 文本块：300 chars → 100 tokens
  const textTokens = estimateBlockTokens({ type: "text", text: "a".repeat(300) });
  assert.equal(textTokens, 100, "300 chars / 3 = 100 tokens");

  // tool_use 块
  const toolTokens = estimateBlockTokens({
    type: "tool_use",
    id: "t1",
    name: "read_file",
    input: { path: "/very/long/path/to/some/file.ts" },
  });
  assert.ok(toolTokens > 10, "tool_use should have meaningful token count");

  // tool_result 块
  const resultTokens = estimateBlockTokens({
    type: "tool_result",
    toolCallId: "t1",
    content: "x".repeat(900),
  });
  assert.equal(resultTokens, 305, "900 chars / 3 + 5 = 305");
}

async function testEstimateMessageTokens() {
  const msg = makeTextMessage("user", "a".repeat(300));
  const tokens = estimateMessageTokens(msg);
  // 100 (text) + 4 (message overhead) = 104
  assert.equal(tokens, 104);
}

async function testNoTrimNeeded() {
  const messages: LLMMessage[] = [
    makeTextMessage("user", "hello"),
    makeTextMessage("assistant", "world"),
  ];

  const config: ContextWindowConfig = {
    contextWindowTokens: 200_000,
    maxOutputTokens: 8_192,
  };

  const result = trimMessagesToFitBudget(messages, "system prompt", config);
  // 消息很短，不需要裁剪，应该返回原数组引用
  assert.equal(result, messages, "should return original array when within budget");
}

async function testTrimLongHistory() {
  // 构造一个超出预算的长消息列表
  // 设置一个很小的窗口来触发裁剪
  const config: ContextWindowConfig = {
    contextWindowTokens: 500,
    maxOutputTokens: 100,
  };
  // input budget = 400 tokens
  // system prompt ≈ 10 tokens

  const messages: LLMMessage[] = [
    makeTextMessage("user", "First message: " + "x".repeat(90)), // ~35 tokens
    makeTextMessage("assistant", "Response 1: " + "y".repeat(300)), // ~104 tokens
    makeTextMessage("user", "Question 2: " + "z".repeat(300)), // ~104 tokens
    makeTextMessage("assistant", "Response 2: " + "y".repeat(300)), // ~104 tokens
    makeTextMessage("user", "Question 3: " + "z".repeat(300)), // ~104 tokens
    makeTextMessage("assistant", "Final answer: " + "w".repeat(60)), // ~25 tokens
  ];
  // Total ≈ 476 tokens, exceeds budget of ~390

  const result = trimMessagesToFitBudget(messages, "Be helpful.", config);

  // 应该裁剪掉中间的消息
  assert.ok(result.length < messages.length, "should have fewer messages after trimming");
  // 第一条应该是原始用户消息
  assert.equal(result[0], messages[0], "first message should be preserved");
  // 第二条应该是摘要占位符
  assert.ok(
    result[1].content[0].type === "text" &&
      result[1].content[0].text.includes("condensed"),
    "second message should be summary placeholder",
  );
  // 最后一条应该是原始最后一条消息
  assert.equal(
    result[result.length - 1],
    messages[messages.length - 1],
    "last message should be preserved",
  );
}

async function testTrimPreservesRecentMessages() {
  // 验证尾部消息尽可能多地被保留
  const config: ContextWindowConfig = {
    contextWindowTokens: 1000,
    maxOutputTokens: 100,
  };
  // input budget = 900 tokens

  const messages: LLMMessage[] = [];
  // 首条
  messages.push(makeTextMessage("user", "Initial request: " + "a".repeat(30))); // ~15 tokens
  // 10 条中间历史（每条 ~104 tokens = 1040 tokens total，超过预算）
  for (let i = 0; i < 10; i++) {
    messages.push(
      makeTextMessage(
        i % 2 === 0 ? "assistant" : "user",
        `Message ${i}: ` + "x".repeat(300),
      ),
    );
  }
  // 最近两条
  messages.push(makeTextMessage("user", "Latest question: " + "q".repeat(30))); // ~15 tokens
  messages.push(makeTextMessage("assistant", "Latest answer: " + "a".repeat(30))); // ~15 tokens

  const result = trimMessagesToFitBudget(messages, "system", config);

  // 最近的两条消息应该被保留
  assert.equal(
    result[result.length - 1],
    messages[messages.length - 1],
    "very last message preserved",
  );
  assert.equal(
    result[result.length - 2],
    messages[messages.length - 2],
    "second to last message preserved",
  );
}

async function main() {
  const tests: Array<[string, () => Promise<void>]> = [
    ["estimateBlockTokens", testEstimateBlockTokens],
    ["estimateMessageTokens", testEstimateMessageTokens],
    ["no trim needed", testNoTrimNeeded],
    ["trim long history", testTrimLongHistory],
    ["trim preserves recent", testTrimPreservesRecentMessages],
  ];

  for (const [name, test] of tests) {
    await test();
    console.log(`PASS ${name}`);
  }

  console.log(`\nAll ${tests.length} token budget scenarios passed.`);
}

main().catch((error) => {
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
});
