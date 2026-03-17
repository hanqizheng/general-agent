import type { SkillEntry } from "./types";

function escapeXml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 将 skill 列表格式化为 XML，注入 system prompt。
 * 只包含 metadata + 文件路径，不包含 instructions body。
 * 无 skill 时返回空字符串。
 */
export function buildSkillsXml(skills: SkillEntry[]) {
  if (skills.length === 0) {
    return "";
  }

  const entries = skills.map((skill) => {
    const attrs = `name="${escapeXml(skill.metadata.name)}"`;

    return [
      `<skill ${attrs} path="${escapeXml(skill.filePath)}">`,
      `   ${escapeXml(skill.metadata.description)}`,
      `</skill>`,
    ].join("\n");
  });

  return [
    "The following specialized skills are available. They supplement — but do not replace — your general knowledge and tools.",
    `<available-skills>\n${entries.join("\n")}\n</available-skills>`,
  ].join("\n");
}
