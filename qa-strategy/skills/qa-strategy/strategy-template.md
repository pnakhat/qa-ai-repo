# QA Strategy — <Product / Team Name>

> Generated <date> · Owner: <name> · Status: Draft

## 0. Context snapshot
One paragraph summarizing the intake: product, stack, team size, cadence, and
current quality state. List key assumptions and any `TBD` inputs.

### Intake decisions
| # | Question | Chosen option | Source (user / repo / assumed) | What it changed |
|---|----------|---------------|--------------------------------|-----------------|
| Q8 | Release cadence | Daily–weekly | repo: deploy workflow | PR gate < 10 min; full E2E nightly |
| … | | | | |
Every `assumed` row is an open question in §10.

## 1. Quality goals & metrics
- Primary goal(s) this quarter (tie to the team's stated goal).
- Target metrics with current → target, e.g.:
  | Metric | Now | Target |
  |--------|-----|--------|
  | Prod escape rate | ? | ↓ |
  | E2E flake rate | ? | < 1% |
  | CI feedback time | ? | < 10 min |
  | Change fail rate (DORA) | ? | ↓ from baseline |
  | Critical-path coverage | ? | 100% |

## 2. Risk-based test prioritization
Rank features/flows by **likelihood × impact**. Concentrate effort on the top
tier. A short table: area → risk → what coverage it warrants.

## 3. Test scope & levels
Recommended mix across the pyramid, justified by stack and team size:
- **Unit** — where, framework, target.
- **Integration / contract** — service boundaries, APIs, DB.
- **End-to-end** — only critical journeys; keep the count small.
- **Manual / exploratory** — what stays human (usability, edge exploration).
Call out if the current shape is inverted and how to rebalance.

## 4. Test types beyond functional
Map to the agile testing quadrants (Q1 unit/component · Q2 functional/story ·
Q3 exploratory/usability/UAT · Q4 performance/security/reliability); state any
quadrant deliberately left empty. Only those the intake justifies:
- Performance/load · Security (SAST/DAST/pentest) · Accessibility (WCAG)
- Compatibility (browsers/devices) · i18n/l10n · Resilience/chaos
- Compliance-driven testing (HIPAA/PCI/SOC 2) with required evidence.

## 5. Automation strategy
- What to automate first (high-risk + high-repetition) and what not to.
- Recommended frameworks/tools (respect existing stack; justify changes).
- Test data & environment management: how tests create their own data, how
  teardown runs (including on failure), isolation for parallel runs, the orphan
  sweeper, and which environments never get destructive setup.
- Standards: naming, structure, stable locators, no fixed sleeps, isolation.

## 6. CI/CD integration & quality gates
- Which suites run at which stage (pre-commit / PR / merge / nightly / release).
- **Merge gates**: what must pass to merge (fast smoke + unit/integration).
- Handling flake (quarantine, retry policy) and keeping the suite fast.
- Entry/exit criteria per gate (what must be true to start / to pass).
- Release checklist and rollback signals.
- Shift-right: post-deploy smoke/canary, synthetic monitors on critical journeys,
  feature-flag rollout and automatic rollback triggers.

## 7. Roles & ownership
- Who writes, reviews, and maintains tests (dev-owned vs. QA/SDET).
- Bug triage flow, severity definitions, and SLAs.
- Definition of Done for a story to include quality criteria.

## 8. Tooling recommendations
Concrete tools for: test frameworks, CI, reporting/dashboards, coverage,
performance, security, accessibility, bug tracking. Note cost/effort and
whether each is adopt-now or later.

## 9. Rollout roadmap
Phased, with owners and success criteria — not a wish list.
- **Now (0–4 weeks):** 2–3 concrete first steps.
- **Next (1–2 months):** build-out.
- **Later (quarter+):** maturity, harder NFRs, scale.

## 10. Risks & open questions
Assumptions to validate, `TBD` inputs to resolve, project risks (environments,
skills, tooling budget), and dependencies/blockers.
