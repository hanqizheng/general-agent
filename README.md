# General Agent

A from-scratch AI agent engine built with TypeScript and Next.js. Implements the core agentic loop pattern — LLM reasoning, tool calling, result feedback, repeat — with real-time SSE streaming.

Designed as a **generic foundation** for building vertical AI agents. This project provides the agent runtime, tool system, provider abstraction, and event streaming infrastructure. Domain-specific capabilities are added by downstream projects.

## Architecture

```
User Message → Agent Loop → LLM Call → Tool Execution → Result Feedback → LLM Call → ...
                                                                                    ↓
                              ← ← ← ← SSE Event Stream ← ← ← ← ← ← ← ← ← ← ← ←
```

The engine is organized into six layers:

- **Agent Loop** — Multi-turn autonomous execution. Each turn: call the LLM, execute any tool calls, feed results back. Repeats until the LLM has nothing more to do.
- **Provider Layer** — Unified `LLMProvider` interface. Swap between Anthropic (Claude), Moonshot (Kimi), or any LangChain-compatible model.
- **Tool System** — Pluggable tools with Zod schema validation. Built-in: file read/write/edit, bash, grep, glob. Easy to extend with custom tools.
- **Skills System** — Convention-based modular capabilities. Skills are markdown files with YAML frontmatter, discovered at startup and lazily loaded by the LLM at runtime via the `read` tool. No custom executor needed — the LLM self-directs using skill instructions.
- **Event System** — Structured lifecycle events (session, loop, turn, message, tool) enabling real-time observability.
- **SSE Streaming** — Batched Server-Sent Events delivering token-level streaming to the client.

## Quick Start

```bash
git clone git@github.com:hanqizheng/general-agent.git
cd general-agent
npm install
docker compose up -d        # MySQL
cp .env.local.example .env.local
# Edit .env.local — add at least one LLM provider API key
npm run dev
```

Test with curl:

```bash
curl -N -X POST http://localhost:3891/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "List files in the current directory"}'
```

## Outbound Web Access

Web-capable tools such as `web_search` now use a shared outbound HTTP layer instead of embedding proxy logic in each tool.

- Default behavior is `auto`: use direct egress unless a proxy is configured.
- You can force `direct` or `proxy` mode with `OUTBOUND_HTTP_MODE`.
- `OUTBOUND_PROXY_URL` overrides standard `HTTPS_PROXY` / `HTTP_PROXY`.
- `OUTBOUND_NO_PROXY` overrides standard `NO_PROXY`.
- `OUTBOUND_ALLOW_DIRECT_FALLBACK=true` lets `auto` mode retry direct when a proxy connection fails.

This keeps tool code deployment-agnostic: overseas servers can stay on direct egress, while constrained environments can opt into a proxy without changing tool implementations.

## Building Vertical Agents

Fork this repo on GitHub, then clone your fork:

```bash
git clone git@github.com:<you>/general-agent.git my-agent
cd my-agent

# Add upstream to sync future base updates
git remote add upstream git@github.com:hanqizheng/general-agent.git

# Sync base updates anytime:
git fetch upstream && git merge upstream/main
```

Extension points:
- **Custom tools** — Implement `ToolDefinition`, register in `ToolRegistry`
- **Custom providers** — Implement the `LLMProvider` interface
- **System prompt** — Customize `src/core/prompt/` for your domain
- **Custom skills** — Add a directory under `src/skills/` with a `SKILL.md` file (see below)

## Skills

Skills are modular capability packages that extend the agent's behavior without code changes. Each skill is a directory under `src/skills/` containing a `SKILL.md` file.

### How it works

1. **Discovery** — At startup, the loader scans `src/skills/**/SKILL.md`, parses YAML frontmatter, and builds a catalog.
2. **Injection** — The catalog (name, description, file path) is serialized to XML and appended to the system prompt.
3. **Execution** — When the user's request matches a skill, the LLM reads the full `SKILL.md` via the `read` tool and follows its instructions using the normal tool loop.

No custom executor or plugin API is needed — the LLM self-directs based on skill instructions.

### Creating a skill

Create a directory under `src/skills/` with a `SKILL.md`:

```markdown
---
name: my-skill
description: A brief description of what this skill does
---

## Instructions

Step-by-step instructions the LLM will follow...
```

Frontmatter fields:
- `name` — lowercase alphanumeric with hyphens, 1–64 chars (e.g. `git-commit`)
- `description` — free text, 1–1024 chars, helps the LLM decide when to activate the skill

Optionally include helper scripts or reference files alongside `SKILL.md`. The instruction body can direct the LLM to read or execute them.

### Built-in skills

| Skill | Description |
|-------|-------------|
| `file-summary` | Generate project file statistics (counts, lines, per-extension breakdown) |
| `web-research` | Improve time-sensitive web search workflows for latest news, weather, and relative-time queries |

## Tech Stack

Next.js 16 (App Router) / TypeScript / LangChain / Zod v4 / MySQL + Drizzle ORM / Web Streams API + SSE / nanoid

## License

MIT
