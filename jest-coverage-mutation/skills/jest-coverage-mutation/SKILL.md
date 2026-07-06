---
name: jest-coverage-mutation
description: Measure and improve the effectiveness of Jest unit tests using code coverage plus mutation testing (Stryker). Enforces guardrails against coverage theater — assertion-free tests, gamed mutation scores, ignored survivors — and gates CI on a mutation break threshold, not just coverage %. Use when asked to "check test coverage", "are our tests any good", "add mutation testing", "improve test quality", or when coverage is high but bugs still slip through. Explains why coverage alone is misleading and how to act on survived mutants. See `reference.md` for config, a worked before/after example, and commands.
---

# Jest Coverage & Mutation Testing

Coverage tells you what code **ran** during tests. Mutation testing tells you
whether your tests would **catch a bug** in that code. You need both: coverage to
find untested code, mutation to find *weakly* tested code (executed but not
asserted). See `reference.md` for config, a worked survivor example, and commands.

## Coverage vs mutation — what each proves

| Question | Coverage answers | Mutation answers |
|----------|------------------|------------------|
| Did this line execute in a test? | ✅ yes/no | — |
| Did a test *assert* on its behavior? | ❌ can't tell | ✅ yes/no |
| Would a real bug here be caught? | ❌ can't tell | ✅ yes/no |
| Is the boundary (`>` vs `>=`) pinned down? | ❌ can't tell | ✅ yes/no |
| Cost to run | cheap (one pass) | expensive (N re-runs) |

Coverage is the **floor** (find code no test touches). Mutation score is the
**quality bar** (find code no test verifies). Report the mutation score, never
coverage % alone.

## The core idea

- **Line/branch coverage can be 100% with zero real assertions** — a test that
  calls a function but checks nothing still "covers" it.
- **Mutation testing** deliberately introduces small faults ("mutants") into the
  source (e.g. `>` → `>=`, `+` → `-`, `true` → `false`, remove a statement) and
  re-runs the tests. If a test fails, the mutant is **killed** (good). If tests
  still pass, the mutant **survived** — a real bug would have slipped through.
- **Mutation score** = killed / (killed + survived), ignoring no-coverage and
  invalid mutants. This is your real test-effectiveness metric.

## Workflow — coverage first, then mutation

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

| Status | Meaning | Action |
|--------|---------|--------|
| **Killed** | A test failed on the mutant | None — this is the goal |
| **Survived** | Mutant ran but no test failed | **Fix.** Add/tighten an assertion to catch it |
| **NoCoverage** | Mutated code never executed | Add a test that exercises the path |
| **Timeout** | Mutant caused a hang; runner aborted | Counts as killed — no action |
| **RuntimeError / CompileError** | Mutant was invalid | Ignored in the score — no action |

Watch the mutation score on the **modules you care about**, not a repo-wide
average that hides weak hotspots.

## Keep it fast (mutation testing is expensive)

- Scope with `mutate` globs to the code that matters; exclude generated/config.
- Use Stryker **`--incremental`** to only re-test changed code between runs.
- Use **`--since`** to mutate only what changed vs a git ref (great for PRs).
- Set `coverageAnalysis: "perTest"` so each mutant only re-runs the tests that
  covered it.
- Tune `concurrency`; run full-repo mutation **nightly**, changed-files on PRs.

## Anti-patterns — smells to reject

| ❌ Smell | ✅ Fix |
|---------|--------|
| "We have 100% coverage" shipped as proof of quality | Report the **mutation score**; coverage is only the floor |
| Test calls the function but has no `expect` | Every test asserts on a **value/outcome**, not just "no throw" |
| Excluding mutators or files to lift the score | Scope by risk, but never delete mutators to game the number |
| `stryker.conf` `mutate` narrowed to already-green files | Mutate the logic-dense code, including where survivors live |
| Mutating the whole repo on every PR (30+ min) | `--since=origin/main --incremental` on PRs, full run nightly |
| Survived mutants triaged as "acceptable" and ignored | Each survivor = an uncaught bug; kill it or justify in writing |
| Chasing the % — adding trivial tests to bump the number | Chase the **survivor**; a killed mutant is a real bug now caught |
| Raising `break` down to whatever today's score is | Set `break` as a floor you won't regress below; ratchet **up** |
| `coverageThreshold` set to 0 / removed to make CI pass | Keep the threshold; fix the tests, not the gate |
| A test that can't kill any mutant | It's documentation, not verification — strengthen or remove it |

## CI wiring

- **PRs stay fast:** always run `jest --coverage` (fails under `coverageThreshold`),
  then `stryker run --since=origin/main --incremental` so only changed logic is
  mutated. A 30-minute full mutation run does not belong on a PR.
- **Gate on the mutation `break` threshold**, not just coverage — Stryker exits
  non-zero below it. Make both the coverage job and the Stryker job **required
  checks**; a red mutation gate blocks merge.
- **Nightly full run:** `stryker run` across the committed scope catches drift and
  survivors that a `--since` diff never touched. Publish the HTML report as an
  artifact.
- **Cache** the incremental file (`reports/stryker-incremental.json`) and
  `.stryker-tmp` between runs so PR mutation stays cheap.
- **Ratchet, don't relax:** raise `break` and per-directory `coverageThreshold`
  over time; never lower a gate to make a red build pass.

See `reference.md` for the runnable Jest + Stryker configs and the PR-vs-nightly
GitHub Actions YAML.

## Principles

- Coverage is necessary, not sufficient — never ship "100% coverage" as proof of
  quality; show the **mutation score**.
- Chase survivors, not the number. A killed mutant = a bug your suite now catches.
- Focus mutation on logic-dense, high-risk code; UI glue and thin wrappers give
  low return.
- A test that can't kill a mutant is documentation, not verification — fix or
  remove it.
