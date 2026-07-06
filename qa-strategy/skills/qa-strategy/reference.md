# QA Strategy — Reference

Concrete rubrics, metric formulas, gate definitions, and a worked mini-example.
Use these to make the strategy specific and measurable instead of aspirational.

## Risk-scoring rubric (likelihood × impact)

Score each feature/flow on two axes, 1–5, then multiply for a risk score (1–25).

**Likelihood** — how often does this break or regress?

| Score | Meaning |
|-------|---------|
| 1 | Stable, rarely touched, simple logic |
| 2 | Occasional changes, well-understood |
| 3 | Moderate churn or moderate complexity |
| 4 | Frequently changed, complex, or many integrations |
| 5 | Hotspot: constant churn, tangled dependencies, prior incidents |

**Impact** — what's the blast radius if it fails in production?

| Score | Meaning |
|-------|---------|
| 1 | Cosmetic; no user or business effect |
| 2 | Minor annoyance; easy workaround |
| 3 | Degraded experience for some users |
| 4 | Blocks a key journey, or affects money/data for many users |
| 5 | Safety, data loss, security breach, revenue-blocking outage, or compliance violation |

**Risk = Likelihood × Impact**, then bucket:

| Score | Tier | Coverage warranted |
|-------|------|--------------------|
| 15–25 | Critical | Automated regression + E2E on the flow; performance/security if relevant; 100% critical-path coverage; block merges |
| 8–14 | High | Automated unit + integration; smoke E2E; run on every PR |
| 4–7 | Medium | Unit/integration for core logic; periodic manual/exploratory |
| 1–3 | Low | Smoke or manual spot-check; do not over-invest |

### Example scoring table

| Area | Likelihood | Impact | Score | Tier |
|------|-----------|--------|-------|------|
| Checkout / payment | 4 | 5 | 20 | Critical |
| User authentication | 3 | 5 | 15 | Critical |
| Search relevance | 4 | 3 | 12 | High |
| Profile settings | 2 | 2 | 4 | Medium |
| Marketing footer links | 1 | 1 | 1 | Low |

## Metric definitions & formulas

Propose these with a **current → target** and a **gate**. Never propose a metric
without a threshold and a consequence.

| Metric | Formula | Good direction | Typical target |
|--------|---------|----------------|----------------|
| **Escape rate** | defects found in production ÷ total defects found (prod + pre-prod), per release or month | ↓ | < ~5%, trending down |
| **MTTR** (mean time to restore) | Σ (restore time − detection time) ÷ number of incidents | ↓ | Sev-1 < 4h; overall < 1 day |
| **Lead time for changes** | time from commit merged → running in production | ↓ | Elite: < 1 day |
| **Flake rate** | flaky test runs ÷ total test runs (a flake = pass and fail on the same commit) | ↓ | < 1%; quarantine above |
| **Mutation score** | mutants killed ÷ total mutants introduced (test-suite effectiveness, via a mutation tool) | ↑ | 60–80% on critical modules |
| **Change-failure rate** | deploys causing a failure/rollback ÷ total deploys | ↓ | Elite: 0–15% |
| **CI feedback time** | wall-clock time from push → merge-gate result | ↓ | PR gate < 10 min |
| **Critical-path coverage** | critical journeys with passing automated E2E ÷ total critical journeys | ↑ | 100% |

Notes:
- **Coverage % (line/branch)** is a diagnostic, not a goal. Gate coverage *on
  changed lines* in a PR rather than chasing a global number.
- **Mutation score** beats line coverage for measuring whether tests actually
  assert anything — a high-coverage suite with a low mutation score is theater.

## Quality-gate definitions (examples)

Each gate = a stage, a condition, and a block. Copy and adapt.

```
Gate: PR merge
  Conditions (all must pass):
    - Unit + integration suites green
    - Smoke E2E green
    - Coverage on changed lines >= 80%
    - No new lint/type errors
    - No committed .only / skipped critical tests
  On failure: merge blocked (required check)

Gate: Merge to trunk / main
  Conditions:
    - Full fast suite green
    - Flake rate over last 50 runs < 1%
  On failure: trunk red → auto-revert or hotfix; alert on-call

Gate: Nightly
  Conditions:
    - Full E2E across supported browsers/devices
    - Performance budget met (p95 latency, bundle size)
    - Accessibility scan: no new WCAG A/AA violations
    - Security scan (SAST/dependency): no new high/critical
  On failure: file ticket, block next release until triaged

Gate: Pre-release / compliance
  Conditions:
    - Release checklist complete
    - Compliance evidence captured (traceability matrix, audit log)
    - Exploratory sign-off on critical journeys
    - Documented rollback plan + monitoring in place
  On failure: no-go
```

Retry/flake policy (state it explicitly): allow at most 1 retry on PR as a noise
filter, **0 retries on trunk**; any retry emits a signal. Tests that flake twice
in a week are auto-quarantined (tagged, excluded from the gate) with a tracking
issue — never left to silently retry to green.

## Worked mini-example (snippet)

*Hypothetical: "Nimbus", a 6-person B2B SaaS team, React + Node monorepo,
Postgres, deploys 3–4×/week via GitHub Actions. No dedicated QA; devs test their
own work. Pain: E2E-heavy Cypress suite, ~18 min, flaky; two prod escapes last
quarter in billing. Goal: cut escapes and speed up CI. No formal compliance yet.*

**Context snapshot.** Small dev-owned team, moderate cadence, inverted pyramid
(slow flaky E2E), billing is the revenue-bearing hotspot. `TBD`: current escape
rate (no defect tracking) — assume ~2/quarter from the reported incidents.

**Top risks (scored).**

| Area | L | I | Score | Tier |
|------|---|---|-------|------|
| Billing / invoicing | 4 | 5 | 20 | Critical |
| Auth / SSO | 3 | 5 | 15 | Critical |
| Dashboard rendering | 4 | 3 | 12 | High |
| Account settings | 2 | 2 | 4 | Medium |

**Test-level rebalance.** Move billing logic from E2E into fast unit +
integration tests (aim: kill the 18-min suite down to a < 8-min PR gate). Keep
only 3–4 E2E journeys: sign-in, create invoice, pay invoice, cancel subscription.

**Metrics & gates (current → target).**

| Metric | Now | Target | Gate |
|--------|-----|--------|------|
| Escape rate | ~2/qtr | 0 in billing | Track in a defect tracker from day 1 |
| CI feedback time | 18 min | < 8 min | Merge blocked if PR gate > 10 min |
| Flake rate | ~8% | < 1% | Quarantine any test flaking 2×/week |
| Critical-path E2E | partial | 100% | 4 journeys green on every PR |

**Roadmap.**
- **Now (0–4w):** stand up a defect tracker; add integration tests around
  billing; split Cypress into `@smoke` (PR) vs. full (nightly). Owner: Priya.
- **Next (1–2m):** rebalance pyramid; add coverage-on-changed-lines gate at 80%;
  quarantine + fix flaky specs. Owner: team, tracked weekly.
- **Later (quarter+):** mutation testing on billing module (target 70%); add a
  performance budget as dashboards grow. Owner: TBD.

**Open questions.** No defect-tracking history — validate escape-rate baseline
after one quarter of tracking. Compliance may arrive with enterprise deals; revisit
evidence/traceability then.
