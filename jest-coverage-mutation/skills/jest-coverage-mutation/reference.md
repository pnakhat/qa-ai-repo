# Coverage & Mutation — Setup Reference

## Jest coverage

`jest.config.js` (or `package.json` `jest` block):

```js
module.exports = {
  collectCoverage: true,
  coverageProvider: 'v8',            // fast; use 'babel' if you need full babel semantics
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
invisible in the report.

## Stryker mutation testing (StrykerJS)

Install:
```bash
npm i -D @stryker-mutator/core @stryker-mutator/jest-runner
# TypeScript projects also benefit from the type-checker to discard invalid mutants:
npm i -D @stryker-mutator/typescript-checker
```

`stryker.conf.json`:
```json
{
  "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  "packageManager": "npm",
  "testRunner": "jest",
  "jest": { "projectType": "custom", "configFile": "jest.config.js" },
  "coverageAnalysis": "perTest",
  "mutate": ["src/**/*.{js,ts}", "!src/**/*.spec.*", "!src/**/*.test.*"],
  "reporters": ["html", "clear-text", "progress"],
  "thresholds": { "high": 85, "low": 70, "break": 60 },
  "concurrency": 4,
  "incremental": true
}
```

Run:
```bash
npx stryker run                       # full run; writes reports/mutation/mutation.html
npx stryker run --since=main          # only mutate code changed vs main (PRs)
npx stryker run --incremental         # reuse prior results, re-test only changes
```

- `coverageAnalysis: "perTest"` is the fast path — Stryker only runs the tests
  that covered each mutant.
- `thresholds.break` fails the command (exit non-zero) below that mutation score
  → use it as the CI gate.
- Open `reports/mutation/mutation.html` to see, per file/line, exactly which
  mutants **survived** and what change they represent.

## Reading the mutant status table

| Status | Meaning | What to do |
|--------|---------|------------|
| `Killed` | A test failed when the mutant was applied | Nothing — the suite catches this bug |
| `Survived` | Mutant applied, all tests still passed | **Strengthen a test** to assert the affected behavior |
| `NoCoverage` | Mutated code was never executed by any test | Add a test that exercises the path, then re-check |
| `Timeout` | Mutant caused a hang; Stryker aborted the run | Counts as killed — no action |
| `RuntimeError` | Mutant threw before any assertion (invalid mutant) | Ignored in the score — no action |
| `CompileError` | Mutant failed type-check (TS projects) | Ignored in the score — no action |

Score = `Killed / (Killed + Survived)`. `NoCoverage` is a **coverage** gap, not a
mutation gap — Jest coverage should have caught it first.

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
          fetch-depth: 0          # Stryker --since needs git history

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci

      # Always: coverage gate (fails under coverageThreshold)
      - run: npx jest --coverage

      # Cache Stryker's incremental state so PR mutation stays cheap
      - uses: actions/cache@v4
        with:
          path: |
            reports/stryker-incremental.json
            .stryker-tmp
          key: stryker-${{ github.ref }}-${{ github.sha }}
          restore-keys: stryker-${{ github.ref }}-

      # PR: mutate only changed code vs the base branch
      - name: Mutation (PR — changed code only)
        if: github.event_name == 'pull_request'
        run: npx stryker run --since=origin/${{ github.base_ref }} --incremental

      # Nightly: full-scope mutation to catch drift
      - name: Mutation (nightly — full scope)
        if: github.event_name == 'schedule'
        run: npx stryker run

      - name: Upload mutation report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: mutation-report
          path: reports/mutation/
          retention-days: 14
```

- `thresholds.break` in `stryker.conf.json` makes `stryker run` exit non-zero
  below the floor → the job fails → merge is blocked. Make both the coverage and
  mutation jobs **required checks**.
- `fetch-depth: 0` is required for `--since` to diff against the base branch.
- Ratchet `break` (and per-directory `coverageThreshold`) **up** over time; never
  lower a gate to turn a red build green.

## Other runners
Stryker also has runners for **Vitest**, **Mocha**, and **Jasmine** — same
concepts, swap `testRunner` and the runner package.
