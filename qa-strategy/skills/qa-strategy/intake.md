# QA Strategy — Intake Question Bank

Each question is a **multiple-choice option set** (2–4 options + "Other"). Ask
only the ones whose answer would change the strategy — the **Drives** line says
which decision each one feeds; if that decision is already settled (by the
repo, the prompt, or an earlier answer), skip the question. **Bold** questions
are the minimum for a useful first draft. Interaction rules (batching,
pre-filling, tools, recording answers) are in `SKILL.md` → "Asking the intake".

Format when asking: question, then options as `label — tradeoff/implication`.
Always allow "Other (free text)".

## 1. Product & scope

**Q1. What kind of product is this?** — Drives: which test levels/tools exist at all.
- Web app (SPA/SSR) — browser E2E + component tests apply
- API / backend service(s) — contract + integration-heavy; little or no UI automation
- Mobile app — device matrix, store release cadence, slower feedback
- Data/ML pipeline — data-quality and eval tests over UI tests
*Pre-fill from:* `package.json`, framework configs, `Dockerfile`, mobile project files.

**Q2. Which flows would hurt most if broken in production?** — Drives: the Critical risk tier.
- Payments / billing / checkout — money-moving; heaviest coverage + monitoring
- Auth / signup / access control — security-critical; authz tested at the API
- Core daily workflow (e.g. create/edit the main object) — breadth of users affected
- Data integrity (imports, sync, reporting) — silent corruption; needs data checks
*Multi-select.* Pre-fill from route names/README; confirm.

Q3. Platforms to support? — Drives: compatibility matrix size.
- Evergreen desktop browsers only — Chromium + one other engine is enough
- Desktop + mobile web — add a mobile viewport/WebKit project
- Native iOS/Android too — device cloud cost; separate pipeline

## 2. Tech stack

**Q4. Existing test frameworks (confirm what the repo shows)?** — Drives: tools recommended (respect the stack).
- Present it as "I found: <list>. Correct?" with options: Correct / Partly — some unused / Missing some (Other)
*Pre-fill from:* devDependencies, test dirs, CI config. Never ask cold if the repo answers it.

Q5. Architecture shape? — Drives: pyramid vs honeycomb, need for contract tests.
- Monolith — pyramid; integration tests against one DB
- A few services with an API gateway/BFF — contracts at each seam
- Many microservices / event-driven — contract + message tests are the backbone
*Pre-fill from:* repo layout, compose/k8s files.

## 3. Team & process

**Q6. Who owns testing today?** — Drives: ownership model and how much process to add.
- Developers only, no QA — dev-owned tests; lean gates; QA as coaching, not a phase
- Devs + embedded QA/SDET — QA owns framework/exploratory; devs own unit/integration
- Separate QA team after dev — biggest lever is shifting left; risk of hand-off delays
- Nobody consistently — start with a merge gate and a Definition of Done

**Q7. Team size (engineers)?** — Drives: how much the strategy can ask for.
- 1–5 — automate critical paths only; manual exploratory for the rest
- 6–20 — full PR gate + nightly suites; one owner for test infra
- 20+ — platform/test-infra ownership, shared tooling, per-team gates

**Q8. Release cadence?** — Drives: gate speed budget and where slow suites run.
- Per-merge / continuous — PR gate < 10 min; feature flags + canary instead of release QA
- Daily–weekly — fast PR gate + nightly full suite
- Bi-weekly–monthly / app-store — release-candidate regression + exploratory sign-off
- Ad-hoc / manual deploys — fix the pipeline first; the strategy depends on it
*Pre-fill from:* CI deploy workflows, tags/releases history.

## 4. Current quality state

**Q9. What hurts most right now?** — Drives: the Now-phase priorities.
- Bugs escaping to production — risk-based coverage + escape tracking
- Slow CI / long feedback — rebalance the pyramid, parallelize, move suites to nightly
- Flaky tests — measure flake rate, quarantine, root-cause
- Slow, manual release regression — automate the regression pack for critical flows
*Multi-select, max 2.*

Q10. Is there a defect tracker with severity/escape data? — Drives: whether metrics start from a baseline or from "start tracking".
- Yes, with severities and a found-in-prod flag — baseline the metrics now
- Yes, but inconsistent — first step: a severity + "found in" field
- No — Now-phase action: start tracking; targets stay `TBD` until a quarter of data

## 5. Non-functional & risk

**Q11. Compliance / regulatory obligations?** — Drives: evidence, traceability, release gates.
- None — skip traceability overhead
- Security/privacy (SOC 2, ISO 27001, GDPR) — access-control tests, audit evidence, change records
- Payments/health (PCI DSS, HIPAA) — segregated/synthetic test data, evidence-producing tests, gated releases
- Accessibility (WCAG 2.2 AA; ADA, European Accessibility Act) — a11y gate + manual audit
*Multi-select.*

Q12. Performance expectations? — Drives: whether a perf track exists and how it gates.
- No stated targets — define SLOs first; don't load-test against guesses
- SLOs exist (e.g. p95 latency, error rate) — k6/Gatling thresholds gating nightly/pre-release
- Known traffic spikes (sales, events) — add spike/soak tests before those dates

Q13. Production observability? — Drives: how much shift-right testing is possible.
- Metrics/alerts + error tracking — canary analysis and synthetic monitoring are viable
- Basic logs only — add error tracking before relying on production signals
- Plus feature flags — progressive delivery can replace part of pre-release regression

## 6. Goals & constraints

**Q14. Primary goal for the next quarter?** — Drives: which metric the strategy optimizes and gates first.
- Fewer production escapes — escape rate + change fail rate
- Ship faster — lead time + CI feedback time
- Stabilize the suite — flake rate
- Pass an audit / meet compliance — evidence + traceability

Q15. Appetite for change? — Drives: roadmap size.
- Incremental — 2–3 changes per phase, no tool migrations
- Moderate — one tool/framework change, justified by a stated pain point
- Large investment — still phased; never a big-bang rewrite
