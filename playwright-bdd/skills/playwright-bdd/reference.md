# playwright-bdd — Setup & Fixture Wiring

Reference for the `playwright-bdd` runner (Gherkin on top of `@playwright/test`).
Check the installed version's docs for API drift; the shapes below are stable.

## Install

```bash
npm i -D @playwright/test playwright-bdd
npx playwright install
```

playwright-bdd v9 requires Node 20+ and `@playwright/test` 1.53+. Since v8 it no
longer depends on `@cucumber/cucumber` — remove it if it was only there for BDD.
`npx bddgen env` prints the resolved versions.

## Project layout

```
features/            # .feature files — business language, committed as docs
  checkout.feature
steps/               # step definitions + fixtures (fixtures.ts must match the `steps` glob)
  fixtures.ts
  checkout.steps.ts
pages/               # page objects (the mechanics live here)
  CheckoutPage.ts
playwright.config.ts
```

## Config — `playwright.config.ts`

```ts
import { defineConfig } from '@playwright/test';
import { defineBddConfig, cucumberReporter } from 'playwright-bdd';

const testDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: 'steps/**/*.ts',
  missingSteps: 'fail-on-gen',   // default; undefined steps fail bddgen
  // tags: '@smoke',             // optional: bake a tag filter into generation
});

export default defineConfig({
  testDir,
  forbidOnly: !!process.env.CI,  // a committed @only fails CI
  reporter: [
    cucumberReporter('html', { outputFile: 'cucumber-report/index.html' }),
    ['html', { open: 'never' }],
  ],
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:3000' },
});
```

**Auth with a setup project.** Keep login out of Gherkin: a plain (non-BDD)
setup project writes `storageState`, and the BDD project depends on it — same
pattern as the `playwright-e2e` skill:

```ts
projects: [
  { name: 'setup', testDir: './auth', testMatch: /.*\.setup\.ts/ },
  { name: 'bdd', testDir, dependencies: ['setup'],
    use: { storageState: 'playwright/.auth/customer.json' } },
],
```

Gitignore the storage-state file. Projects with *different* feature sets each
get their own `testDir: defineBddConfig({ outputDir: '.features-gen/<name>', … })`
— a unique `outputDir` per project avoids generated files overwriting each other.

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
// Import base from playwright-bdd, NOT @playwright/test — the BDD test carries
// the step-running fixtures the generated files rely on.
import { test as base, createBdd } from 'playwright-bdd';
import { LoginPage } from '../pages/LoginPage';
import { CheckoutPage } from '../pages/CheckoutPage';

type Ctx = { orderId?: string };   // cross-step data for one scenario
type Fixtures = { loginPage: LoginPage; checkout: CheckoutPage; ctx: Ctx };

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, use) => { await use(new LoginPage(page)); },
  checkout:  async ({ page }, use) => { await use(new CheckoutPage(page)); },
  ctx:       async ({}, use) => { await use({}); },   // fresh per scenario
});

export const { Given, When, Then } = createBdd(test);
```

`test` must be exported — generated files import it. Steps import
`Given/When/Then` from `./fixtures`, so there is exactly one `createBdd` call.

## Step definitions — thin glue over page objects

`steps/checkout.steps.ts`:

```ts
import { expect } from '@playwright/test';
import { Given, When, Then } from './fixtures';

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

Note: steps receive `{ page }` plus your custom fixtures as the first argument,
then the step parameters. Keep them stateless — share state via the `ctx`
fixture, not module-level variables (those leak between parallel scenarios):

```ts
When('she places the order', async ({ checkout, ctx }) => {
  ctx.orderId = await checkout.placeOrder();          // POM returns the id
});
Then('the order appears in her history', async ({ page, ctx }) => {
  await expect(page.getByRole('row', { name: new RegExp(ctx.orderId!) })).toBeVisible();
});
```

## Data tables — many values of one kind in one step

```gherkin
When she registers with:
  | name  | Ada Lovelace  |
  | email | ada@corp.test |
```

```ts
import { DataTable } from 'playwright-bdd';
When('she registers with:', async ({ signup }, table: DataTable) => {
  await signup.register(table.rowsHash());   // { name: …, email: … }
});
```

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

## Tags

- Filter at generation with a Cucumber tag expression:
  `npx bddgen --tags "@smoke and not @wip" && npx playwright test`. Scenario tags
  also become Playwright tags, so `npx playwright test --grep @smoke` works too.
- Special tags map to Playwright modifiers: `@only`, `@skip`, `@fixme`, `@fail`,
  `@slow`, `@timeout:N`, `@retries:N`, `@mode:serial|parallel|default`.
  `@only` is caught by `forbidOnly` on CI; give every `@skip`/`@fixme` a reason
  (issue link) in the scenario description.
- **Tags from path / scoped steps**: put features and their steps under
  `@area/` directories (`features/@checkout/…`) to tag them automatically and
  scope same-text steps to one area.

## Advanced (optional)

- **Decorator steps** (class-based POM steps): import `Fixture, Given, When, Then`
  from `'playwright-bdd/decorators'`, mark the class `@Fixture('checkout')`,
  decorate methods with `@When('she completes checkout')`, register the class as a
  fixture in `test.extend`, and make sure the POM files match the `steps` glob.
  Don't mix decorator and function steps for the same phrases.
- **Hooks**: `BeforeScenario`/`AfterScenario` (aliases `Before`/`After`) and
  `BeforeWorker`/`AfterWorker` from `createBdd(test)`. Prefer fixtures — they
  compose and only run when used.
- **Reporters**: `cucumberReporter('html' | 'json' | 'junit' | 'message', { outputFile })`
  in the Playwright `reporter` array (see config above).
- **Housekeeping**: `npx bddgen export` lists every step definition (reuse
  before inventing a phrase); `npx bddgen export --unused-steps` finds dead ones.
  `npx bddgen --watch` regenerates while you edit.

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
