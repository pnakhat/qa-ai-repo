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
          // The next three are already the defaults — stated so nobody "fixes" them.
          animations: 'disabled',
          caret: 'hide',
          scale: 'css',
          // Screenshot-only CSS (hide scrollbars, chat widgets); never affects the test run.
          stylePath: './tests/visual/screenshot.css',
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
the top level instead. `expect.toHaveScreenshot.pathTemplate` overrides
`snapshotPathTemplate` for screenshots only, if text/aria snapshots should live
elsewhere.

`tests/visual/screenshot.css`, applied only while capturing:

```css
/* Hide what's legitimately dynamic and can't be frozen or masked cleanly. */
::-webkit-scrollbar { display: none; }
[data-testid="chat-launcher"], iframe[src*="ads"] { visibility: hidden !important; }
```

Prefer `visibility: hidden` (keeps layout) over `display: none` (reflows the page
and hides layout bugs).

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

import type { Locator } from '@playwright/test';

export const test = base.extend<{ stabilize: (ready?: Locator) => Promise<void> }>({
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

  // On-demand (not auto): call `await stabilize(readyLocator)` right before each
  // screenshot. Readiness is a web-first assertion on real content — not
  // 'networkidle', which Playwright discourages for tests (polling, analytics and
  // websockets keep it from ever settling, or it settles before data renders).
  stabilize: async ({ page }, use) => {
    await use(async (ready) => {
      if (ready) await expect(ready).toBeVisible();
      await page.mouse.move(0, 0); // no accidental :hover state
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
  const dashboard = page.getByTestId('dashboard');
  await expect(page.getByRole('progressbar')).toBeHidden(); // spinner gone
  await stabilize(dashboard);        // content visible, fonts + images ready, clock frozen
  await expect(dashboard).toHaveScreenshot('dashboard.png');
});

// Logged-out views in a project that uses storageState auth:
test.describe('logged out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('login form', async ({ page, stabilize }) => {
    await page.goto('/');
    const form = page.getByRole('form', { name: 'Login' });
    await stabilize(form);
    await expect(form).toHaveScreenshot('login-form.png');
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
  const feed = page.getByRole('feed');
  await stabilize(feed);
  await expect(feed).toHaveScreenshot('feed.png');
});
```

When the view must come from the real backend, seed fixed content in a fixture
and delete it afterwards. The unique key keeps parallel workers apart; the
rendered values stay fixed so the pixels don't change:

```ts
import { randomUUID } from 'node:crypto';

export const test = base.extend<{ seededProject: { id: string } }>({
  seededProject: async ({ request }, use, testInfo) => {
    const key = `vr-w${testInfo.workerIndex}-${randomUUID().slice(0, 6)}`;   // never rendered
    const res = await request.post('/api/projects', {
      data: { externalKey: key, name: 'Website redesign', tasks: FIXED_TASKS },
    });
    const project = await res.json();
    await use(project);
    await request.delete(`/api/projects/${project.id}`);   // runs even if the screenshot failed
  },
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
  maskColor: '#FF00FF',   // the default, stated explicitly: masked areas are obvious in diffs
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
# Get it with: npx playwright --version   → e.g. "Version 1.63.0" → v1.63.0-noble
# (-noble = Ubuntu 24.04; -jammy = 22.04. Pick one and keep it — the distro changes fonts.)
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
# --ipc=host + --init are Playwright's recommended flags (Chromium can run out
# of shared memory and crash without --ipc=host).
docker build -f Dockerfile.visual -t app-visual .
docker run --rm --ipc=host --init -v "$PWD/tests:/app/tests" app-visual \
  npx playwright test --project=visual --update-snapshots=changed

# Now review the changed PNGs in git before committing.
git status tests/visual/__screenshots__
```

The app under test must be reachable **from inside the container**: let
Playwright's `webServer` start it in the container (the `COPY . .` above), or
point `baseURL` at a deployed preview. `localhost` inside the container is not
your host.

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
3. Only for **intended** changes, run `--update-snapshots=changed` **in the
   container** (`changed` is what a bare `-u` means; avoid `all`, which rewrites
   passing PNGs too).
4. **Review the PNG diff in the PR** — a changed baseline is a reviewed artifact.
5. Update **selectively** — target the specific test, don't blanket the suite:

```bash
docker run --rm --ipc=host --init -v "$PWD/tests:/app/tests" app-visual \
  npx playwright test dashboard.spec.ts --update-snapshots=changed
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
      options: --user 1001   # as in Playwright's CI docs; avoids root-owned files in the workspace
    steps:
      - uses: actions/checkout@v6
      - run: npm ci
      - name: Run visual tests
        run: npx playwright test --project=visual --update-snapshots=none
        # Compare-only: CI never regenerates. `none` also stops a missing
        # baseline being written into the throwaway CI workspace.

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
npx playwright test dashboard.spec.ts -u                # update ONE spec, mode 'changed' (in container)
npx playwright show-report                               # open the HTML report + diffs
npx playwright test --grep @visual                       # run only tagged visual tests
```
