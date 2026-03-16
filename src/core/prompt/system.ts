import fs from "fs/promises";
import path from "path";

let cachedBase: string | null = null;

/**
 * 构建完整 system prompt = base.md + skills XML。
 * base.md 首次读取后缓存。
 */
export async function buildSystemPrompt(skillsXml?: string): Promise<string> {
  if (!cachedBase) {
    const templatePath = path.resolve(
      process.cwd(),
      "src/core/prompt/templates/base.md",
    );
    cachedBase = await fs.readFile(templatePath, "utf-8");
  }

  if (!skillsXml) return cachedBase;

  return `${cachedBase}\n\n${skillsXml}`;
}
