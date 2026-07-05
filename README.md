# qa-ai-repo

Reusable **QA skills, agents, and MCP servers**, organized by objective and
installable into any AI coding tool with one command.

```bash
npx qa-ai-repo list
npx qa-ai-repo add playwright-e2e
```

## What it does

Each QA **objective** is a top-level folder containing only the pieces it needs:

```
playwright-e2e/
├── objective.json      # title + description (optional)
├── skills/             # Claude-style SKILL.md skills
├── agents/             # Claude-style subagent definitions
└── mcp/                # MCP server definitions (one JSON per server)
```

The CLI reads an objective and writes each piece into the right place for
whichever AI tool you target — converting formats where needed:

| Source        | Claude Code                     | Cursor                          | Windsurf                     | Generic          |
|---------------|---------------------------------|---------------------------------|------------------------------|------------------|
| `skills/*`    | `.claude/skills/<name>/`        | `.cursor/rules/<name>.mdc`      | `.windsurf/rules/<name>.md`  | `AGENTS.md`      |
| `agents/*.md` | `.claude/agents/<name>.md`      | `.cursor/rules/<name>.mdc`      | `.windsurf/rules/<name>.md`  | `AGENTS.md`      |
| `mcp/*.json`  | `.mcp.json` (merged)            | `.cursor/mcp.json` (merged)     | global `mcp_config.json`     | printed to add   |

## Usage

```bash
npx qa-ai-repo list                              # list objectives
npx qa-ai-repo add <objective>                   # install into detected tools
npx qa-ai-repo add <objective> --tool cursor     # target specific tool(s)
npx qa-ai-repo add <objective> --tool all        # every supported tool
npx qa-ai-repo add <objective> --dry-run         # preview, write nothing
npx qa-ai-repo detect                            # show detected tools
```

`--tool` accepts a comma list of `claude`, `cursor`, `windsurf`, `agents`, or
`all`. With no `--tool`, the CLI auto-detects tools in the current project
(`.claude` / `.cursor` / `.windsurf`) and falls back to `claude,cursor`.

MCP servers are **merged** into existing config files, so `add` is safe to run
repeatedly and across multiple objectives.

## Add a new objective

```bash
cp -r _template my-objective        # scaffold
# edit my-objective/objective.json and drop files into skills/ agents/ mcp/
# remove any of the three folders the objective doesn't use
npx qa-ai-repo add my-objective     # try it locally
```

## Local development

```bash
node bin/qa-ai.js list              # run without publishing
npm link                            # then `qa-ai list` works anywhere
```

## Publishing

Objective folders ship automatically (see `.npmignore`); no need to enumerate
them.

**Automated (recommended).** A GitHub Actions workflow
(`.github/workflows/release.yml`) publishes to npm whenever you cut a Release:

1. Add a repo secret `NPM_TOKEN` (an npm *Automation* access token):
   Settings → Secrets and variables → Actions → New repository secret.
2. Bump `version` in `package.json` and commit.
3. Create a GitHub Release (tag e.g. `v0.1.0`). The workflow smoke-tests the
   CLI and publishes; it skips automatically if that version is already on npm.

The workflow publishes with npm **provenance** (verified build attestation),
enabled by `--provenance` + the `id-token: write` permission. This requires a
public repo.

**Manual.** `npm login` then `npm publish` from the repo root.
