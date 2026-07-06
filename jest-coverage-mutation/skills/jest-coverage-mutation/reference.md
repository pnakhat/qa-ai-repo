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

## CI wiring

```yaml
# PR: fast — coverage always, mutation only on changed code
- run: npx jest --coverage
- run: npx stryker run --since=origin/main --incremental
# Nightly: full-repo mutation to catch drift
- run: npx stryker run
```

Cache the Stryker `.stryker-tmp` / incremental file between runs to speed PRs.

## Other runners
Stryker also has runners for **Vitest**, **Mocha**, and **Jasmine** — same
concepts, swap `testRunner` and the runner package.
