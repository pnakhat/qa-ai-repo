# Accessibility Testing — Setup & Reference

Working axe-core wiring, rule/tag config, a manual checklist, contrast
thresholds, and a CI gate. Check each library's installed-version docs for API
drift; the shapes below are stable.

## Install

```bash
# Playwright page/E2E-level scanning
npm i -D @axe-core/playwright

# Component/unit-level scanning (pick one to match your runner)
npm i -D jest-axe            # Jest
npm i -D vitest-axe          # Vitest

# Storybook a11y addon (+ the Vitest addon to run the checks as tests in CI)
npx storybook add @storybook/addon-a11y
npx storybook add @storybook/addon-vitest

# Cypress (if that's your E2E stack)
npm i -D cypress-axe axe-core
```

## `@axe-core/playwright` — fixture-level assertion

Wrap axe once as a fixture so any spec can assert a page is clean.

`tests/fixtures/a11y.ts`:

```ts
import { test as base, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

type A11yFixtures = {
  checkA11y: (opts?: { include?: string; exclude?: string }) => Promise<void>;
};

export const test = base.extend<A11yFixtures>({
  checkA11y: async ({ page }, use, testInfo) => {
    await use(async ({ include, exclude } = {}) => {
      let builder = new AxeBuilder({ page })
        // Assert against the WCAG 2.2 AA rule set (see tags below). The
        // wcag22aa tag is what turns on `target-size` — it's off by default.
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
      if (include) builder = builder.include(include);
      if (exclude) builder = builder.exclude(exclude);

      const results = await builder.analyze();

      // Keep the full result (incl. moderate/minor) in the HTML report for triage.
      await testInfo.attach('axe-results', {
        body: JSON.stringify(results.violations, null, 2),
        contentType: 'application/json',
      });

      // Fail only on serious/critical; triage the rest separately.
      const blocking = results.violations.filter(
        v => v.impact === 'serious' || v.impact === 'critical',
      );
      expect(
        blocking,
        blocking.map(v => `${v.id} (${v.impact}): ${v.help} — ${v.helpUrl}`).join('\n'),
      ).toEqual([]);
    });
  },
});

export { expect } from '@playwright/test';
```

`tests/e2e/checkout.a11y.spec.ts`:

```ts
import { test } from '../fixtures/a11y';

test('checkout page has no serious a11y violations', { tag: '@a11y' }, async ({ page, checkA11y }) => {
  await page.goto('/checkout');
  await page.getByRole('heading', { name: 'Checkout' }).waitFor(); // let it settle
  await checkA11y();                       // whole page
  await checkA11y({ include: '#payment' }); // scope to one region
});
```

A scan that needs data seeds it in a fixture and removes it afterwards (the
code after `use()` runs even when the axe assertion fails):

```ts
import { randomUUID } from 'node:crypto';
import { test as a11yTest } from '../fixtures/a11y';

const test = a11yTest.extend<{ cart: { id: string } }>({
  cart: async ({ request }, use, testInfo) => {
    const res = await request.post('/api/carts', {
      data: { ref: `a11y-w${testInfo.workerIndex}-${randomUUID().slice(0, 6)}`,
              items: [{ sku: 'SKU-001', qty: 2 }] },
    });
    const cart = await res.json();
    await use(cart);
    await request.delete(`/api/carts/${cart.id}`);
  },
});

test('filled cart has no serious a11y violations', async ({ page, cart, checkA11y }) => {
  await page.goto(`/cart/${cart.id}`);
  await page.getByRole('heading', { name: 'Your cart' }).waitFor();
  await checkA11y();
});
```

## `jest-axe` / `vitest-axe` — component test

Assert at the component level, where the markup actually lives — cheapest and
fastest place to catch a11y bugs.

```tsx
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { TextField } from './TextField';

expect.extend(toHaveNoViolations);

test('TextField is accessible', async () => {
  const { container } = render(<TextField label="Email" id="email" />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

Vitest: `vitest-axe` exports `axe`, but the matcher is registered differently —
add `import 'vitest-axe/extend-expect'` to the setup file, and use the **jsdom**
environment: `vitest-axe` documents that it does not work under `happy-dom`.

Note: jsdom can't compute layout, so contrast (and `target-size`) can't be
judged at this level — that's expected. Catch them in a real browser
(Playwright/Storybook) instead.

## Storybook a11y addon

`npx storybook add @storybook/addon-a11y` registers the addon in
`.storybook/main.ts`. Set the project-wide policy once in `.storybook/preview.ts`
— `test: 'error'` makes violations **fail** the story test when run through the
Vitest addon (`'todo'` only warns; `'off'` skips):

```ts
// .storybook/preview.ts
export default {
  parameters: {
    a11y: {
      test: 'error',
      options: {
        runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
      },
    },
  },
};
```

Per-story override, used rarely and deliberately:

```ts
export const Default = {
  parameters: {
    a11y: {
      context: '#story-root',  // scope the scan (default: 'body')
      config: {
        // Prefer fixing over disabling. If you must, comment WHY + link a ticket.
        // rules: [{ id: 'color-contrast', enabled: false }], // AVOID
      },
    },
  },
};
```

Run in CI with `npx vitest --project=storybook` (the project name the Vitest
addon set up).

## axe rules & tags — scope, don't silence

Use **tags** to select which WCAG level you assert against:

| Tag | Meaning |
|-----|---------|
| `wcag2a` | WCAG 2.0 Level A |
| `wcag2aa` | WCAG 2.0 Level AA |
| `wcag21a` / `wcag21aa` | WCAG 2.1 A / AA |
| `wcag22aa` | WCAG 2.2 Level AA (today: `target-size`, which is off unless this tag is requested) |
| `best-practice` | axe recommendations beyond WCAG (`region`, `heading-order`, …) — report, optional gate |
| `wcag2a-obsolete` | Rules for 4.1.1 Parsing (`duplicate-id`, `duplicate-id-active`) — deprecated, don't gate on them |
| `EN-301-549` | Rules required by the EU standard (European Accessibility Act audits) |

Tags are a union, not a level: list every level up to your target. `withTags`
replaces axe's default rule selection, so anything you don't tag doesn't run.

**Scoping the scan is legitimate; silencing a rule is not.**

```ts
// ✅ OK: audit one widget without noise from the rest of the page
new AxeBuilder({ page }).include('#date-picker');

// ✅ OK: exclude a third-party iframe you don't control (document why)
new AxeBuilder({ page }).exclude('#stripe-iframe');

// ❌ AVOID: hiding a real failure so the suite goes green
new AxeBuilder({ page }).disableRules(['color-contrast']);
```

If you ever disable a rule, it must be: (1) genuinely out of your control,
(2) commented with the reason, and (3) tracked with a ticket. Otherwise fix the
markup.

## Playwright keyboard, focus, and motion tests

Automate the deterministic parts of the manual review so they don't regress.

```ts
import { test, expect } from '@playwright/test';

test('modal traps and restores focus', { tag: '@a11y' }, async ({ page }) => {
  await page.goto('/settings');
  const trigger = page.getByRole('button', { name: 'Delete account' });
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Delete account?' });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();

  // Tab cycles inside the dialog — focus never escapes to the page behind it.
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Tab');
    await expect(dialog.locator(':focus')).toHaveCount(1);
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();          // focus restored to the trigger
});

test('skip link moves focus to main', { tag: '@a11y' }, async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused(); // main needs tabindex="-1"
});

test('menu exposes the right roles, names, and state', { tag: '@a11y' }, async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Account' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toMatchAriaSnapshot(`
    - button "Account" [expanded]
    - menu:
      - menuitem "Profile"
      - menuitem "Sign out"
  `);
});

test('honours reduced motion', { tag: '@a11y' }, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const hero = page.getByTestId('hero-carousel');
  await expect(hero).toHaveCSS('animation-name', 'none');
});
```

Adapt the selectors/names to the app; the ARIA snapshot shape above is
illustrative — generate the real one with `npx playwright codegen` or the
first failing run and review it before committing.

## Manual keyboard checklist (copy-paste)

```
[ ] Tab through the whole page — every interactive element is reachable
[ ] Tab order matches the visual/reading order
[ ] Focus is visible on every focusable element (no invisible focus)
[ ] No keyboard trap — Tab / Shift+Tab / Esc always escapes
[ ] Skip-to-content link is present and works
[ ] Enter / Space activate buttons; Enter follows links
[ ] Arrow keys work where expected (menus, tabs, radios, listboxes)
[ ] Esc closes modals/menus and returns focus to the trigger
[ ] Opening a modal moves focus in and traps it while open
[ ] Route change moves focus to a heading/main, not lost to <body>
[ ] No focusable element is hidden (aria-hidden / display:none) while focusable
[ ] Focused element is never fully covered by sticky header/footer/banner (2.4.11)
```

## WCAG 2.2 additions checklist (copy-paste)

```
[ ] 2.4.11 Focus Not Obscured — tab through with sticky UI and cookie banner open
[ ] 2.5.7 Dragging Movements — every drag has a click/tap alternative
[ ] 2.5.8 Target Size — targets >= 24x24 CSS px or spaced (inline links exempt)
[ ] 3.2.6 Consistent Help — help/contact in the same relative place on each page
[ ] 3.3.7 Redundant Entry — previously entered data is pre-filled or selectable
[ ] 3.3.8 Accessible Authentication — paste + password managers work, autocomplete
        set (username/current-password/one-time-code), no cognitive-only CAPTCHA
[ ] (4.1.1 Parsing is obsolete in WCAG 2.2 — not reported)
```

## Manual screen-reader checklist (copy-paste)

```
[ ] Every control announces a correct role (button, link, checkbox, …)
[ ] Every control has a meaningful accessible name (not "button", not "link")
[ ] State is announced (expanded/collapsed, checked, selected, current)
[ ] Headings form a logical outline (h1 → h2 → h3, no skipped levels)
[ ] Images: informative have alt text; decorative have alt=""
[ ] Form fields announce their label, required state, and errors
[ ] Async updates announce via a live region (aria-live / role="status")
[ ] Reading order matches the visual order
[ ] Landmarks present (header/nav/main/footer or roles) for navigation
```

### Screen-reader quick keys

| Action | VoiceOver (macOS) | NVDA (Windows) |
|--------|-------------------|----------------|
| Start / stop | `Cmd + F5` | `Ctrl + Alt + N` / `Insert + Q` |
| Read next item | `VO + →` (`VO` = `Ctrl+Option`) | `↓` |
| Next heading | `VO + Cmd + H` | `H` |
| Next form control | `VO + Cmd + J` | `F` |
| Next landmark | Rotor (`VO + U`) → Landmarks | `D` |
| Open elements list / rotor | `VO + U` | `Insert + F7` |
| Next link | `VO + Cmd + L` | `K` |
| Next table | `VO + Cmd + T` | `T` |

## Contrast thresholds (WCAG 2.2 AA)

| Content | Minimum ratio |
|---------|---------------|
| Normal text (< 18.66px, or < 24px non-bold) | **4.5:1** |
| Large text (≥ 24px, or ≥ 18.66px bold) | **3:1** |
| UI components & graphical objects (borders, icons, focus indicators) — 1.4.11 | **3:1** against adjacent colors |
| Disabled controls | No requirement (but keep usable) |

AAA (aspirational): 7:1 normal / 4.5:1 large. Gate on AA.

Large text: 18pt ≈ 24 CSS px, or 14pt bold ≈ 18.66 CSS px. Text over images or
gradients: measure the worst-case spot — axe reports these as "needs review"
(`incomplete`), not as passes.

## CI gate — fail on new violations (GitHub Actions)

Run the a11y suite as a required check; store the axe report on failure.

```yaml
- name: Accessibility tests
  run: npx playwright test --grep @a11y
  env:
    BASE_URL: ${{ vars.STAGING_URL }}

- name: Upload a11y report
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: a11y-report
    path: playwright-report/
    retention-days: 14
```

To **fail only on new** violations (ratchet on a legacy codebase), diff the
current axe violation ids against a committed baseline and fail if the set grows
— never by loosening the rule set. Shrink the baseline over time; never add to
it silently.

Fingerprint **rule id + element target**, not rule id alone — keyed on rule id
only, a brand-new unlabeled field passes because `label` is "already known".

```ts
import baselineJson from './a11y-baseline.json' with { type: 'json' };

// ["label|#legacy-search", "color-contrast|.footer a", …]
const baseline = new Set<string>(baselineJson);
const fingerprints = results.violations.flatMap(v =>
  v.nodes.map(n => `${v.id}|${n.target.join(' ')}`),
);
const fresh = fingerprints.filter(f => !baseline.has(f));
expect(fresh, `New a11y violations:\n${fresh.join('\n')}`).toEqual([]);
```

Also review `results.incomplete` ("needs review") — axe couldn't decide those
(contrast over images, etc.); they are manual-check items, not passes.
