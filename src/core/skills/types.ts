import { z } from "zod";

// Zod schema 验证 SKILL.md 的 YAML frontmatter
export const SkillMetadataSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      "lowercase letters, numbers, hyphens only",
    ),
  description: z.string().min(1).max(1024),
});

export interface SkillMetadata {
  /** Skill 名称 */
  name: string;
  /** Skill 的描述 */
  description: string;
}

/**
 * 已加载的 Skill 条目，因为采用渐进式加载，所以 SkillEntry 中包含了 Skill 的元数据和文件路径等信息，而不直接包含工具定义等内容
 */
export interface SkillEntry {
  metadata: SkillMetadata;
  filePath: string;
  dirPath: string;
}
