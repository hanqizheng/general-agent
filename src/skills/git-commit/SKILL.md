---
name: git-commit
description: Create well-formatted git commits following conventional commit standards. Use when the user asks to commit changes, create a commit, or mentions git commit.
---

When asked to create a git commit, follow these steps:

1. Run `git status` to see the current working tree state
2. Run `git diff --staged` to review staged changes; if nothing staged, run `git diff` for unstaged changes
3. Analyze the changes and determine the type: feat, fix, refactor, docs, test, chore
4. Draft a commit message in conventional commit format:
  - Title: `<type>(<scope>): <short description>` (max 72 chars)
  - Body: explain *why* the change was made
5. Stage relevant files with `git add <files>` (prefer explicit file names over `git add .`)
6. Create the commit with `git commit -m "<message>"`
7. Show the result with `git log --oneline -1`

Do NOT push to remote unless the user explicitly asks.