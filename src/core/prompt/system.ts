import fs from "fs/promises";
import path from "path";

let cachedBase: string | null = null;

interface BuildSystemPromptOptions {
  skillsXml?: string;
  workspaceRoot?: string;
}

function injectWorkspaceContext(basePrompt: string, workspaceRoot?: string) {
  if (!workspaceRoot) {
    return basePrompt;
  }

  return basePrompt.replace("<workspace-root>", workspaceRoot);
}

/**
 * 构建完整 system prompt = base.md + workspace context + skills XML。
 * base.md 首次读取后缓存。
 */
export async function buildSystemPrompt(
  options: BuildSystemPromptOptions = {},
): Promise<string> {
  const { skillsXml, workspaceRoot } = options;

  if (!cachedBase) {
    const templatePath = path.resolve(
      process.cwd(),
      "src/core/prompt/templates/base.md",
    );
    cachedBase = await fs.readFile(templatePath, "utf-8");
  }

  const promptWithWorkspace = injectWorkspaceContext(cachedBase, workspaceRoot);

  if (!skillsXml) return promptWithWorkspace;

  return `${promptWithWorkspace}\n\n${skillsXml}`;
}
