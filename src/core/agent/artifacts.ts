import { validate } from "@cfworker/json-schema";

import type { ArtifactContract, StructuredArtifactResult } from "@/core/contracts";
import type { ArtifactPartPayload, JSONValue } from "@/lib/artifact-types";
import type { LLMContentBlock, LLMMessage } from "@/core/provider/base";

export function validateArtifactData(
  contract: ArtifactContract,
  data: JSONValue,
) {
  const result = validate(data, contract.schema);
  if (result.valid) {
    return;
  }

  const [firstError] = result.errors;
  throw new Error(
    firstError
      ? `Structured artifact for contract "${contract.id}" failed schema validation: ${firstError.error}`
      : `Structured artifact for contract "${contract.id}" failed schema validation`,
  );
}

export function buildArtifactPayload(
  contract: ArtifactContract,
  result: StructuredArtifactResult,
  producer: ArtifactPartPayload["producer"],
): ArtifactPartPayload {
  validateArtifactData(contract, result.data);

  return {
    artifactType: contract.artifactType,
    contractId: contract.id,
    producer,
    data: result.data,
    summaryText: result.summaryText ?? null,
  };
}

export function artifactPayloadToContentBlock(
  payload: ArtifactPartPayload,
): Extract<LLMContentBlock, { type: "artifact" }> {
  return {
    type: "artifact",
    artifactType: payload.artifactType,
    contractId: payload.contractId ?? null,
    producer: payload.producer,
    data: payload.data,
    summaryText: payload.summaryText ?? null,
  };
}

export function hasArtifactForContract(
  messages: LLMMessage[],
  contractId: string,
) {
  return messages.some((message) =>
    message.content.some(
      (block) => block.type === "artifact" && block.contractId === contractId,
    ),
  );
}

export function buildStructuredOutputSummary(payload: ArtifactPartPayload) {
  const summary = payload.summaryText?.trim();
  if (summary) {
    return `Generated structured artifact "${payload.contractId ?? payload.artifactType}": ${summary}`;
  }

  return `Generated structured artifact "${payload.contractId ?? payload.artifactType}".`;
}
