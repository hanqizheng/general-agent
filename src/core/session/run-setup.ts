import path from "path";
import { createHash } from "crypto";

import type { LLMProvider } from "@/core/provider/base";
import { getDefaultProviderConfig } from "@/core/provider/default";
import { buildSystemPrompt } from "@/core/prompt/system";
import { buildSkillsXml, loadSkills } from "@/core/skills";
import { createDefaultToolRegistry } from "@/core/tools/default-registry";
import type { ToolRegistry } from "@/core/tools/registry";

export interface SessionRunSetup {
  provider: LLMProvider;
  providerName: string;
  model: string;
  systemPrompt: string;
  systemPromptHash: string;
  toolRegistry: ToolRegistry;
}

function hashPrompt(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export async function prepareSessionRunSetup(
  workspaceRoot: string,
): Promise<SessionRunSetup> {
  const { provider, model } = getDefaultProviderConfig();
  const toolRegistry = createDefaultToolRegistry();
  const skillsRoot = path.resolve(process.cwd(), "src/skills");
  const skills = await loadSkills(skillsRoot);
  const skillsXml = buildSkillsXml(skills);
  const systemPrompt = await buildSystemPrompt({
    skillsXml,
    workspaceRoot,
  });

  return {
    provider,
    providerName: provider.name,
    model,
    systemPrompt,
    systemPromptHash: hashPrompt(systemPrompt),
    toolRegistry,
  };
}
