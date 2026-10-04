---
name: qa-strategy
description: Produce a tailored, risk-based QA strategy for a team or project. Use when asked to "create a QA strategy", "assess our testing approach", "build a test plan/roadmap", or decide what and how much to automate. Enforces guardrails against vanity coverage targets, big-bang rewrites, and metrics with no gate. Pre-fills inputs from the codebase, asks only the decision-relevant intake questions as multiple-choice option sets (tech stack, team size, release cadence, current maturity, risk/compliance), then writes the strategy against a consistent template. See `reference.md` for the risk-scoring rubric, metric formulas, and quality-gate examples.
---

# QA Strategy

Generate a QA strategy that fits *this* team — not a generic checklist. The
strategy is only as good as its inputs, so **always gather the intake first**,
then produce the strategy against a consistent template. Every recommendation
traces back to a stated input and lands as a measurable gate, not an aspiration.

## How to run

1. **Infer what you can from the codebase first** (languages, frameworks,
   test dirs, CI config, deploy workflows, coverage) — this pre-fills the intake,
   so do it *before* asking anything.
2. **Collect the rest of the intake** from `intake.md` — only the questions whose
   answer would change the strategy, as multiple-choice option sets (rules below).
3. **Score risk.** Rank features/flows by likelihood × impact using the rubric
   in `reference.md`. This drives where coverage goes.
4. **Write the strategy** using `strategy-template.md`. Every recommendation
   must trace back to an input (e.g. "daily deploys → block merges on a fast
   smoke suite"). Tailor depth to team size and maturity.
5. **Make it actionable.** End with a phased roadmap (Now / Next / Later) with
   concrete first steps, owners, and success metrics defined per `reference.md`
   — not aspirations.

## Asking the intake

The biggest failure mode is a generic strategy that ignores the team's reality;
the second is an interrogation. Ask the *fewest* questions that pick the strategy.

- **Pre-fill, then confirm.** Anything the repo, prompt, or a doc already shows
  becomes a confirmation ("I found Jest + Playwright and weekly deploys — correct?"),
  never an open question.
- **Skip what can't change the outcome.** Each question in `intake.md` names the
  decision it drives; if that decision is settled, don't ask.
- **Multiple choice, not open-ended.** 2–4 concrete options per question, each
  with its tradeoff in a few words, plus "Other" for free text. Mark the option
  you'd recommend from the evidence as the first one.
- **Small batches by section** — at most 4 questions per batch, bold
  (minimum-draft) questions first. Terse answers are fine; proceed on them.
- **Tooling.** In Claude Code's main conversation use the `AskUserQuestion`
  tool (one batch per call; `multiSelect` where `intake.md` says multi-select).
  Elsewhere, print a numbered list (`1a`, `1b`, …) and let the user reply with codes.
  Subagents cannot ask the user (Claude Code removes `AskUserQuestion` from
  them): they pre-fill what they can, write the draft on stated assumptions, and
  return the still-open option sets to the caller to ask.
- **Never invent answers.** Unknown → `TBD` + the assumption you proceeded on.
- **Record every decision** in the strategy's *Intake decisions* table
  (`strategy-template.md`): question → chosen option → source (user / repo /
  assumed) → what it changed in the strategy.

## Right-sizing — match rigor to risk and capacity

A 3-person startup shipping daily and a 50-person org with compliance needs get
very different strategies. Read the intake, then dial the rigor.

| Signal from intake | Strategy implication |
|--------------------|----------------------|
| Small team, no dedicated QA | Dev-owned tests; lean pyramid; automate only critical paths |
| Daily / per-commit deploys | Fast merge gate (smoke + unit); run the rest nightly |
| Compliance (HIPAA/PCI/SOC 2) | Evidence-producing tests, traceability, gated release checklist |
| Inverted pyramid (E2E-heavy, slow, flaky) | Rebalance down: push coverage to unit/integration first |
| High traffic / revenue-bearing flows | Concentrate E2E + performance on those flows only |
| Legacy code, low coverage | Characterization tests around change points, not a rewrite |

## Principles

- **Right-size it.** Match rigor to risk and team capacity — see the table above.
- **Test pyramid, not ice-cream cone.** Favor many fast unit/integration tests,
  fewer E2E; call out where the current shape is inverted and how to rebalance.
- **Automate the repetitive and high-risk; keep humans for exploratory** —
  time-boxed, charter-based sessions (session-based test management), not ad-hoc clicking.
- **Cover all four agile testing quadrants deliberately** (Crispin & Gregory):
  Q1 technology-facing/supporting (unit, component), Q2 business-facing/supporting
  (functional, story tests), Q3 business-facing/critiquing (exploratory, usability,
  UAT), Q4 technology-facing/critiquing (performance, security, reliability).
  An empty quadrant must be a stated decision, not an oversight.
- **Shift left *and* right.** Left: testable requirements, reviews, static
  analysis, tests in the PR. Right: observability, canary/progressive delivery
  behind feature flags, synthetic monitoring of critical journeys, and production
  error budgets feeding back into the risk scores.
- **Quality gates over quality theater.** Tie every recommendation to a CI gate
  and a measurable signal (escape rate, flake rate, lead time) with a threshold
  — not vanity coverage %. A metric with no gate is a vanity metric.
- **Start where they are.** Recommend the next 2–3 improvements, not a rewrite.
- **Risk drives coverage.** Concentrate effort where failures hurt most, not
  uniformly across the surface area.

## Metrics that gate, not metrics that decorate

Every metric you propose must have a threshold *and* a consequence when breached.
See `reference.md` for precise formulas.

| ✅ Gating metric | ❌ Vanity metric |
|------------------|------------------|
| "Merge blocked if smoke suite red or > 10 min" | "Aim for 80% line coverage" (no gate, no risk link) |
| "Escape rate < 2/month, tracked per release" | "Increase test count" |
| "Flake rate < 1%; auto-quarantine above" | "Reduce flakiness" (no threshold) |
| "Critical-path E2E coverage = 100%" | "Improve overall coverage" |
| "Failed-deployment recovery time < 1h; auto-rollback on SLO breach" | "Fix bugs faster" |

## Anti-patterns — smells to reject

| ❌ Smell | ✅ Fix |
|---------|--------|
| "Get to 90% code coverage" as the goal | Tie coverage to risk-ranked critical paths; gate those at 100%, leave the tail |
| Big-bang "rewrite all tests in X" plan | Phased Now/Next/Later; characterization tests around change points |
| One-size-fits-all strategy ignoring intake | Right-size to team, stack, cadence, and risk |
| Coverage % with no CI gate behind it | Every metric gets a threshold and a consequence |
| Ice-cream-cone suite (mostly slow E2E) | Rebalance to a pyramid; push logic down to unit/integration |
| "Add more tests everywhere" (uniform effort) | Concentrate on likelihood × impact top tier |
| Testing theater: green suite, bugs still escape | Track escape rate; prefer mutation score over raw coverage; assert on real user outcomes |
| Recommending tools the stack can't run | Respect the existing stack; justify any change |
| `retries: 3` / manual re-runs to hide flake | Measure flake rate; quarantine + fix root cause |
| Roadmap of aspirations with no owner/metric | Concrete first steps with an owner and a success metric |
| Inventing intake answers to fill gaps | Mark `TBD`, state the assumption, ask to confirm |

## Strategy vs. plan

This skill writes a **test strategy** — the project/product-level approach
(ISTQB CTFL v4.0; ISO/IEC/IEEE 29119-3 places the strategy inside the test plan
and calls the org-wide version *test practices*): levels, types, risk approach,
gates, tooling, roles. It is not a release **test plan** (dates, environments,
named test cases, entry/exit criteria for one release). Define entry/exit
criteria generically per gate here; leave per-release schedules to the plan.

## Risk-based prioritization

Rank every feature/flow by **likelihood × impact** (rubric and matrix in
`reference.md`). The top tier gets automated regression + the heaviest coverage;
the bottom tier may warrant only smoke or manual checks. Uniform coverage across
a product is a signal you skipped this step.

## Quality gates & CI stages

Map suites to pipeline stages and define what *blocks* at each. A gate without a
block is a suggestion. See `reference.md` for copy-pasteable gate definitions.

- **Pre-commit / pre-push:** lint, type-check, fast unit tests.
- **PR:** unit + integration + smoke E2E; coverage-on-changed-lines gate.
- **Merge to trunk:** full fast suite green; no `.only`/skipped criticals.
- **Nightly:** full E2E, performance, accessibility, security scans.
- **Pre-release:** compliance evidence, manual exploratory sign-off, rollback plan.
- **Post-deploy (shift-right):** canary/smoke against production, synthetic
  monitors on critical journeys, automatic rollback on SLO/error-rate breach.

## Inputs and outputs

- `intake.md` — the multiple-choice question bank, each tagged with the decision it drives.
- `strategy-template.md` — the structure of the delivered strategy document.
- `reference.md` — risk-scoring rubric, metric formulas, quality-gate examples,
  and a worked mini-example strategy.

## Works well with

The strategy names metrics and gates; these objectives make them real. None is a
hard dependency.

- **`flaky-test-triage`** — turns the flake-rate metric this strategy gates on
  into an actual detect → quantify → quarantine → fix workflow.
- **`performance-testing`** — turns non-functional/perf SLOs into runnable k6 and
  Lighthouse thresholds that gate the pipeline.
- **`test-pyramid`** — operationalizes the "rebalance to a pyramid" recommendation
  into a per-layer plan with example tests.
