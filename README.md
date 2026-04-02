# General Agent

A from-scratch AI agent engine built with TypeScript and Next.js. Implements the core agentic loop pattern — LLM reasoning, tool calling, result feedback, repeat — with real-time SSE streaming and a full-featured chat UI.

Designed as a **generic foundation** for building vertical AI agents. This project provides the agent runtime, tool system, provider abstraction, skill system, and event streaming infrastructure. Domain-specific capabilities are added by downstream projects.

## Architecture

```
User Message → Agent Loop → LLM Call → Tool Execution → Result Feedback → LLM Call → ...
                                                                                    ↓
                              ← ← ← ← SSE Event Stream ← ← ← ← ← ← ← ← ← ← ← ←
```

The engine is organized into several layers:

- **Agent Loop** — Multi-turn autonomous execution. Each turn: call the LLM, execute any tool calls, feed results back. Repeats until the LLM has nothing more to do. Supports interruption/abort at any point.
- **Provider Layer** — Unified `LLMProvider` interface. Currently supports **Anthropic (Claude)** and **Moonshot (Kimi)**, with auto-selection based on configured API keys.
- **Tool System** — Pluggable tools with Zod schema validation. Built-in: `read`, `write`, `edit`, `bash`, `grep`, `glob`, `web_search`, `structured_output`. Easy to extend with custom tools.
- **Skills System** — Convention-based modular capabilities. Skills are markdown files with YAML frontmatter, discovered at startup and lazily loaded by the LLM at runtime. Skills can also be explicitly selected by the user per-message from the chat UI.
- **Event System** — Structured lifecycle events (session, loop, turn, message, tool, reasoning, artifact, heartbeat) enabling real-time observability.
- **SSE Streaming** — Batched Server-Sent Events delivering token-level streaming to the client.
- **Session Management** — Full conversation persistence in PostgreSQL with stale-run recovery on startup.
- **Authentication** — NextAuth v5 with credential login (bcrypt) and optional Google OAuth.

## Quick Start

```bash
git clone git@github.com:hanqizheng/general-agent.git
cd general-agent
npm install
docker compose up -d        # PostgreSQL 17.9
npm run db:migrate          # Apply database migrations
cp .env.local.example .env.local
# Edit .env.local — add at least one LLM provider API key
npm run dev
```

If you previously ran the local PostgreSQL 16 container, recreate the `postgres_data`
volume before first startup on PostgreSQL 17.9. PostgreSQL data directories are not
compatible across major versions.

Open `http://localhost:3891` in your browser to access the chat UI.

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_AUTH_TOKEN` | One of Anthropic / Moonshot required | Anthropic API token |
| `ANTHROPIC_BASE_URL` | No | Custom Anthropic base URL |
| `MOONSHOT_API_KEY` | One of Anthropic / Moonshot required | Moonshot API key |
| `GEMINI_API_KEY` | No | Enables the `web_search` tool (via Gemini API) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `AUTH_SECRET` | Recommended | NextAuth secret (required in production) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | No | Google OAuth credentials |

## LLM Providers

The provider layer auto-selects based on which API keys are set (Anthropic checked first, then Moonshot).

| Provider | Model | Features |
|---|---|---|
| **Anthropic** | `claude-opus-4-6-v1` | Extended thinking / reasoning tokens, document citations |
| **Moonshot** | `kimi-k2-0711-preview` | OpenAI-compatible API |

Custom providers can be added by implementing the `LLMProvider` interface.

## Built-in Tools

| Tool | Description |
|---|---|
| `read` | Read files from disk |
| `write` | Create or overwrite files |
| `edit` | In-place string replacements |
| `bash` | Execute shell commands |
| `grep` | Search file contents |
| `glob` | Find files by pattern |
| `web_search` | Web search via Gemini API (requires `GEMINI_API_KEY`) |
| `structured_output` | Generate validated JSON matching a registered contract |

## Skills

Skills are modular capability packages that extend the agent's behavior without code changes. Each skill is a directory under `src/skills/` containing a `SKILL.md` file.

### How it works

1. **Discovery** — At startup, the loader scans `src/skills/**/SKILL.md`, parses YAML frontmatter, and builds a catalog.
2. **Injection** — The catalog (name, description, file path) is serialized to XML and appended to the system prompt.
3. **Execution** — When the user's request matches a skill (or the user explicitly selects one in the UI), the LLM reads the full `SKILL.md` via the `read` tool and follows its instructions using the normal tool loop.

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

## Outbound Web Access

Web-capable tools such as `web_search` use a shared outbound HTTP layer instead of embedding proxy logic in each tool.

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
- **Custom skills** — Add a directory under `src/skills/` with a `SKILL.md` file

## Project Structure

```
src/
  app/                  # Next.js App Router pages & API routes
    (auth)/             # Login / register pages
    api/                # REST API (sessions, messages, events, skills, auth)
    chat/               # Chat UI pages
  components/           # React components
    auth/               # Login / register forms
    chat/               # Message list, input area, tool/reasoning/markdown renderers
    layout/             # Shell, header, sidebar
    providers/          # React context providers
  core/                 # Agent engine (server-side)
    agent/              # Agent loop, turn execution, context building
    attachments/        # File attachment service & storage
    contracts/          # Structured output contracts
    events/             # Event bus, emitter, type definitions
    network/            # Outbound HTTP layer (proxy support)
    prompt/             # System prompt builder & templates
    provider/           # LLM provider abstraction & implementations
    session/            # Session runner, DB projector, live registry
    skills/             # Skill loader & injector
    sse/                # SSE batcher & encoder
    tools/              # Tool system: registry, types, built-in tools
  db/                   # Database layer (Drizzle schema & repositories)
  hooks/                # React hooks (chat state, SSE events, attachments, skills)
  lib/                  # Shared utilities (config, auth, errors, logger, types)
  skills/               # Built-in skill definitions (SKILL.md files)
scripts/                # Test & utility scripts
drizzle/                # Generated database migrations
```

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 |
| UI | React 19, Tailwind CSS 4, Lucide icons |
| LLM | LangChain (Anthropic + OpenAI adapters) |
| Database | PostgreSQL 17.9 + Drizzle ORM |
| Auth | NextAuth v5 (credentials + Google OAuth) |
| Validation | Zod v4 |
| Streaming | Web Streams API + SSE |

## License

MIT
