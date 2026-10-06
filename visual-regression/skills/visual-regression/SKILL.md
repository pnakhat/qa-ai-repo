---
name: visual-regression
description: Set up reliable Playwright visual regression tests with `toHaveScreenshot` — deterministic screenshots, tuned thresholds, masked dynamic regions, component-scoped snapshots, and container-generated baselines. Enforces guardrails against laptop baselines, zero-threshold noise, blind `--update-snapshots`, and whole-page goldens. Use when adding, tuning, or debugging visual/screenshot tests, or reviewing baseline diffs. See `reference.md` for config, the stabilization fixture, masking, and CI wiring.
---

# Visual Regression Testing

Catch real visual bugs — a broken layout, a clipped button, a lost focus ring —
without a flood of false positives that trains everyone to rubber-stamp diffs.
A visual test is only trustworthy if the *only* thing that can change a pixel is
a change to the UI. Get determinism right first; everything else is tuning.

## Evidence-driven execution

Read [verification.md](verification.md) before selecting the workflow or reporting results. It defines domain-specific failure probes, evidence requirements, and limits on what a passing run proves.

## Determinism first — the #1 cause of flaky visual tests

Every flaky visual test is a determinism bug in disguise. Before you touch a
threshold, eliminate every source of nondeterministic pixels.

| Source of nondeterminism | Fix |
|--------------------------|-----|
| CSS animations & transitions | `toHaveScreenshot` already defaults to `animations: 'disabled'` (finite ones fast-forward, infinite ones reset); add a global stylesheet zeroing `transition`/`animation` for JS-driven motion and the states *before* the shot |
| Time, dates, relative timestamps ("2m ago") | Freeze the clock before navigation. `page.clock.setFixedTime(...)` pins `Date` but timers keep running — enough for rendered dates. If timers drive what's on screen (countdowns, carousels, polling), use `page.clock.install({ time })` + `page.clock.pauseAt(...)` instead |
| Random or live data (feeds, prices, ids) | Seed a fixed dataset or mock the API with `page.route`; never snapshot live production data |
| Web fonts loading late | Bundle/self-host fonts; `await document.fonts.ready` before the snapshot so text isn't captured mid-swap |
| Viewport & `deviceScaleFactor` drift | Pin both in the Playwright project — a 1x vs 2x capture diffs on every pixel |
| OS-level font rendering & anti-aliasing | Generate baselines in the **same container image** as CI — this is non-negotiable (see below) |
| Lazy-loaded images / spinners still spinning | Wait for the real content with a web-first assertion (`await expect(list).toBeVisible()`, spinner `toBeHidden()`) and every `<img>` to decode. Don't rely on `networkidle` — Playwright marks it **discouraged** for tests |
| Caret blink, hover/focus bleed | Caret is hidden by default (`caret: 'hide'`); blur the active element and move the mouse away; capture a deliberate state, not an accidental one |
| Scrollbars, cursor, third-party widgets | Hide them with a screenshot-only stylesheet via `stylePath` — applied during capture only, never changes app behaviour |

## Test data: setup and teardown

Pixels need the *same* data every run; the environment needs *no* data left
behind. Code in `reference.md` → *Seeding / mocking dynamic data*.

- **Mock at the boundary first.** `page.route` with a fixed payload gives
  identical pixels and needs no cleanup — the default for visual tests.
- **When a real backend must render the view**, each test seeds a fixed
  dataset through the API in a fixture (never through the UI, never relying on
  whatever records the environment already holds) and deletes it after
  `await use()`, which runs when the screenshot fails too.
- **Unique ids, stable pixels.** Records still need per-test/worker unique
  keys so parallel runs don't collide — keep them out of the rendered output
  (fixed display names inside a per-test tenant/account), or `mask` them.
- **Prefer no-cleanup isolation**: a per-run tenant or an ephemeral backend in
  the same container stack that renders the baselines.
- **Guard by environment** and never seed or snapshot against production data.
- **Prove it**: `--repeat-each=3 --update-snapshots=none` (already the stability
  check below) also runs fully parallel and leaves no seeded records behind.

## Baselines belong to CI, not your laptop

macOS and Linux render fonts and anti-aliasing differently, so a baseline
captured on your MacBook will diff against the same UI rendered on the CI Linux
runner — on *every* pixel of *every* text edge. The fix is to make baselines a
build artifact of the CI environment, not of whoever ran the test last.

| ✅ Do | ❌ Don't |
|-------|---------|
| Generate/update baselines in the CI Docker image (`mcr.microsoft.com/playwright`) | Run `--update-snapshots` on your laptop and commit the PNGs |
| Pin the Playwright container tag to the version in `package.json` | Let the container version drift from the installed `@playwright/test` |
| Store per-platform baselines when tests run on more than one OS | Share one baseline across macOS + Linux and fight the diffs |
| Commit baselines the CI image produced, reviewed in the PR | Regenerate silently on `main` to make red go green |

**No container runtime available?** You may generate host-platform baselines
to prove the tests are stable, but only because `snapshotPathTemplate` includes
`{platform}` — they land in e.g. `__screenshots__/darwin/` and can never be
compared against Linux CI renders. Flag this loudly in the report, don't present
them as the CI baselines, and leave the container regeneration as a follow-up.

Run updates through `docker run` locally against the Playwright image, or via a
dedicated CI job — see `reference.md` for both.

## Thresholds — start strict, loosen with a reason

`toHaveScreenshot` gives you three knobs; reach for them in this order:

| Option | What it does | Guidance |
|--------|--------------|----------|
| `maxDiffPixels` | Absolute count of differing pixels allowed | Good for tiny fixed regions; brittle as content grows |
| `maxDiffPixelRatio` | Fraction of the image allowed to differ (0–1) | **Preferred** default — scales with image size; start near `0.01` and justify anything higher. Mind the size: 1% of a 1280×800 page is ~10,000 px — enough to hide a missing icon, another reason to snapshot small regions |
| `threshold` | Per-pixel color-distance tolerance (0–1, default `0.2`) | Absorbs subpixel anti-aliasing; **do not set to 0** — that guarantees flakes |

- Start strict, loosen only with a written justification in the PR (what dynamic
  content forced it). A creeping `maxDiffPixelRatio` is a masked determinism bug.
- Set defaults in config under `expect.toHaveScreenshot`; override per-assertion
  only where a specific view genuinely needs it.
- Keep **per-platform baseline files** via `snapshotPathTemplate` so a Linux
  baseline never gets compared against a macOS render.
- `threshold` is perceptual (YIQ color distance), not a percentage: it decides
  whether *a pixel* differs; `maxDiffPixels`/`maxDiffPixelRatio` decide how many
  differing pixels fail the test. Tune them separately.

## Masking dynamic regions

When a region is legitimately dynamic and can't be frozen, mask it instead of
loosening the whole-image threshold — masking keeps the rest of the shot strict.

```ts
await expect(page).toHaveScreenshot('dashboard.png', {
  mask: [
    page.getByTestId('last-updated'),   // timestamps
    page.getByRole('img', { name: /avatar/ }),
    page.getByTestId('promo-carousel'), // rotating content
  ],
  maxDiffPixelRatio: 0.01,
});
```

Mask timestamps, user avatars, ads/promos, carousels, and any live counter.
Masks paint the locator's box (`maskColor`, default `#FF00FF`); layout around it
is still compared. If the region's *size* varies too, fix its size with
`stylePath` CSS or freeze its data instead.
Masking is surgical; a loosened global threshold is a blunt instrument that hides
real regressions everywhere else in the frame.

## Right-size the scope — component over page

Snapshot the **smallest meaningful region**. A full-page golden that exists to
check one button breaks on every unrelated layout change and buries the signal.

| ✅ Component / region snapshot | ❌ Full-page golden |
|-------------------------------|---------------------|
| `expect(locator).toHaveScreenshot()` on one component | `expect(page).toHaveScreenshot()` for a single widget |
| Playwright component testing / Storybook stories | One giant image per route covering everything |
| Stable, isolated, fast; diff points at the real change | Flaps on any sibling change; diff is a needle in a haystack |
| Reserve page-level shots for layout-critical views | Every view gets a whole-page shot "to be safe" |

- Prefer **component-level** snapshots (Playwright component testing or Storybook)
  where the design system lives — they're isolated and stable.
- Use `expect(locator).toHaveScreenshot()` to clip to a region in an E2E flow.
- Reserve **page-level** snapshots for genuinely layout-critical views (a landing
  page, a print/receipt layout) where the whole composition is the contract.

## Is a screenshot the right assertion?

| You want to pin… | Use |
|------------------|-----|
| Layout, spacing, color, typography, icons — how it *looks* | `toHaveScreenshot` |
| Roles, names, states, structure — what it *is* (also a11y-relevant) | `toMatchAriaSnapshot` — text, cross-platform, no container needed |
| A value, text, or computed result | `toHaveText` / `toHaveValue`, or a unit/API test |
| One CSS property (focus ring color, `display`) | `toHaveCSS` |

A screenshot is the slowest, most environment-sensitive assertion; use it only
for what can't be stated any other way.

## Review workflow — a diff is a question, not a verdict

A failing visual test is asking "did you mean to change this?" Answer it; don't
reflexively update. Triage every diff into exactly one of three buckets:

| Diff cause | Action |
|-----------|--------|
| (a) **Intended change** — you shipped the new look | Update the baseline **deliberately**, in the CI container, reviewed in the PR |
| (b) **Real regression** — the UI broke | Fix the code; the baseline was right |
| (c) **Nondeterminism** — flake, not a real change | Fix the *test* (freeze/mask/pin); do not update the baseline |

- Look at the diff image before deciding — the answer is visible in the red pixels.
- **Never bulk-update** every baseline to clear a red board. That reclassifies
  real regressions (b) and flakes (c) as intended (a) and destroys the signal.
- Baseline changes get reviewed in the PR diff like any other artifact.

**Update modes** (`--update-snapshots` / `-u`):

| Mode | Writes | Use for |
|------|--------|---------|
| `none` | nothing | CI compare-only, stability proofs |
| `missing` | only absent baselines — **the default with no flag** | first baselines for new tests |
| `changed` | mismatched + missing — **the default for a bare `-u`** | updating a reviewed, intended change |
| `all` | every executed snapshot, even passing ones | almost never — rewrites PNGs within tolerance and floods the PR diff |

## Anti-patterns — smells to reject

| ❌ Smell | ✅ Fix |
|---------|--------|
| Baseline PNGs generated and committed from a laptop | Generate in the CI/Docker Playwright image only |
| `--update-snapshots` run with no diff review | Triage each diff (intended / regression / flake) before updating |
| `threshold: 0` chasing pixel-perfection | Keep a small `threshold`; use `maxDiffPixelRatio` for size-scaling tolerance |
| Full-page snapshot to check one component | `expect(locator).toHaveScreenshot()` on the smallest region |
| Timestamps / avatars / live data left unmasked | `mask: [locator]` the dynamic regions; freeze what you can |
| Snapshot captured mid-animation | `animations: 'disabled'` + wait for the settled state |
| One giant golden image per page | Component/region snapshots that pinpoint the change |
| Loosening the global threshold to silence one flaky region | Mask that region; keep the rest strict |
| Baseline regenerated on `main` to turn red green | Fix the cause; update baselines only via reviewed PRs |
| Fonts not awaited, text captured mid-swap | `await document.fonts.ready` before capturing |
| `waitForLoadState('networkidle')` / `waitForTimeout` as the readiness gate | Web-first assertion on the real content, then capture |
| `--update-snapshots=all` to refresh one view | Target the spec with `-u` (`changed`) so passing PNGs aren't rewritten |
| Snapshot of whatever records a shared environment happens to hold | Mock the API, or seed a fixed dataset per test and delete it after `use()` |
| Seeded data shared by many visual tests, one of which edits it | Per-test seed; shared data stays read-only |
| Unique test id (`e2e-8f3a…`) rendered in the shot | Fixed display values in an isolated tenant, or `mask` the id |

## CI wiring

- **Baselines live in the repo**, committed as reviewed artifacts — the visual
  contract is versioned alongside the code.
- The **update job runs in the CI container** (the pinned Playwright image), never
  on a contributor's machine, so anti-aliasing always matches.
- On failure, **upload the diff, actual, and expected PNGs as CI artifacts** so a
  reviewer can see the change without reproducing locally.
- A **review gate before merge**: a changed baseline is a required, human-approved
  part of the PR — no auto-accept of screenshot diffs.
- Run visual tests on the **same OS/arch as the baselines**; if you support more
  than one, matrix the job and keep per-platform baseline files.
- See `reference.md` for the Dockerfile, the update job, and artifact upload YAML.

## Works well with

These pair naturally; none is a hard dependency.

- **`playwright-e2e`** — shares the same runner, fixtures, and stable locators.
  Add `toHaveScreenshot` assertions to journeys you already have specs for, and
  reuse the storage-state auth and seeded data so the visual state is deterministic.
- **`ui-test-auditor`** — visual regression is strictly a UI-level concern. Don't
  snapshot what a unit or API test should assert (business logic, computed values,
  response shape); a screenshot is the wrong, slow, brittle tool for those.
- **`accessibility-testing`** — focus rings, color contrast, and
  `prefers-reduced-motion` states are exactly the kind of thing a visual test can
  pin. Capture the focused and reduced-motion states deliberately as baselines.

For config, the stabilization fixture, masking, the CI container setup, the
`--update-snapshots` discipline, and a component-level example, see `reference.md`.
