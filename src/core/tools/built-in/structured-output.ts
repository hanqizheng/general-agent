import { z } from "zod";
import { validate } from "@cfworker/json-schema";

import type { ArtifactContractRegistry } from "@/core/contracts";
import type { ToolDefinition } from "../types";
import type { JSONValue } from "@/lib/artifact-types";

/**
 * structured_output 工具的参数 schema。
 *
 * LLM 调用这个工具时需要提供：
 * - contract_id: 选择哪个 artifact contract（从已注册的 contracts 中选）
 * - data: 符合该 contract JSON Schema 的结构化数据
 * - summaryText: 可选的人类可读摘要
 *
 * 和之前的设计不同，LLM 不再只是"请求生成"，而是直接在 data 字段里
 * 给出结构化数据。工具负责验证数据是否符合 schema。如果不符合，
 * 返回 isError=true + 验证错误信息，LLM 在下一个 turn 可以看到错误并修正。
 */
export const structuredOutputParams = z.object({
  contract_id: z
    .string()
    .min(1)
    .describe("Artifact contract id, for example repo-risk-report@v1"),
  data: z
    .record(z.string(), z.unknown())
    .describe(
      "The structured data object conforming to the chosen contract's JSON Schema",
    ),
  summaryText: z
    .string()
    .optional()
    .describe(
      "Optional concise human-readable summary of the artifact for chat context",
    ),
});

export const structuredOutputToolName = "structured_output";

/**
 * 根据已注册的 contracts 动态构建工具描述。
 * 把每个 contract 的 id、description、schema 都列在描述里，
 * 让 LLM 知道 data 字段该填什么结构。
 */
function buildDescription(contractRegistry: ArtifactContractRegistry): string {
  const contracts = contractRegistry.list();

  if (contracts.length === 0) {
    return "Generate a validated JSON artifact for a registered contract. No contracts are currently registered.";
  }

  const contractDocs = contracts
    .map((c) => {
      const desc = c.description ? ` — ${c.description}` : "";
      return `- "${c.id}"${desc}\n  Schema: ${JSON.stringify(c.schema)}`;
    })
    .join("\n");

  return [
    "Generate a validated JSON artifact. Put the structured data directly in the `data` field.",
    "Use this after collecting enough context with tools such as bash or read.",
    "",
    "Available contracts:",
    contractDocs,
  ].join("\n");
}

/**
 * 创建 structured_output 工具。
 *
 * 需要 contractRegistry 来：
 * 1. 构建包含所有可用 contract schema 的工具描述
 * 2. 在 execute 时查找 contract 并验证 data
 */
export function createStructuredOutputTool(
  contractRegistry: ArtifactContractRegistry,
): ToolDefinition<z.infer<typeof structuredOutputParams>> {
  return {
    name: structuredOutputToolName,
    description: buildDescription(contractRegistry),
    riskLevel: "low",
    parameters: structuredOutputParams,

    async execute(input) {
      // 1. 查找 contract
      if (!contractRegistry.has(input.contract_id)) {
        return {
          output: `Unknown contract "${input.contract_id}". Available contracts: ${contractRegistry
            .list()
            .map((c) => `"${c.id}"`)
            .join(", ")}`,
          isError: true,
        };
      }

      const contract = contractRegistry.get(input.contract_id);

      // 2. 用 JSON Schema 验证 data
      const result = validate(input.data as JSONValue, contract.schema);

      if (!result.valid) {
        const errorDetails = result.errors
          .slice(0, 5)
          .map(
            (e) =>
              `  - ${e.instanceLocation}: ${e.error}`,
          )
          .join("\n");

        return {
          output: [
            `Validation failed for contract "${contract.id}".`,
            "Errors:",
            errorDetails,
            "",
            "Please fix the data and call this tool again.",
          ].join("\n"),
          isError: true,
        };
      }

      // 3. 验证通过，返回结果 + artifact
      return {
        output: `Structured artifact "${contract.id}" produced successfully.`,
        isError: false,
        artifacts: [
          {
            artifactType: contract.artifactType,
            contractId: contract.id,
            data: input.data as JSONValue,
            summaryText: input.summaryText ?? null,
          },
        ],
      };
    },
  };
}

// 向后兼容：导出 tool name 和 params 供外部引用
export { structuredOutputToolName as name };
