---
name: qa-strategy
description: Produce a tailored, risk-based QA strategy for a team or project. Use when asked to "create a QA strategy", "assess our testing approach", "build a test plan/roadmap", or decide what and how much to automate. Enforces guardrails against vanity coverage targets, big-bang rewrites, and metrics with no gate. First gathers a defined set of inputs (tech stack, team size, release cadence, current maturity, risk/compliance), then writes the strategy against a consistent template. See `reference.md` for the risk-scoring rubric, metric formulas, and quality-gate examples.
---

# QA Strategy

Generate a QA strategy that fits *this* team — not a generic checklist. The
strategy is only as good as its inputs, so **always gather the intake first**,
then produce the strategy against a consistent template. Every recommendation
traces back to a stated input and lands as a measurable gate, not an aspiration.

## How to run

1. **Collect the intake.** Ask the questions in `intake.md`. Ask them in
   batches (grouped by section), not all at once. If the user has already
   supplied some answers (in the prompt, a repo, a doc), pre-fill those and only
   ask what's missing or ambiguous. Do not invent answers — if something is
   unknown, mark it `TBD` and note the assumption you'll proceed with.
2. **Infer what you can from the codebase** when available: languages,
   frameworks, existing test dirs, CI config, coverage — confirm rather than ask.
3. **Score risk.** Rank features/flows by likelihood × impact using the rubric
   in `reference.md`. This drives where coverage goes.
4. **Write the strategy** using `strategy-template.md`. Every recommendation
   must trace back to an input (e.g. "daily deploys → block merges on a fast
   smoke suite"). Tailor depth to team size and maturity.
5. **Make it actionable.** End with a phased roadmap (Now / Next / Later) with
   concrete first steps, owners, and success metrics defined per `reference.md`
   — not aspirations.

## Intake first — why it's non-negotiable

The single biggest failure mode is writing a generic strategy that ignores the
team's reality. A strategy built without inputs is filler.

| ✅ Do | ❌ Don't |
|-------|---------|
| Ask the `intake.md` questions in grouped batches | Dump all 25 questions at once, or ask none |
| Pre-fill from the repo/CI config, then confirm | Ask for facts the codebase already shows |
| Mark unknowns `TBD` + state the assumption | Invent a stack, team size, or cadence |
| Proceed on terse answers; note what's missing | Block on a full interview before offering value |
| Tie every recommendation to a specific input | Recommend tools the team's stack can't use |

## Right-sizing — match rigor to risk and capacity

A 3-person startup shipping daily and a 50-person org with compliance needs get
very different strategies. Read the intake, then dial the rigor.

| Signal from intake | Strategy implication |
|--------------------|----------------------|
| Small team, no dedicated QA | Dev-owned tests; lean pyramid; automate only critical paths |
| Daily / per-commit deploys | Fast merge gate (smoke + unit); trace nightly for the rest |
| Compliance (HIPAA/PCI/SOC 2) | Evidence-producing tests, traceability, gated release checklist |
| Inverted pyramid (E2E-heavy, slow, flaky) | Rebalance down: push coverage to unit/integration first |
| High traffic / revenue-bearing flows | Concentrate E2E + performance on those flows only |
| Legacy code, low coverage | Characterization tests around change points, not a rewrite |

## Principles

- **Right-size it.** Match rigor to risk and team capacity — see the table above.
- **Test pyramid, not ice-cream cone.** Favor many fast unit/integration tests,
  fewer E2E; call out where the current shape is inverted and how to rebalance.
- **Automate the repetitive and high-risk; keep humans for exploratory.**
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
| "MTTR for Sev-1 < 4h, alerted" | "Fix bugs faster" |

## Anti-patterns — smells to reject

| ❌ Smell | ✅ Fix |
|---------|--------|
| "Get to 90% code coverage" as the goal | Tie coverage to risk-ranked critical paths; gate those at 100%, leave the tail |
| Big-bang "rewrite all tests in X" plan | Phased Now/Next/Later; characterization tests around change points |
| One-size-fits-all strategy ignoring intake | Right-size to team, stack, cadence, and risk |
| Coverage % with no CI gate behind it | Every metric gets a threshold and a consequence |
| Ice-cream-cone suite (mostly slow E2E) | Rebalance to a pyramid; push logic down to unit/integration |
| "Add more tests everywhere" (uniform effort) | Concentrate on likelihood × impact top tier |
| Testing theater: green suite, bugs still escape | Track escape rate; assert on real user outcomes |
| Recommending tools the stack can't run | Respect the existing stack; justify any change |
| `retries: 3` / manual re-runs to hide flake | Measure flake rate; quarantine + fix root cause |
| Roadmap of aspirations with no owner/metric | Concrete first steps with an owner and a success metric |
| Inventing intake answers to fill gaps | Mark `TBD`, state the assumption, ask to confirm |

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

## Inputs and outputs

- `intake.md` — the question set to collect before writing anything.
- `strategy-template.md` — the structure of the delivered strategy document.
- `reference.md` — risk-scoring rubric, metric formulas, quality-gate examples,
  and a worked mini-example strategy.
