# playwright-bdd — Setup & Fixture Wiring

Reference for the `playwright-bdd` runner (Gherkin on top of `@playwright/test`).
Check the installed version's docs for API drift; the shapes below are stable.

## Install

```bash
npm i -D playwright-bdd @playwright/test
# Some versions list @cucumber/cucumber as a peer for Gherkin parsing:
npm i -D @cucumber/cucumber
npx playwright install
```

## Project layout

```
features/            # .feature files — business language, committed as docs
  checkout.feature
steps/               # step definitions + fixtures
  fixtures.ts
  checkout.steps.ts
pages/               # page objects (the mechanics live here)
  CheckoutPage.ts
playwright.config.ts
```

## Config — `playwright.config.ts`

```ts
import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

const testDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: 'steps/**/*.ts',
});

export default defineConfig({
  testDir,
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:3000' },
});
```

Generate the runnable specs, then run:

```bash
npx bddgen && npx playwright test      # bddgen writes .features-gen/, then Playwright runs it
```

Add a `package.json` script so CI and humans run it the same way:

```json
{
  "scripts": {
    "test:bdd": "bddgen && playwright test"
  }
}
```

**Gitignore the generated specs.** `.features-gen/` is a build artifact — `bddgen`
rewrites it on every run. Commit the `.feature` files (they're the behavior docs);
ignore the generated output:

```gitignore
# .gitignore
.features-gen/
```

## Fixtures — bind page objects to steps

`steps/fixtures.ts`:

```ts
import { test as base } from 'playwright-bdd';
import { LoginPage } from '../pages/LoginPage';
import { CheckoutPage } from '../pages/CheckoutPage';

type Fixtures = { loginPage: LoginPage; checkout: CheckoutPage };

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, use) => { await use(new LoginPage(page)); },
  checkout:  async ({ page }, use) => { await use(new CheckoutPage(page)); },
});
```

## Step definitions — thin glue over page objects

`steps/checkout.steps.ts`:

```ts
import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { test } from './fixtures';

const { Given, When, Then } = createBdd(test);

Given('a registered customer with items in their cart', async ({ loginPage, checkout }) => {
  await loginPage.signInAs('registered-customer');
  await checkout.addSampleItems();
});

When('she completes checkout', async ({ checkout }) => {
  await checkout.placeOrder();
});

Then('her order is confirmed', async ({ checkout }) => {
  await expect(checkout.confirmation).toBeVisible();
});
```

Note: steps receive `{ page }` plus your custom fixtures. Keep them stateless —
share state via fixtures, not module-level variables.

## Parameterized steps & data variations

```gherkin
Scenario Outline: Discounts by membership tier
  Given a "<tier>" member with a $100 order
  When she checks out
  Then she is charged "<total>"

  Examples:
    | tier    | total  |
    | bronze  | $100   |
    | gold    | $90    |
```

```ts
Given('a {string} member with a ${int} order', async ({ checkout }, tier, amount) => {
  await checkout.startOrderAs(tier, amount);
});
```

## Advanced (optional)

- **Decorator steps**: annotate POM methods with `@Given/@When/@Then` via
  `createBdd(test, { worldFixture })` for class-based steps.
- **Tags**: `@smoke`, `@slow` on scenarios; run `npx bddgen --tags "@smoke"`.
- **Hooks**: `Before`/`After` from `createBdd(test)` for setup/teardown.
- **Reporters**: enable Cucumber/HTML reporters via `defineBddConfig`.

## Converting an imperative test — before / after

Before (`login.spec.ts`):
```ts
test('user can log in', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('ada@corp.com');
  await page.getByLabel('Password').fill('pw');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Welcome, Ada')).toBeVisible();
});
```

After — `features/login.feature`:
```gherkin
Feature: Sign in
  Scenario: A registered customer signs in
    Given a registered customer
    When she signs in
    Then she sees her personalized dashboard
```
…plus a `LoginPage` with `signInAs()` and three thin steps. The clicks and
labels moved into the page object; the feature reads as behavior.
