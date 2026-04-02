import { getDefaultContractsRoot, loadArtifactContracts } from "@/core/contracts";
import path from "path";
import { createHash } from "crypto";

import type { LLMProvider } from "@/core/provider/base";
import { getDefaultProviderConfig } from "@/core/provider/default";
import { buildSystemPrompt } from "@/core/prompt/system";
import { buildCommandsXml, loadCommands } from "@/core/skills";
import { createDefaultToolRegistry } from "@/core/tools/default-registry";
import type { ToolRegistry } from "@/core/tools/registry";
import type { ArtifactContractRegistry } from "@/core/contracts";
import type { PromptCommandDefinition } from "@/core/skills";

export interface SessionRunSetup {
  provider: LLMProvider;
  providerName: string;
  model: string;
  systemPrompt: string;
  systemPromptHash: string;
  toolRegistry: ToolRegistry;
  contractRegistry: ArtifactContractRegistry;
  commands: PromptCommandDefinition[];
}

function hashPrompt(input: string) {
  return createHash("sha256").update(input).digest("hex");
}
export async function prepareSessionRunSetup(
  workspaceRoot: string,
): Promise<SessionRunSetup> {
  const { provider, model } = getDefaultProviderConfig();
  const skillsRoot = path.resolve(process.cwd(), "src/skills");
  const contractRegistry = await loadArtifactContracts(getDefaultContractsRoot());
  const commands = await loadCommands(skillsRoot);
  const toolRegistry = createDefaultToolRegistry({ commands, contractRegistry });
  const commandsXml = buildCommandsXml(
    commands.filter((command) => command.modelInvocable),
  );
  const systemPrompt = await buildSystemPrompt({
    commandsXml,
    workspaceRoot,
  });

  return {
    provider,
    providerName: provider.name,
    model,
    systemPrompt,
    systemPromptHash: hashPrompt(systemPrompt),
    toolRegistry,
    contractRegistry,
    commands,
  };
}
