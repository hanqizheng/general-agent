import fs from "fs/promises";
import path from "path";
import fg from "fast-glob";
import matter from "gray-matter";

import { createLogger } from "@/lib/logger";

import { SkillMetadataSchema, type SkillEntry } from "./types";

const logger = createLogger("skill-loader");

/**
 * 扫描 skillRoot 目录下所有的 SKILL.md 解析 frontmatter metadata
 * 提取 name + description，不读取 body（渐进式加载）。
 */
export async function loadSkills(skillsRoot: string): Promise<SkillEntry[]> {
  // 目录不存在则返回空

  try {
    await fs.access(skillsRoot);
  } catch {
    logger.debug("Skills directory not found, skipping", { skillsRoot });
    return [];
  }

  const files = await fg("**/SKILL.md", {
    cwd: skillsRoot,
    absolute: true,
    onlyFiles: true,
  });

  if (files.length === 0) {
    logger.debug("No SKILL.md files found");
    return [];
  }

  const skills: SkillEntry[] = [];

  for (const filePath of files) {
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      // 只取 frontmatter
      const { data } = matter(raw);

      const result = SkillMetadataSchema.safeParse(data);

      if (!result.success) {
        logger.warn(`Invalid SKILL.md: ${filePath}`, {
          errors: result.error.issues,
        });
        continue;
      }

      skills.push({
        metadata: result.data,
        filePath,
        dirPath: path.dirname(filePath),
      });

      logger.debug(`Loaded skill: ${result.data.name}`);
    } catch (error) {
      logger.warn(`Failed to parse SKILL.md: ${filePath}`, {
        error: (error as Error).message,
      });
    }
  }

  return skills;
}
