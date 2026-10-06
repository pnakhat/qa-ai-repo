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

**Claude Code** — this repo is a plugin marketplace; each objective is a plugin:

```
/plugin marketplace add pnakhat/qa-ai-repo
/plugin install playwright-e2e@qa-ai-repo
```

```
> Use the qa-e2e-author agent to cover the checkout flow
> /playwright-e2e review tests/e2e/login.spec.ts for flaky patterns
```

**Cursor, Windsurf, `AGENTS.md`** (or project-scoped Claude Code files):

```bash
npx qa-ai-repo list                          # see the objectives
npx qa-ai-repo add playwright-e2e            # install into detected tools
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

## Install in Claude Code (plugin, recommended)

Every objective is a Claude Code plugin with the same name, served from this
repo's marketplace (`.claude-plugin/marketplace.json`).

1. **Add the marketplace and install a plugin.** Inside Claude Code:

   ```
   /plugin marketplace add pnakhat/qa-ai-repo
   /plugin install playwright-e2e@qa-ai-repo
   ```

   Or from your shell (add `--scope project` to record it in the repo's
   `.claude/settings.json` so teammates get it too):

   ```bash
   claude plugin marketplace add pnakhat/qa-ai-repo
   claude plugin install playwright-e2e@qa-ai-repo
   ```

2. **Verify** (run `/reload-plugins` or restart `claude` first):
   - `claude plugin details playwright-e2e` prints the component inventory: the
     `qa-e2e-author` agent, the `playwright-e2e` skill, and the MCP servers.
   - `/plugin` → Installed lists `playwright-e2e`.
   - Ask Claude "which subagents are available?"; the answer includes
     `playwright-e2e:qa-e2e-author`. (The `/agents` wizard has been removed from
     Claude Code, so it no longer lists them.)
   - `/mcp` shows the plugin's servers (`playwright-test`, `playwright`) as connected.
   - `/playwright-e2e:playwright-e2e` (or just `/playwright-e2e`) runs the skill.
3. **Use it:** "Use the qa-e2e-author agent to cover the checkout flow". The
   objective-specific extras in the npx steps below (browsers, `init-agents`)
   apply here too.
4. **Update:** `claude plugin marketplace update qa-ai-repo` (or `/plugin` →
   Marketplaces → Update) pulls the catalog; plugins move to a new release when
   its `version` changes.
5. **Uninstall:** `/plugin` → Installed, or
   `claude plugin uninstall playwright-e2e@qa-ai-repo`. To drop everything,
   `claude plugin marketplace remove qa-ai-repo`.

## Install in Claude Code (npx, project files)

Use this when you want the skill, agent, and MCP config committed as plain files
in one project instead of installed as a plugin.

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
   - `ls .claude/agents/` shows `qa-e2e-author.md`, and asking Claude "which
     subagents are available?" names `qa-e2e-author`.
   - `/mcp` or `claude mcp list` shows the servers as connected.
   - `playwright-e2e` appears among the available skills.
4. **Use it:**
   - "Use the qa-e2e-author agent to cover the checkout flow"
   - `/playwright-e2e add a login test using storage-state auth`
5. **Objective-specific extras:** playwright-e2e needs `npx playwright install`
   for browsers. For Playwright's built-in planner, generator, and healer agents,
   also run `npx playwright init-agents --loop=claude`, and re-run it after
   upgrading Playwright. `init-agents` overwrites `.mcp.json` with only
   `playwright-test`, so back the file up first and merge its entries back
   afterwards; the commands are under *Playwright test agents* in
   [`reference.md`](playwright-e2e/skills/playwright-e2e/reference.md). If you
   re-add the objective instead, use the version you installed
   (`npx qa-ai-repo@<version> add playwright-e2e`); a bare `npx qa-ai-repo` fetches
   the latest published release, which may be older.
   **Plugin installs:** the plugin's tools are named
   `mcp__plugin_playwright-e2e_playwright-test__*`, but the agent files
   `init-agents` writes expect `mcp__playwright-test__*`. Approve the
   `playwright-test` server in the `.mcp.json` that `init-agents` writes; Claude
   Code then uses it in place of the plugin's identical server and the built-in
   agents get their tools. Approval needs a trusted folder: until you accept the
   folder's trust dialog, project servers stay `Pending approval`, even when
   listed in `enabledMcpjsonServers`. So start `claude` in the project, trust the
   folder, then approve the server. `claude mcp list` should then show
   `playwright-test` connected and no `plugin:playwright-e2e:playwright-test`.
   The identical `playwright` server appears only once: as
   `plugin:playwright-e2e:playwright`, or under accessibility-testing's name
   (`plugin:accessibility-testing:playwright`) when that plugin is also installed.
6. **Update or uninstall:** re-run `add` to update. To uninstall, delete the files
   listed in step 1 and remove the objective's entries from `mcpServers` in
   `.mcp.json`.

npx installs are **project-scoped**. For a user-wide install, use the plugin route.

## How agents, skills and MCP fit together

- **Rules live once, in the skill.** `SKILL.md` holds the guardrails, decision
  tables, and anti-patterns. Long code and config go in sibling files (such as
  `reference.md`), which travel with the skill.
- **Agents reference the skill; they don't copy it.** An agent's frontmatter
  carries `skills: <objective>:<skill>` (the plugin-namespaced name, so a plugin
  agent never picks up a same-named project or user skill), and Claude Code
  preloads the skill. The npx installer rewrites it to the bare `<skill>` name for
  `.claude/agents/`. The agent body holds only the role, the process steps, and
  the report format.
- **Agents name skill files without a path**: "the `reference.md` file in the
  `<skill>` skill's directory". Claude Code resolves that from the preloaded
  skill's base directory, whether it lives in `.claude/skills/` or the plugin
  cache. The installer turns it into a real path for Cursor, Windsurf, and
  `AGENTS.md`.
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
- [ ] Agent frontmatter: `name`, `description`, `skills: <objective>:<skill>`.
      Refer to skill files as "the `x.md` file in the `<skill>` skill's
      directory", never `.claude/skills/...`. Use no `tools:`
      allowlist if the agent relies on MCP. Don't duplicate the skill's rules in the
      agent body.
- [ ] Verify commands and APIs against current upstream docs, not memory.
- [ ] `npm run build:plugins` regenerates the plugin manifests; commit them.
- [ ] `npm test` passes.
- [ ] `node bin/qa-ai.js add <objective> --tool all --dry-run` succeeds.
- [ ] `claude plugin validate --strict .` and `claude plugin validate --strict <objective>` pass.

## Testing this repo

```bash
npm test                                            # node --test: install adapters, dead links, MCP/tools rule, stale plugin manifests
node bin/qa-ai.js add <objective> --tool all --dry-run
claude plugin validate --strict .                   # marketplace + every plugin entry
claude plugin marketplace add ./ && claude plugin install <objective>@qa-ai-repo   # local end-to-end
```

### Plugin manifests are generated

`objective.json` and `mcp/*.json` are the source of truth.
`npm run build:plugins` (`scripts/build-plugins.js`) writes
`.claude-plugin/marketplace.json` and each `<objective>/.claude-plugin/plugin.json`
(MCP servers inlined, version/author/license from `package.json`). The output is
committed because Claude Code reads marketplaces from git, and `npm test` fails if
it is stale.

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
2. Bump `version` in `package.json`, run `npm run build:plugins` (plugin
   versions follow `package.json`; installed plugins only update when it
   changes), and commit both.
3. Create a GitHub Release (tag e.g. `v0.1.0`). The workflow smoke-tests the
   CLI, runs `npm test` and `claude plugin validate --strict`, and publishes; it
   skips automatically if that version is already on npm.

The workflow publishes with npm **provenance** (verified build attestation).
`--provenance` and the `id-token: write` permission enable it. Provenance requires
a public repo.

**Manual.** `npm login` then `npm publish` from the repo root.

## License

[MIT](LICENSE)


## Evidence-driven quality checks

Each objective now includes a domain-specific verification guide and a five-part scenario matrix. Agents distinguish passed, failed, blocked, and not-run work, and require evidence for claims about compatibility, accessibility, performance, flaky-test repair, and model quality. See [research and design decisions](docs/research-2026-10-06.md).

MCP installation preserves an existing same-name server definition (including custom arguments and environment settings) and logs the conflict. To adopt a changed default, review your existing config against the shipped `mcp/` definition and update it deliberately. Browser MCP uses an isolated profile; it does not persist login between sessions. Profile isolation is not a network or security sandbox. The test-runner MCP uses `npx --no-install`: install the project's compatible `@playwright/test` first instead of implicitly fetching another runner.

Maintainer checks (from a source checkout):

```bash
npm test                  # offline regression tests; isolated project/home directories
npm run test:mutations    # healthy control plus four deliberately faulty installer variants
npm run test:performance  # opt-in: existing k6, loopback-only failure probes
npm run test:runtime      # opt-in: installs pinned test tools into a temporary project
```

The runtime check downloads a browser when needed, probes both MCP servers, navigates a local page, and runs Playwright/axe/visual/keyboard/cleanup and BDD fixtures. To use installed Chrome, set `QA_BROWSER_CHANNEL=chrome`. It prints the temporary artifact directory containing `evidence.json` and test output. Tests exercise known failures as well as healthy behavior. They do not measure an LLM judge, execute a production load test, or establish that every agent performs well on arbitrary applications.

The Quality workflow runs offline checks on Node 18/20/22/24 across Linux/macOS/Windows and the browser fixture on Linux. Repository branch-protection settings must separately make the desired jobs required. See [validation scope and results](docs/validation-2026-10-06.md) for what was actually executed locally.
