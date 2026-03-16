---
name: file-summary
description: Provide file and project statistics including file counts, line counts, and extension breakdown. Use when the user asks about project structure, codebase size, or file statistics.
---

When asked about project structure or file statistics, run the summary script:

```bash
npx tsx <this-skill-dir>/scripts/summarize.ts <target-path>
```

Replace <this-skill-dir> with the directory containing this SKILL.md file.
The script outputs JSON with file counts, total lines, and per-extension breakdown.

Present the results in a readable table format.
