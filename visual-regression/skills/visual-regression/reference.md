# Visual Regression — Setup & Reference

Config, a stabilization fixture, masking, container-based baselines, the
`--update-snapshots` review discipline, and a component-level example.
Check the installed version's docs for API drift; the shapes below are stable.

## Install

```bash
npm i -D @playwright/test
npx playwright install --with-deps    # browsers + OS deps
```

## Config — `playwright.config.ts`

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/visual',
  fullyParallel: true,
  // Fail the build if CI runs a test with no committed baseline — never
  // silently create baselines on CI.
  ignoreSnapshots: false,

  expect: {
    toHaveScreenshot: {
      // Preferred tolerance: scales with image size. Start strict.
      maxDiffPixelRatio: 0.01,
      // Small per-pixel tolerance absorbs anti-aliasing. Never 0.
      threshold: 0.2,
      // Kill animations at capture time as a backstop to the fixture.
      animations: 'disabled',
      // Freeze the caret so text inputs don't flake.
      caret: 'hide',
      scale: 'css',
    },
  },

  // Per-platform, per-project baseline paths so a Linux baseline is never
  // compared against a macOS render.
  snapshotPathTemplate:
    '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',

  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 }, // pinned
        deviceScaleFactor: 1,                    // pinned — 1x vs 2x diffs everywhere
      },
    },
  ],
});
```

## Stabilization fixture — `tests/visual/fixtures.ts`

Extend `@playwright/test` so every visual test starts from a frozen, font-ready,
animation-free page. Import `test`/`expect` from here, not from `@playwright/test`.

```ts
import { test as base, expect } from '@playwright/test';

const FROZEN_TIME = new Date('2026-01-01T12:00:00Z');

export const test = base.extend({
  page: async ({ page }, use) => {
    // 1. Freeze the clock BEFORE any app code runs.
    await page.clock.setFixedTime(FROZEN_TIME);

    // 2. Kill animations/transitions globally as a CSS backstop.
    await page.addInitScript(() => {
      const style = document.createElement('style');
      style.textContent = `*, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
      }`;
      document.documentElement.appendChild(style);
    });

    await use(page);
  },

  // Auto-fixture: wait for fonts + network idle before any assertion.
  stabilize: [
    async ({ page }, use) => {
      await use(async () => {
        await page.waitForLoadState('networkidle');
        await page.evaluate(() => document.fonts.ready);
      });
    },
    { auto: false },
  ],
});

export { expect };
```

Usage:

```ts
import { test, expect } from './fixtures';

test('dashboard renders', async ({ page, stabilize }) => {
  await page.goto('/dashboard');
  await stabilize();                 // fonts loaded, network idle, clock frozen
  await expect(page).toHaveScreenshot('dashboard.png');
});
```

## Seeding / mocking dynamic data

Never snapshot live data. Route the API to a fixed response before navigating:

```ts
test('feed is deterministic', async ({ page, stabilize }) => {
  await page.route('**/api/feed', route =>
    route.fulfill({ json: { items: FIXED_FEED } }),
  );
  await page.goto('/feed');
  await stabilize();
  await expect(page).toHaveScreenshot('feed.png');
});
```

## Masking dynamic regions

Mask what you can't freeze — keeps the rest of the frame strict.

```ts
await expect(page).toHaveScreenshot('account.png', {
  mask: [
    page.getByTestId('last-updated'),          // relative timestamp
    page.getByRole('img', { name: /avatar/ }), // user-uploaded image
    page.getByTestId('promo-banner'),          // rotating ad
  ],
  maskColor: '#FF00FF',   // explicit mask fill so masked areas are obvious in diffs
  maxDiffPixelRatio: 0.01,
});
```

## Component-level snapshot

Prefer the smallest meaningful region. With Playwright component testing:

```ts
// Button.spec.tsx — @playwright/experimental-ct-react
import { test, expect } from '@playwright/experimental-ct-react';
import { Button } from '../src/Button';

test('primary button — default and hover', async ({ mount, page }) => {
  const component = await mount(<Button variant="primary">Save</Button>);
  await page.evaluate(() => document.fonts.ready);

  await expect(component).toHaveScreenshot('button-primary.png');

  await component.hover();
  await expect(component).toHaveScreenshot('button-primary-hover.png');
});
```

In an E2E flow, clip to a region instead of the whole page by asserting on the
locator, not `page`:

```ts
await expect(page.getByTestId('order-summary'))
  .toHaveScreenshot('order-summary.png');
```

## Baselines from the CI container — Dockerfile

Pin the Playwright image to the exact version in `package.json` so anti-aliasing
matches CI. Generate and update baselines through this image only.

```dockerfile
# Dockerfile.visual — tag MUST match the installed @playwright/test version
FROM mcr.microsoft.com/playwright:v1.50.0-noble
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
CMD ["npx", "playwright", "test", "--config=playwright.config.ts"]
```

Update baselines locally *through the container* (never on the host):

```bash
# Regenerate baselines in the same Linux image CI uses.
docker build -f Dockerfile.visual -t app-visual .
docker run --rm -v "$PWD/tests:/app/tests" app-visual \
  npx playwright test --update-snapshots

# Now review the changed PNGs in git before committing.
git status tests/visual/__screenshots__
```

## `--update-snapshots` review discipline

`--update-snapshots` overwrites baselines. Treat it as a deliberate act, never a
reflex to clear a red board.

1. **Reproduce the diff** and open the `-diff.png` / `-actual.png` artifacts.
2. **Classify** each change: intended / real regression / nondeterminism.
3. Only for **intended** changes, run `--update-snapshots` **in the container**.
4. **Review the PNG diff in the PR** — a changed baseline is a reviewed artifact.
5. Update **selectively** — target the specific test, don't blanket the suite:

```bash
docker run --rm -v "$PWD/tests:/app/tests" app-visual \
  npx playwright test dashboard.spec.ts --update-snapshots
```

Never wire `--update-snapshots` into the default CI test job — that auto-accepts
every regression.

## CI wiring — GitHub Actions

Run tests in the pinned container; upload diffs as artifacts on failure.

```yaml
jobs:
  visual:
    runs-on: ubuntu-latest
    container:
      image: mcr.microsoft.com/playwright:v1.50.0-noble   # matches package.json
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - name: Run visual tests
        run: npx playwright test --config=playwright.config.ts
        # No --update-snapshots here: CI compares, it never regenerates.

      - name: Upload visual diffs
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: visual-diffs
          path: |
            test-results/**/*-diff.png
            test-results/**/*-actual.png
            test-results/**/*-expected.png
          retention-days: 14
```

A changed baseline shows up in the PR diff and must be approved by a reviewer
before merge — the visual contract never changes without a human in the loop.

## Useful commands

```bash
npx playwright test --config=playwright.config.ts        # compare against baselines
npx playwright test dashboard.spec.ts --update-snapshots # update ONE spec (in container)
npx playwright show-report                               # open the HTML report + diffs
npx playwright test --grep @visual                       # run only tagged visual tests
```
