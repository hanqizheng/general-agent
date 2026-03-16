import fs from "fs";
import path from "path";

const targetPath = process.argv[2] || ".";
const resolved = path.resolve(targetPath);

interface Stats {
  [ext: string]: { count: number; lines: number };
}

function walk(dir: string, stats: Stats): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".git", "dist", ".next"].includes(entry.name))
        continue;
      walk(full, stats);
    } else {
      const ext = path.extname(entry.name) || "(no ext)";
      if (!stats[ext]) stats[ext] = { count: 0, lines: 0 };
      stats[ext].count++;
      try {
        const content = fs.readFileSync(full, "utf-8");
        stats[ext].lines += content.split("\n").length;
      } catch {
        // binary or unreadable
      }
    }
  }
}

const stats: Stats = {};
walk(resolved, stats);

const totalFiles = Object.values(stats).reduce((sum, s) => sum + s.count, 0);
const totalLines = Object.values(stats).reduce((sum, s) => sum + s.lines, 0);

console.log(
  JSON.stringify(
    { path: targetPath, totalFiles, totalLines, breakdown: stats },
    null,
    2,
  ),
);
