---
name: flaky-test-triage
description: Detect, quantify, classify, and fix flaky tests — compute flake rate and per-test flake scores, reproduce non-determinism, classify the root cause, and either fix at the root or quarantine with an owner + issue + SLA. Use when tests pass-on-retry, fail intermittently in CI, or someone reaches for `retries` to make the pipeline green. Enforces guardrails against masking flake with retries, deleting tests, and ownerless quarantine. See `reference.md` for runnable rerun commands, formulas, and per-cause before/after fixes.
---

# Flaky Test Triage

A flaky test passes and fails on the *same code*. It is worse than a failing
test: it trains the team to ignore red, so real regressions slip through. Treat
flake as a defect in the test, with a rate you measure, a cause you name, and a
fix you land — **never** a nuisance you retry away.

## How to run

1. **Confirm it's flake, not a real bug.** Reproduce on the exact commit. If it
   fails deterministically, it's a bug — route it to the code, not here.
2. **Quantify.** Compute the suite flake rate and a per-test flake score from
   reruns + CI history (formulas below). Rank by score × blast radius.
3. **Reproduce the non-determinism.** Rerun the suspect many times; shuffle order;
   vary workers/timezone/seed until it flips. A flake you can't reproduce, you
   can't fix — keep isolating.
4. **Classify** against the taxonomy — match the tell-tale signal to a cause.
5. **Fix at the root** using the per-cause playbook, *or* **quarantine with an
   SLA** if the fix can't land now. Never leave it failing in the blocking lane.
6. **Verify.** Rerun the fixed test ≥ N times green before closing; un-quarantine
   only after N consecutive green runs.

## Taxonomy — cause → tell-tale signal → fix direction

| Cause | Tell-tale signal | Fix direction |
|-------|------------------|---------------|
| **Async / timing** | Passes on retry; fails on slow/loaded CI; `waitForTimeout`/`sleep` in the body | Web-first auto-retrying assertions; wait on the condition, not the clock |
| **Shared state & ordering** | Fails only in some orders; green alone, red in suite; passes with `--workers=1` | Per-test setup/teardown; fresh state; no cross-test globals |
| **External dependencies** | Fails when a third-party/API is slow or down; network in the stack trace | Mock what you don't own; stub the boundary; retry only the real integration lane |
| **Animations / transitions** | Fails mid-transition; screenshot diffs by a few px; timing-sensitive clicks | Disable animations; assert post-settle state |
| **Time / locale / randomness** | Fails at midnight, month/DST boundaries, in another TZ, or ~1 run in N | Freeze the clock; pin TZ/locale; seed the RNG |
| **Resource leaks** | Degrades as the suite runs; late tests flake; OOM/handle exhaustion | Dispose/close in teardown; reset pools; cap concurrency |

## Detection — make it flip on demand

You can't fix what you can't reproduce. Force the flake to show itself.

| ✅ Do | ❌ Don't |
|-------|---------|
| Rerun the suspect N× (`--repeat-each`, loops, `pytest-flakefinder`) | Declare "flaky" after one red and move on |
| Mine CI for tests that **passed-on-retry** — that log *is* the flake list | Wait for humans to report intermittent failures |
| Shuffle order + drop to 1 worker to isolate order-dependence | Assume parallelism is the cause without testing it |
| Vary TZ / locale / seed / clock to expose environment coupling | Run only in the one environment where it's green |
| Reproduce locally before proposing a fix | "Fix" blind, then hope CI goes green |

- **Playwright:** `npx playwright test suspect.spec.ts --repeat-each=50 --workers=1`
  to loop; `--retries=2` in CI only to *label* flake (any survived-on-retry is a
  finding), never as a cure. Order isolation: run the file alone vs. in the suite.
- **Jest / Vitest:** loop the test (`for i in {1..50}; do npx jest -t 'name' || break; done`),
  or run with `--runInBand` vs. parallel to expose shared state; `--shuffle`
  (Vitest `sequence.shuffle`) to expose ordering.
- **pytest:** `pytest --count=50 test_x.py` (`pytest-repeat`), `pytest-flakefinder`,
  and `pytest-randomly` to shuffle order + vary seed. Full commands in `reference.md`.

## Quantification — flake rate & per-test score

A metric that gates, not a vibe. See `reference.md` for worked numbers.

- **Suite flake rate** = `runs that passed-only-after-retry ÷ total runs`. This is
  your headline gate (e.g. `qa-strategy` blocks the merge lane above a threshold).
- **Per-test flake score** = over the last N runs on unchanged code,
  `flips ÷ N`, where a *flip* is a pass↔fail transition (or a pass-after-retry).
  A test that fails 5/100 runs on identical code scores 0.05.
- **Crossing the threshold:** any test with flake score **> 1%** (or ≥ 1
  pass-on-retry in a rolling window) is triaged immediately: fix at root or
  quarantine. Score is the queue order; blast radius (blocks trunk? critical
  path?) is the tie-breaker.

## Quarantine policy — a holding pen with a lease, not a graveyard

Quarantine buys time to fix; it is not a place tests go to die. Every quarantine
carries an owner, an issue, and an SLA — no exceptions.

| ✅ Required for every quarantine | ❌ Rejected |
|----------------------------------|------------|
| Tag `@flaky` (or `test.fixme`/`skip` w/ reason) | Silent `test.skip` with no note |
| Move to a **non-blocking** CI lane | Leave it flaking in the merge gate |
| Named **owner** on the hook | "Team owns it" (nobody owns it) |
| **Tracking issue** linked in the tag/comment | Quarantine with no paper trail |
| **SLA** (e.g. 2 weeks) with a due date | Quarantine forever |
| Un-quarantine only after **N consecutive green** runs | Re-enable on one lucky pass |
| SLA breach → **auto-escalate** to fix-or-delete decision | Let it rot indefinitely |

- Quarantined tests still **run** (in the non-blocking lane) so you keep signal and
  can measure the flake score trending to zero.
- **Deleting** a quarantined test is a legitimate *outcome* of a breached SLA — but
  only as a deliberate, owned decision that the coverage is worth less than the
  noise, never as a reflex to turn CI green.

## Root-cause playbook

Fix the cause the taxonomy named. Recipes with before/after code in `reference.md`.

- **Async / timing** → replace `sleep`/`waitForTimeout` with web-first,
  auto-retrying assertions (`await expect(locator).toBeVisible()`); wait on the
  actual response/state, not a guessed duration.
- **Shared state & ordering** → give every test its own fresh state in
  setup/teardown; no cross-test globals, DB rows, or files; make tests pass in any
  order and in parallel.
- **External dependencies** → mock only what you don't own; stub the third-party
  boundary deterministically; keep one real-integration lane where a bounded retry
  is acceptable because the flake is genuinely the network.
- **Animations** → disable animations/transitions in test config
  (`reducedMotion`, CSS override); assert on the settled post-transition state.
- **Time / locale / randomness** → freeze the clock (`sinon.useFakeTimers`,
  `jest.useFakeTimers`, `freezegun`); pin `TZ` and locale; seed the RNG so the
  "random" input is reproducible.
- **Resource leaks** → close connections, clear timers, dispose browser
  contexts, and reset pools in teardown; cap worker concurrency if the leak is
  environmental.

## Anti-patterns — smells to reject

| ❌ Smell | ✅ Fix |
|---------|--------|
| `retries: 3` on trunk to make it green | `retries: 0` on trunk; measure flake rate; fix root cause |
| `await page.waitForTimeout(2000)` / `time.sleep(2)` | Web-first assertion or wait-for-condition |
| Deleting the failing test to unblock CI | Quarantine with owner + issue + SLA; delete only as an owned SLA-breach decision |
| `test.skip` with no owner, issue, or SLA | Tag `@flaky`, link issue, assign owner, set due date |
| Quarantine forever, nobody looks again | SLA + auto-escalate on breach; un-quarantine after N green |
| "Just re-run CI until it's green" | Re-run *counts* as a flake data point, not a pass |
| Shared global fixture mutated across tests | Per-test fresh state; isolate setup/teardown |
| `beforeAll` seeding that later tests depend on | `beforeEach` per-test seed; no ordering assumptions |
| Real third-party call in a unit/E2E happy-path | Mock what you don't own; isolate the live integration lane |
| Screenshot assert during a transition | Disable animations; assert the settled state |
| `Math.random()` / `Date.now()` in the assertion path | Seed RNG; freeze the clock |
| "Passed on the second try, closing" | Not a pass — reproduce, classify, fix |

## Works well with

Soft pointers — none is a hard dependency, but flake triage compounds with:

- **`playwright-e2e`** — web-first waiting and per-test isolation eliminate the two
  most common flake causes (async/timing, shared state) at the source. Most
  browser flake is a `playwright-e2e` guardrail that was skipped.
- **`test-pyramid`** — the surest way to kill flaky E2E is to not have it: push
  logic down to unit/integration where determinism is cheap. A flake at the E2E
  tip is often a signal the test belongs lower.
- **`qa-strategy`** — feed the flake rate up as a *gated* metric (merge blocked /
  alerted above threshold), so triage has teeth instead of being goodwill.
- **`ui-test-auditor`** — over-broad UI tests that assert data through the browser
  flake far more than focused ones; demote them (audit → API/unit) and the flake
  disappears with the round-trip.

## Inputs and outputs

- `reference.md` — runnable rerun/detection commands (Playwright, Jest/Vitest,
  pytest), the flake-rate + flake-score formulas with worked numbers, the full
  quarantine workflow (tag → issue → SLA → CI lane config), and per-cause
  before/after fix recipes.
