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

Most repos already have an e2e config. Add visual tests as **their own project**
so screenshot settings, paths, and pinned viewport don't leak into existing
specs. `expect` and `snapshotPathTemplate` are both valid per-project options.

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // ...existing top-level config (testDir, use.baseURL, reporter) unchanged...
  projects: [
    // ...existing projects (setup, chromium, …) unchanged...
    {
      name: 'visual',
      testDir: './tests/visual',
      // dependencies: ['setup'],           // if the app needs auth state
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 }, // pinned
        deviceScaleFactor: 1,                    // pinned — 1x vs 2x diffs everywhere
      },
      expect: {
        toHaveScreenshot: {
          maxDiffPixelRatio: 0.01, // preferred tolerance: scales with image size. Start strict.
          threshold: 0.2,          // small per-pixel tolerance absorbs anti-aliasing. Never 0.
          animations: 'disabled',  // backstop to the fixture's CSS
          caret: 'hide',
          scale: 'css',
        },
      },
      // {platform} keeps a Linux baseline from ever being compared against a
      // macOS render. Without it, per-platform baselines collide.
      snapshotPathTemplate:
        '{testDir}/__screenshots__/{platform}/{projectName}/{testFilePath}/{arg}{ext}',
    },
  ],
});
```

For a visual-only repo, the same `expect` and `snapshotPathTemplate` keys work at
the top level instead.

Keep the visual project out of the default e2e script until baselines exist for
the CI platform, e.g. `"test:e2e": "playwright test --project=chromium"` and
`"test:visual": "playwright test --project=visual"`. Otherwise a plain
`playwright test` on Linux CI fails on missing baselines.

## Stabilization fixture — `tests/visual/fixtures.ts`

Every visual test should start from a frozen, font-ready, animation-free page.
Import `test`/`expect` from here, not from `@playwright/test`. **If the project
already has a fixtures file (page objects, auth), extend that instead of
`@playwright/test`** so visual tests reuse the same page objects.

```ts
// Extend the app's fixtures if they exist: import { test as base, expect } from '../fixtures';
import { test as base, expect } from '@playwright/test';

const FROZEN_TIME = new Date('2026-01-01T12:00:00Z');

export const test = base.extend<{ stabilize: () => Promise<void> }>({
  page: async ({ page }, use) => {
    // 1. Freeze the clock BEFORE any app code runs. setFixedTime pins Date only;
    //    use page.clock.install() + pauseAt() if timers drive what's rendered.
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

  // On-demand (not auto): call `await stabilize()` right before each screenshot.
  stabilize: async ({ page }, use) => {
    await use(async () => {
      await page.waitForLoadState('networkidle');
      await page.evaluate(async () => {
        await document.fonts.ready;
        // Images still decoding render blank or half-painted.
        await Promise.all(
          Array.from(document.images).map((img) => img.decode().catch(() => {})),
        );
        (document.activeElement as HTMLElement | null)?.blur();
      });
    });
  },
});

export { expect };
```

Usage:

```ts
import { test, expect } from './fixtures';

test('dashboard renders', async ({ page, stabilize }) => {
  await page.goto('/dashboard');
  await stabilize();                 // fonts + images ready, network idle, clock frozen
  await expect(page.getByTestId('dashboard')).toHaveScreenshot('dashboard.png');
});

// Logged-out views in a project that uses storageState auth:
test.describe('logged out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('login form', async ({ page, stabilize }) => {
    await page.goto('/');
    await stabilize();
    await expect(page.getByRole('form', { name: 'Login' })).toHaveScreenshot('login-form.png');
  });
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
# Get it with: npx playwright --version   → e.g. 1.63.0 → v1.63.0-noble
FROM mcr.microsoft.com/playwright:v<PLAYWRIGHT_VERSION>-noble
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

## First baselines and proving stability

Creating baselines for new tests (in the container):

```bash
npx playwright test --project=visual --update-snapshots=missing
```

`missing` writes only absent baselines and never overwrites existing ones. On
that first run Playwright reports the new tests as **failed** with
`A snapshot doesn't exist at …, writing actual.` That's expected: the PNG was
written. Open each new PNG and check it shows the right thing before going on.

Then prove the baselines are stable: compare only, several times:

```bash
npx playwright test --project=visual --update-snapshots=none --repeat-each=3
```

Any failure here is nondeterminism. Fix the test, don't re-baseline.

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
      image: mcr.microsoft.com/playwright:v<PLAYWRIGHT_VERSION>-noble   # must equal installed @playwright/test
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
