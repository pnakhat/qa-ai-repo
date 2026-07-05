---
name: qa-strategy
description: Produce a tailored, risk-based QA strategy for a team or project. Use when asked to "create a QA strategy", "assess our testing approach", "build a test plan/roadmap", or decide what and how much to automate. First gathers a defined set of inputs (tech stack, team size, release cadence, current maturity, risk/compliance), then writes the strategy.
---

# QA Strategy

Generate a QA strategy that fits *this* team — not a generic checklist. The
strategy is only as good as its inputs, so **always gather the intake first**,
then produce the strategy against a consistent template.

## How to run

1. **Collect the intake.** Ask the questions in `intake.md`. Ask them in
   batches (grouped by section), not all at once. If the user has already
   supplied some answers (in the prompt, a repo, a doc), pre-fill those and only
   ask what's missing or ambiguous. Do not invent answers — if something is
   unknown, mark it `TBD` and note the assumption you'll proceed with.
2. **Infer what you can from the codebase** when available: languages,
   frameworks, existing test dirs, CI config, coverage — confirm rather than ask.
3. **Write the strategy** using `strategy-template.md`. Every recommendation
   must trace back to an input (e.g. "daily deploys → block merges on a fast
   smoke suite"). Tailor depth to team size and maturity.
4. **Prioritize by risk.** Rank areas by likelihood × impact; put automation
   and coverage where failures hurt most, not uniformly.
5. **Make it actionable.** End with a phased roadmap (Now / Next / Later) with
   concrete first steps, owners, and success metrics — not aspirations.

## Principles

- **Right-size it.** A 3-person startup shipping daily and a 50-person org with
  compliance needs get very different strategies. Match rigor to risk and team
  capacity.
- **Test pyramid, not ice-cream cone.** Favor many fast unit/integration tests,
  fewer E2E; call out where the current shape is inverted.
- **Automate the repetitive and high-risk; keep humans for exploratory.**
- **Quality gates over quality theater.** Tie recommendations to CI gates and
  measurable signals (escape rate, flake rate, lead time), not vanity coverage %.
- **Start where they are.** Recommend the next 2–3 improvements, not a rewrite.

## Inputs and outputs

- `intake.md` — the question set to collect before writing anything.
- `strategy-template.md` — the structure of the delivered strategy document.
