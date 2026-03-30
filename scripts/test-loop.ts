import assert from "node:assert/strict";

import { ArtifactContractRegistry } from "../src/core/contracts";
import { runAgentLoop } from "../src/core/agent/loop";
import { EventBus } from "../src/core/events/bus";
import { EventEmitter } from "../src/core/events/emitter";
import type { AgentEvent } from "../src/core/events/types";
import { LOOP_END_REASON } from "../src/core/events/constants";
import { MESSAGE_PART_KIND, MESSAGE_ROLE } from "../src/lib/constants";
import type { LLMProvider, LLMStreamChunk } from "../src/core/provider/base";

function createMockProvider(chunks: LLMStreamChunk[]): LLMProvider {
  return {
    name: "mock",
    async stream() {
      async function* gen() {
        for (const chunk of chunks) {
          yield chunk;
        }
      }

      return gen();
    },
    async generateStructured() {
      return {
        data: {
          summary: "The repository has one high-priority risk.",
        },
        summaryText: "One high-priority risk identified.",
      };
    },
  };
}

async function main() {
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

  bus.on((event) => {
    events.push(event);
  });

  try {
    const result = await runAgentLoop({
      emitter,
      history: [],
      userMessage: "Summarize the repository risks.",
      provider: createMockProvider([
        { type: "text_delta", text: "Risk summary is ready." },
      ]),
      systemPrompt: "You are a helpful assistant.",
      maxTurns: 2,
      contractRegistry,
      targetArtifactContractId: "repo-risk-report@v1",
    });

    assert.equal(result.endReason, LOOP_END_REASON.COMPLETE);
    assert.equal(result.turnCount, 1);
    assert.deepEqual(result.messages, [
      {
        role: MESSAGE_ROLE.USER,
        content: [{ type: "text", text: "Summarize the repository risks." }],
      },
      {
        role: MESSAGE_ROLE.ASSISTANT,
        content: [{ type: "text", text: "Risk summary is ready." }],
      },
      {
        role: MESSAGE_ROLE.ASSISTANT,
        content: [
          {
            type: "artifact",
            artifactType: "repo_risk_report",
            contractId: "repo-risk-report@v1",
            producer: {
              kind: "assistant",
              name: "finalize_structured_output",
            },
            data: {
              summary: "The repository has one high-priority risk.",
            },
            summaryText: "One high-priority risk identified.",
          },
        ],
      },
    ]);

    const artifactEvent = events.find(
      (event) =>
        event.type === "message.artifact" &&
        event.artifact.contractId === "repo-risk-report@v1",
    );
    assert.ok(artifactEvent, "expected final structured artifact event");

    const artifactPartStart = events.find(
      (event) =>
        event.type === "message.part.start" &&
        event.kind === MESSAGE_PART_KIND.ARTIFACT,
    );
    assert.ok(artifactPartStart, "expected final artifact part start");

    console.log("PASS request-level structured artifact finalization");
  } finally {
    bus.dispose();
  }
}

main().catch((error) => {
  console.error("FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
});
