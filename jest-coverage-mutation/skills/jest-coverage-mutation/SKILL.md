---
name: jest-coverage-mutation
description: Measure and improve the effectiveness of Jest unit tests using code coverage plus mutation testing (Stryker). Use when asked to "check test coverage", "are our tests any good", "add mutation testing", "improve test quality", or when coverage is high but bugs still slip through. Explains why coverage alone is misleading and how to act on survived mutants.
---

# Jest Coverage & Mutation Testing

Coverage tells you what code **ran** during tests. Mutation testing tells you
whether your tests would **catch a bug** in that code. You need both: coverage to
find untested code, mutation to find *weakly* tested code (executed but not
asserted). See `reference.md` for config and commands.

## The core idea

- **Line/branch coverage can be 100% with zero real assertions** — a test that
  calls a function but checks nothing still "covers" it.
- **Mutation testing** deliberately introduces small faults ("mutants") into the
  source (e.g. `>` → `>=`, `+` → `-`, `true` → `false`, remove a statement) and
  re-runs the tests. If a test fails, the mutant is **killed** (good). If tests
  still pass, the mutant **survived** — a real bug would have slipped through.
- **Mutation score** = killed / (killed + survived). This is your real
  test-effectiveness metric; treat it as the quality bar, coverage as the floor.

## Workflow

1. **Coverage first (cheap).** Turn on Jest coverage with a sensible
   `coverageThreshold` and `collectCoverageFrom` scoped to source (not tests/
   configs). Fix the obvious gaps — untested files, uncovered branches.
2. **Then mutation (where it matters).** Run Stryker on the high-value / high-risk
   modules (business logic, calculations, validators, reducers). Don't mutate the
   whole repo on day one — it's slow.
3. **Read the survived mutants.** Each survivor points at a specific weak spot:
   the code path is executed but the assertion doesn't pin down the behavior.
4. **Kill mutants by strengthening tests**, not by deleting mutators:
   - Add/tighten assertions (assert the *value*, not just "no throw").
   - Cover boundary conditions the mutant exposed (`>=` vs `>`, off-by-one).
   - Add missing negative/error cases.
5. **Set thresholds and gate CI.** Fail the build below a mutation `break`
   threshold on the modules you've committed to; ratchet it up over time.

## Interpreting Stryker results

- **Killed** — a test caught the mutation. 
- **Survived** — no test caught it → weak or missing assertion. **Act on these.**
- **No coverage** — the mutated code wasn't executed at all → a *coverage* gap,
  fix with a new test.
- **Timeout** — usually counts as killed (mutation caused an infinite loop the
  runner aborted).
- **Runtime/compile error** — invalid mutant, ignore.
- Watch the **mutation score** on the modules you care about, not a repo-wide
  average that hides weak hotspots.

## Keep it fast (mutation testing is expensive)

- Scope with `mutate` globs to the code that matters; exclude generated/config.
- Use Stryker **`--incremental`** to only re-test changed code between runs.
- Use **`--since`** to mutate only what changed vs a git ref (great for PRs).
- Tune `concurrency`; run full-repo mutation **nightly**, changed-files on PRs.

## Principles

- Coverage is necessary, not sufficient — never ship "100% coverage" as proof of
  quality; show the **mutation score**.
- Chase survivors, not the number. A killed mutant = a bug your suite now catches.
- Focus mutation on logic-dense, high-risk code; UI glue and thin wrappers give
  low return.
- A test that can't kill a mutant is documentation, not verification — fix or
  remove it.
