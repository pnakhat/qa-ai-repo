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

# Storybook a11y addon
npm i -D @storybook/addon-a11y

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
  checkA11y: async ({ page }, use) => {
    await use(async ({ include, exclude } = {}) => {
      let builder = new AxeBuilder({ page })
        // Assert against the WCAG 2.2 AA rule set (see tags below).
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);
      if (include) builder = builder.include(include);
      if (exclude) builder = builder.exclude(exclude);

      const results = await builder.analyze();

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

test('checkout page has no serious a11y violations', async ({ page, checkA11y }) => {
  await page.goto('/checkout');
  await page.getByRole('heading', { name: 'Checkout' }).waitFor(); // let it settle
  await checkA11y();                       // whole page
  await checkA11y({ include: '#payment' }); // scope to one region
});
```

## `jest-axe` / `vitest-axe` — component test

Assert at the component level, where the markup actually lives — cheapest and
fastest place to catch a11y bugs.

```ts
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe'; // vitest: from 'vitest-axe'
import { TextField } from './TextField';

expect.extend(toHaveNoViolations);

test('TextField is accessible', async () => {
  const { container } = render(<TextField label="Email" id="email" />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

Note: jsdom can't compute layout, so contrast rules don't run at this level —
that's expected. Catch contrast in the browser (Playwright/Storybook) instead.

## Storybook a11y addon

`.storybook/main.ts`:

```ts
export default {
  addons: ['@storybook/addon-a11y'],
};
```

Per-story config to run against WCAG 2.2 AA and (rarely, and deliberately)
document a known exception:

```ts
export const Default = {
  parameters: {
    a11y: {
      config: {
        // Prefer fixing over disabling. If you must, comment WHY + link a ticket.
        // rules: [{ id: 'color-contrast', enabled: false }], // AVOID
      },
      options: { runOnly: ['wcag2a', 'wcag2aa', 'wcag22aa'] },
    },
  },
};
```

## axe rules & tags — scope, don't silence

Use **tags** to select which WCAG level you assert against:

| Tag | Meaning |
|-----|---------|
| `wcag2a` | WCAG 2.0 Level A |
| `wcag2aa` | WCAG 2.0 Level AA |
| `wcag21a` / `wcag21aa` | WCAG 2.1 A / AA |
| `wcag22aa` | WCAG 2.2 Level AA |
| `best-practice` | axe recommendations beyond WCAG (optional gate) |

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
| Next landmark | `VO + Cmd + D` (rotor) | `D` |
| Open elements list / rotor | `VO + U` | `Insert + F7` |
| Next link | `VO + Cmd + L` | `K` |
| Next table | `VO + Cmd + T` | `T` |

## Contrast thresholds (WCAG 2.2 AA)

| Content | Minimum ratio |
|---------|---------------|
| Normal text (< 18.66px, or < 24px non-bold) | **4.5:1** |
| Large text (≥ 24px, or ≥ 18.66px bold) | **3:1** |
| UI components & graphical objects (borders, icons, focus indicators) | **3:1** |
| Disabled controls | No requirement (but keep usable) |

AAA (aspirational): 7:1 normal / 4.5:1 large. Gate on AA.

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

```ts
// pseudo: fail if any violation id is not already in a11y-baseline.json
const baseline = new Set(require('./a11y-baseline.json'));
const fresh = results.violations.map(v => v.id).filter(id => !baseline.has(id));
expect(fresh, `New a11y violations: ${fresh.join(', ')}`).toEqual([]);
```
