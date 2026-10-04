# Coverage & Mutation — Setup Reference

## Jest coverage

`jest.config.js` (or `package.json` `jest` block):

```js
module.exports = {
  // Don't set collectCoverage: true here — it slows every watch/Stryker run.
  // Turn coverage on with `jest --coverage` instead.
  coverageProvider: 'v8',            // default is 'babel'; v8 is faster and needs no instrumentation.
                                     // Stay on 'babel' if you rely on /* istanbul ignore */ semantics.
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!src/**/*.d.ts',
    '!src/**/index.{js,ts}',         // barrels
    '!src/**/*.stories.{js,ts,tsx}',
  ],
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],
  coverageThreshold: {
    global: { statements: 80, branches: 75, functions: 80, lines: 80 },
    // ratchet per-directory for critical code:
    './src/domain/': { statements: 95, branches: 90, functions: 95, lines: 95 },
  },
};
```

Run:
```bash
npx jest --coverage            # writes coverage/, prints table, fails under threshold
open coverage/lcov-report/index.html
```

Read **branch** coverage more than line coverage — uncovered branches are where
logic hides. `collectCoverageFrom` matters: without it, files with *no* tests are
invisible in the report. A threshold value can also be negative — `lines: -10`
means "at most 10 uncovered lines" — handy for ratcheting a legacy directory.

## Stryker mutation testing (StrykerJS)

Install (StrykerJS 10 needs Node.js ≥ 22; pin v9 on Node 20):
```bash
npm i -D @stryker-mutator/core @stryker-mutator/jest-runner
# TypeScript projects: add the checker so type-invalid mutants are discarded up front
npm i -D @stryker-mutator/typescript-checker
npx stryker init                      # optional interactive scaffold
```

`stryker.config.json` (Stryker also finds `stryker.conf.{json,js,mjs,cjs}`):
```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "packageManager": "npm",
  "testRunner": "jest",
  "jest": { "projectType": "custom", "configFile": "jest.config.js", "enableFindRelatedTests": true },
  "coverageAnalysis": "perTest",
  "checkers": ["typescript"],
  "tsconfigFile": "tsconfig.json",
  "mutate": ["src/**/*.{js,ts}", "!src/**/*.spec.*", "!src/**/*.test.*", "!src/**/*.d.ts"],
  "reporters": ["html", "clear-text", "progress", "json"],
  "thresholds": { "high": 85, "low": 70, "break": 60 },
  "incremental": true,
  "ignoreStatic": false
}
```
Drop `checkers`/`tsconfigFile` for plain JS. `concurrency` defaults to
cores−1 (or all cores when ≤ 4) and accepts `"50%"`.

Run:
```bash
npx stryker run                                   # full scope; writes reports/mutation/mutation.html
npx stryker run --incremental                     # reuse reports/stryker-incremental.json
npx stryker run --incremental --force             # re-test everything but refresh the incremental file
npx stryker run --mutate src/pricing.ts:10-40     # one file / line range while killing survivors

# PR: mutate only files changed vs the base branch (there is no --since flag)
CHANGED=$(git diff --name-only --diff-filter=AM origin/main...HEAD -- 'src/*.ts' 'src/*.js' \
  | grep -vE '\.(test|spec)\.' | paste -sd, -)
[ -n "$CHANGED" ] && npx stryker run --incremental --mutate "$CHANGED" || echo "no source changes to mutate"
```

- `coverageAnalysis: "perTest"` (the default) is the fast path — Stryker only
  runs the tests that covered each mutant.
- `thresholds.break` fails the command (exit non-zero) below that mutation score
  → use it as the CI gate. Its default is `null` (never fails), so a config
  without `break` gates nothing.
- `high`/`low` only colour the report (green ≥ high, red < low).
- `"dashboard"` reporter (+ `STRYKER_DASHBOARD_API_KEY`) publishes reports and a
  badge to dashboard.stryker-mutator.io for trend tracking — optional.
- Open `reports/mutation/mutation.html` to see, per file/line, exactly which
  mutants **survived** and what change they represent.

## Reading the mutant status table

| Status | Meaning | What to do |
|--------|---------|------------|
| `Killed` | A test failed when the mutant was applied | Nothing — the suite catches this bug |
| `Survived` | Mutant applied, all tests still passed | **Strengthen a test** to assert the affected behavior |
| `NoCoverage` | Mutated code was never executed by any test | Add a test that exercises the path, then re-check |
| `Timeout` | Mutant caused a hang; Stryker aborted the run | Counts as detected — no action |
| `RuntimeError` | Test runner crashed on the mutant (invalid) | Excluded from the score — no action |
| `CompileError` | Mutant failed type-check (TS projects) | Excluded from the score — no action |
| `Ignored` | Static (with `ignoreStatic`), ignorer plugin, or `// Stryker disable` | Excluded from the score — each needs a written reason |

Mutation score = detected / valid = `(Killed + Timeout) / (Killed + Timeout + Survived + NoCoverage)`.
Score based on covered code drops `NoCoverage` from the denominator. `NoCoverage`
is a **coverage** gap Jest coverage should have flagged first — but it still
counts against the real score.

### Suppressing an equivalent mutant (the only legitimate disable)

```ts
// Stryker disable next-line EqualityOperator: equivalent — i only ever increments by 1
for (let i = 0; i < items.length; i++) { /* ... */ }
```
Scope: one line, one named mutator, with a reason after the colon. `// Stryker
disable all` or a file-wide disable is score-gaming.

## Worked example — survivor → strengthened test

A survived mutant is not abstract: it names the exact line and the exact edit a
real bug could make. Here is the full loop.

**Source under test** — `src/pricing.ts`:

```ts
export function qualifiesForFreeShipping(cartTotal: number): boolean {
  return cartTotal > 50;
}
```

**Weak test** — executes the line, asserts almost nothing:

```ts
import { qualifiesForFreeShipping } from '../src/pricing';

test('free shipping works', () => {
  // calls the function but only checks a value far from the boundary
  expect(qualifiesForFreeShipping(100)).toBe(true);
});
```

This gives **100% line and branch coverage** of `pricing.ts`. Coverage says
"done". Now run mutation:

```bash
npx stryker run
```

**Stryker report** — one mutant SURVIVED:

```
src/pricing.ts:2:10
  Survived  ConditionalExpression   cartTotal > 50  →  cartTotal >= 50
```

The mutant flips `>` to `>=`. With `cartTotal === 50` the two differ: the real
code says "not free", the mutant says "free". The weak test only checks `100`, so
it passes either way — the boundary is unverified. A real off-by-one here would
ship silently.

**Strengthened test** — pins the boundary and both sides:

```ts
import { qualifiesForFreeShipping } from '../src/pricing';

test.each([
  [49.99, false],
  [50,    false],  // exactly at the threshold — kills `>` → `>=`
  [50.01, true],
  [100,   true],
])('qualifiesForFreeShipping(%p) → %p', (total, expected) => {
  expect(qualifiesForFreeShipping(total)).toBe(expected);
});
```

Re-run: the `>= 50` mutant now makes the `[50, false]` case fail, so it is
**Killed**. Coverage was unchanged (still 100%); the mutation score is what moved.

**The rule this illustrates:** you kill a mutant by adding an assertion that
distinguishes the mutated behavior from the real behavior — never by editing
`stryker.conf` to stop generating that mutator.

## CI wiring

PRs must stay fast; the full mutation run goes nightly.

```yaml
# .github/workflows/test-quality.yml
name: test-quality

on:
  pull_request:
  schedule:
    - cron: '0 3 * * *'   # nightly full run

jobs:
  coverage-and-mutation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0          # the PR git diff needs base-branch history

      - uses: actions/setup-node@v4
        with:
          node-version: 22        # StrykerJS 10 requires Node >= 22
          cache: npm
      - run: npm ci

      # Always: coverage gate (fails under coverageThreshold)
      - run: npx jest --coverage

      # Cache Stryker's incremental state so PR mutation stays cheap.
      # Restore from the default branch's latest nightly result.
      - uses: actions/cache@v4
        with:
          path: reports/stryker-incremental.json
          key: stryker-incremental-${{ github.sha }}
          restore-keys: stryker-incremental-

      # PR: mutate only files changed vs the base branch (StrykerJS has no --since)
      - name: Mutation (PR — changed code only)
        if: github.event_name == 'pull_request'
        run: |
          CHANGED=$(git diff --name-only --diff-filter=AM origin/${{ github.base_ref }}...HEAD -- 'src/*.ts' 'src/*.js' \
            | grep -vE '\.(test|spec)\.' | paste -sd, -)
          if [ -z "$CHANGED" ]; then echo "No source changes to mutate"; exit 0; fi
          npx stryker run --incremental --mutate "$CHANGED"

      # Nightly: full-scope mutation to catch drift incremental can't see
      # (deps, env, config, snapshots); --force refreshes the incremental file.
      - name: Mutation (nightly — full scope)
        if: github.event_name == 'schedule'
        run: npx stryker run --incremental --force

      - name: Upload mutation report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: mutation-report
          path: reports/mutation/
          retention-days: 14
```

- `thresholds.break` in the Stryker config makes `stryker run` exit non-zero
  below the floor → the job fails → merge is blocked. Make both the coverage and
  mutation jobs **required checks**.
- `fetch-depth: 0` is required for the `git diff` against the base branch.
- Ratchet `break` (and per-directory `coverageThreshold`) **up** over time; never
  lower a gate to turn a red build green.

## Other runners
Stryker also has runners for **Vitest**, **Mocha**, and **Jasmine** — same
concepts, swap `testRunner` and the runner package.
