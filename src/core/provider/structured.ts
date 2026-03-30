import { z } from "zod";

import type { ArtifactContract } from "@/core/contracts";
import type { StructuredArtifactResult } from "@/core/contracts";
import type { JSONValue } from "@/lib/artifact-types";

const structuredArtifactResultSchema = z.object({
  data: z.unknown(),
  summaryText: z.string().nullish(),
});

export function buildStructuredArtifactSchema(contract: ArtifactContract) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      data: contract.schema,
      summaryText: {
        anyOf: [{ type: "string" }, { type: "null" }],
        description:
          "Optional concise human-readable summary of the artifact for chat context.",
      },
    },
    required: ["data"],
  } satisfies Record<string, unknown>;
}

export function buildStructuredArtifactInstruction(
  contract: ArtifactContract,
  instruction?: string,
) {
  return [
    `Generate a structured artifact for contract "${contract.id}".`,
    `Artifact type: ${contract.artifactType}.`,
    contract.description ? `Description: ${contract.description}` : null,
    instruction ? `Additional instruction: ${instruction}` : null,
    "Return JSON matching the provided schema.",
    "Put the main structured data in `data`.",
    "Set `summaryText` to a short summary when it helps future turns. Otherwise use null.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function normalizeStructuredArtifactResult(
  value: unknown,
): StructuredArtifactResult {
  const parsed = structuredArtifactResultSchema.parse(value);
  return {
    data: parsed.data as JSONValue,
    summaryText: parsed.summaryText ?? null,
  };
}
