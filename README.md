# qa-ai-repo

Reusable **QA skills, agents, and MCP servers**, organized by objective and
installable into any AI coding tool with one command.

Each objective packages one QA job, such as Playwright E2E, accessibility, contract
testing, performance, or LLM evals. It holds a skill (the rules, guardrails, and
reference code), an agent (a role and process that follows the skill), and any MCP
servers the job needs. The CLI writes them into Claude Code, Cursor, Windsurf, or a
generic `AGENTS.md`, converting formats where needed. Your assistant then writes
tests that follow current industry practice instead of whatever it remembers.

## Quickstart (30 seconds)

```bash
npx qa-ai-repo list                          # see the objectives
npx qa-ai-repo add playwright-e2e            # install into detected tools
```

Then, in Claude Code from the same project:

```
> Use the qa-e2e-author agent to cover the checkout flow
> /playwright-e2e review tests/e2e/login.spec.ts for flaky patterns
```

## Objectives

| Objective | What it's for | Agent | Skill | MCP servers | Example prompt |
|-----------|---------------|-------|-------|-------------|----------------|
| `accessibility-testing` | Accessibility Testing | `a11y-auditor` | [`accessibility-testing`](accessibility-testing/skills/accessibility-testing/SKILL.md) | `playwright` | "Use the a11y-auditor agent to audit /signup against WCAG 2.2 AA" |
| `api-contract-testing` | API Contract Testing | `api-contract-author` | [`api-contract-testing`](api-contract-testing/skills/api-contract-testing/SKILL.md) | — | "Use the api-contract-author agent to add Pact tests between web and orders-api" |
| `flaky-test-triage` | Flaky Test Triage | `flaky-test-hunter` | [`flaky-test-triage`](flaky-test-triage/skills/flaky-test-triage/SKILL.md) | — | "Use the flaky-test-hunter agent to find why cart.spec.ts fails intermittently in CI" |
| `jest-coverage-mutation` | Jest Coverage & Mutation Testing | `test-effectiveness-auditor` | [`jest-coverage-mutation`](jest-coverage-mutation/skills/jest-coverage-mutation/SKILL.md) | — | "Use the test-effectiveness-auditor agent to run Stryker on src/pricing and fix surviving mutants" |
| `llm-eval` | LLM Evaluation (DeepEval) | `llm-eval-author` | [`llm-eval`](llm-eval/skills/llm-eval/SKILL.md) | — | "Use the llm-eval-author agent to build a golden-set eval for our RAG answer endpoint" |
| `performance-testing` | Performance Testing | `perf-test-engineer` | [`performance-testing`](performance-testing/skills/performance-testing/SKILL.md) | — | "Use the perf-test-engineer agent to write a k6 load test gated on our p95 SLO for /search" |
| `playwright-bdd` | Playwright → BDD Converter | `playwright-bdd-migrator` | [`playwright-bdd`](playwright-bdd/skills/playwright-bdd/SKILL.md) | — | "Use the playwright-bdd-migrator agent to convert tests/e2e/checkout to Gherkin features" |
| `playwright-e2e` | Playwright E2E Testing | `qa-e2e-author` | [`playwright-e2e`](playwright-e2e/skills/playwright-e2e/SKILL.md) | `playwright-test`, `playwright` | "Use the qa-e2e-author agent to cover the checkout flow" |
| `qa-strategy` | QA Strategy | `qa-strategist` | [`qa-strategy`](qa-strategy/skills/qa-strategy/SKILL.md) | — | "Use the qa-strategist agent to draft a QA strategy for this repo" |
| `test-pyramid` | Full-Stack Test Pyramid Strategy | `test-architect` | [`test-pyramid`](test-pyramid/skills/test-pyramid/SKILL.md) | — | "Use the test-architect agent to plan unit/integration/contract/E2E coverage for the orders service" |
| `ui-test-auditor` | UI Test Overuse Auditor | `ui-test-auditor` | [`ui-test-auditor`](ui-test-auditor/skills/ui-test-auditor/SKILL.md) | — | "Use the ui-test-auditor agent to find E2E tests that should be API tests" |
| `visual-regression` | Visual Regression Testing | `visual-regression-engineer` | [`visual-regression`](visual-regression/skills/visual-regression/SKILL.md) | — | "Use the visual-regression-engineer agent to add screenshot tests for the pricing page" |

Run `npx qa-ai-repo list` for each objective's full description.

**qa-strategy intake.** The `qa-strategist` first pre-fills what it can from the
codebase. It then asks only the questions that would change the strategy, each as
multiple choice with 2–4 options and an "Other" option. It records every choice and
what that choice implies in the strategy doc.

## Prerequisites

- **Node ≥ 18** for the CLI. Installs write plain files; the CLI adds no runtime
  dependencies to your project.
- Per objective, in the project under test:
  - **playwright-e2e, visual-regression, accessibility-testing:** `@playwright/test`
    and browsers (`npx playwright install`). playwright-e2e needs Playwright ≥ 1.56
    for the built-in test agents. visual-regression generates baselines in the
    Playwright Docker image. accessibility-testing uses `@axe-core/playwright`.
  - **playwright-bdd:** `playwright-bdd` v9 (Node ≥ 20, Playwright ≥ 1.53).
  - **jest-coverage-mutation:** Jest and StrykerJS (`@stryker-mutator/core`,
    `@stryker-mutator/jest-runner`). StrykerJS 10 needs Node ≥ 22.
  - **performance-testing:** [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/).
    Gatling, JMeter, and Lighthouse CI are optional.
  - **api-contract-testing:** `@pact-foundation/pact` and a Pact Broker or PactFlow
    instance. Schemathesis (Python) and oasdiff are needed for spec checks.
  - **llm-eval:** Python with `deepeval` and an API key for the judge model.
  - **qa-strategy, test-pyramid, ui-test-auditor, flaky-test-triage:** no extra tools.

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

MCP servers are **merged** into existing config files, so you can run `add`
repeatedly and across several objectives.

| Source        | Claude Code                     | Cursor                          | Windsurf                     | Generic          |
|---------------|---------------------------------|---------------------------------|------------------------------|------------------|
| `skills/*`    | `.claude/skills/<name>/`        | `.cursor/rules/<name>.mdc`      | `.windsurf/rules/<name>.md`  | `AGENTS.md`      |
| `agents/*.md` | `.claude/agents/<name>.md`      | `.cursor/rules/<name>.mdc`      | `.windsurf/rules/<name>.md`  | `AGENTS.md`      |
| `mcp/*.json`  | `.mcp.json` (merged)            | `.cursor/mcp.json` (merged)     | global `mcp_config.json`     | printed to add   |

## Install in Claude Code (CLI)

1. **Install from the project root:**

   ```bash
   npx qa-ai-repo add playwright-e2e --tool claude      # or --tool claude,cursor
   ```

   This writes the following files:

   ```
   .claude/skills/playwright-e2e/    # SKILL.md + reference.md (whole skill folder)
   .claude/agents/qa-e2e-author.md
   .mcp.json                         # "playwright-test" and "playwright" merged in
   ```

2. **Start (or restart) `claude`** in that directory and approve the project MCP
   servers when prompted. Until you approve them, `claude mcp list` shows them as
   `Pending approval`.
3. **Verify:**
   - `/agents` lists `qa-e2e-author`.
   - `/mcp` or `claude mcp list` shows the servers as connected.
   - `playwright-e2e` appears among the available skills.
4. **Use it:**
   - "Use the qa-e2e-author agent to cover the checkout flow"
   - `/playwright-e2e add a login test using storage-state auth`
5. **Objective-specific extras:** playwright-e2e needs `npx playwright install`
   for browsers. For Playwright's built-in planner, generator, and healer agents,
   also run `npx playwright init-agents --loop=claude`, and re-run it after
   upgrading Playwright.
6. **Update or uninstall:** re-run `add` to update. To uninstall, delete the files
   listed in step 1 and remove the objective's entries from `mcpServers` in
   `.mcp.json`.

Installs are **project-scoped**. There is no global `~/.claude` install today.

## How agents, skills and MCP fit together

- **Rules live once, in the skill.** `SKILL.md` holds the guardrails, decision
  tables, and anti-patterns. Long code and config go in sibling files (such as
  `reference.md`), which travel with the skill.
- **Agents reference the skill; they don't copy it.** An agent's frontmatter
  carries `skills: <skill-name>`, so Claude Code preloads the skill. The agent body
  holds only the role, the process steps, and the report format.
- **No `tools:` allowlist when an agent uses MCP.** An explicit allowlist leaves out
  `mcp__*` tools and silently disables the server the objective installs. `npm test`
  enforces this.
- **Cursor and Windsurf** have no `skills:` preload. The installer therefore
  inlines the skill body into each agent rule and copies sibling files next to the
  rule (`.cursor/rules/<skill>/reference.md`), so links still resolve.

## Add a new objective

```bash
cp -r _template my-objective        # scaffold
# edit my-objective/objective.json and drop files into skills/ agents/ mcp/
# remove any of the three folders the objective doesn't use
npx qa-ai-repo add my-objective     # try it locally
```

## Contributing checklist

- [ ] Start from `_template/`. Give `objective.json` a `title` and a `description`.
- [ ] Skill frontmatter: `name` matches the folder name. `description` says
      **what** the skill does **and when** to use it.
- [ ] Keep `SKILL.md` focused. Long code goes in sibling files, referenced as
      `` `reference.md` ``, and every referenced file must exist.
- [ ] Agent frontmatter: `name`, `description`, `skills: <skill>`. Use no `tools:`
      allowlist if the agent relies on MCP. Don't duplicate the skill's rules in the
      agent body.
- [ ] Verify commands and APIs against current upstream docs, not memory.
- [ ] `npm test` passes.
- [ ] `node bin/qa-ai.js add <objective> --tool all --dry-run` succeeds.

## Testing this repo

```bash
npm test                                            # node --test: install adapters, dead links, MCP/tools rule
node bin/qa-ai.js add <objective> --tool all --dry-run
```

Maintainers can also run a local `qa-ai-repo-tester` Claude Code agent
(`.claude/agents/qa-ai-repo-tester.md`). It is gitignored and not shipped. It runs
full static, install, MCP, and behavioral checks.

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

The workflow publishes with npm **provenance** (verified build attestation).
`--provenance` and the `id-token: write` permission enable it. Provenance requires
a public repo.

**Manual.** `npm login` then `npm publish` from the repo root.

## License

[MIT](LICENSE)
