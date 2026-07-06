---
name: playwright-e2e
description: Author and maintain resilient Playwright end-to-end tests using the Page Object Model, fixtures, and stable, user-facing locators. Enforces guardrails against flakiness, brittle selectors, and shared state. Use when writing, reviewing, or debugging Playwright E2E specs, or when wiring E2E tests into CI. See `reference.md` for config, fixture patterns, and commands.
---

# Playwright E2E Testing

Write end-to-end tests that survive UI churn, stay fast, and catch real bugs.

## Locators — prefer user-facing, avoid brittle selectors

| ✅ Prefer | ❌ Avoid |
|-----------|---------|
| `getByRole('button', { name: 'Sign in' })` | `page.locator('#login-btn')` |
| `getByLabel('Email address')` | `page.locator('.form__input--email')` |
| `getByPlaceholder('Search products…')` | `page.locator('input[type="text"]:nth-child(2)')` |
| `getByText('Your order is confirmed')` | `page.locator('[data-v-3f8a92]')` |
| `getByTestId('checkout-total')` | XPath tied to DOM hierarchy |

- Prefer `getByRole`, `getByLabel`, `getByPlaceholder`, `getByText` — they mirror how a user finds things and survive styling refactors.
- Use `getByTestId` only when no accessible handle exists; keep `data-testid` stable and semantic (not numbered or auto-generated).
- Never select by CSS class names, generated IDs, or XPath tied to layout or component internals.

## Page Object Model

- One class per page or major component, under `tests/pages/`.
- Expose **intent-level methods** (`login(user)`, `addToCart(sku)`, `checkout()`), not raw clicks. The spec reads as a user story; the Page Object carries the mechanics.
- **Return the next Page Object** from navigation methods so flows compose naturally:
  ```ts
  const dashboard = await loginPage.signInAs(user); // returns DashboardPage
  await dashboard.navigateToOrders();
  ```
- Keep assertions **out of Page Objects** — they belong in the spec or a dedicated expect helper. A Page Object that throws because an element isn't visible is leaking test logic.

## Waiting — assertions, never sleeps

- Use Playwright's **web-first, auto-retrying assertions**: `await expect(locator).toBeVisible()`, `.toHaveText()`, `.toHaveValue()`, `.toHaveURL()`.
- **Never** call `page.waitForTimeout()` — it hard-codes a delay that will be wrong under load or on slow CI, and it's a flakiness factory.
- For a specific condition without an assertion use `locator.waitFor({ state: 'visible' })` or `page.waitForResponse(/api\/orders/)` with a meaningful condition.
- Increase `timeout` on a specific assertion for genuinely slow operations; do not increase the global default to mask problems.

## Structure & isolation

- Every test is **fully independent**: sets up its own state, makes no assumptions about other tests, and passes in any order and in parallel.
- Use **fixtures** for shared setup: authenticated contexts, seeded data, storage state. Keep fixture files under `tests/fixtures/`.
- Name spec files by **user journey**, not by page: `checkout-guest.spec.ts`, not `cart-page.spec.ts`.
- **One journey per spec file**; a spec that covers ten unrelated flows makes failures hard to triage.
- Use `test.describe` blocks to group related scenarios within a journey; use `test.beforeEach` for within-describe setup only.

## Auth & state management

- **Auth via storage state** — run login once in a global setup or a Playwright setup project, save the cookie/token state to a file (`storageState`), and reuse it per worker. Never re-run a full login flow in every test.
- Use **separate storage state files** per role (`admin.json`, `customer.json`) and reference them in fixture definitions so role-switching is explicit.
- For tests that must start unauthenticated, override the fixture with an empty storage state — don't delete the default.
- Prefer **API-seeded data** (via a `request` fixture) over UI-driven setup when setting up preconditions: faster, more reliable, and keeps the test focused on the user journey under test.

## Network interception

- **Mock only what you don't own** (third-party services, slow external APIs). Never mock the system under test — that defeats the point of an E2E test.
- Use `page.route(pattern, handler)` with `route.fulfill({ json: … })` for controlled stubs; always add a cleanup with `page.unroute` or scope it to the test.
- Assert on network calls with `page.waitForResponse(url => …)` to confirm requests were made, not just that the UI changed.
- Document mocked routes in the test or fixture: future maintainers need to know what is real and what is stubbed.

## Anti-patterns — smells to reject

| ❌ Smell | ✅ Fix |
|---------|--------|
| `await page.waitForTimeout(2000)` | `await expect(locator).toBeVisible()` |
| `page.locator('.btn--primary')` | `page.getByRole('button', { name: '…' })` |
| Login repeated in every `beforeEach` | `storageState` fixture shared per worker |
| `test.only` or `test.skip` committed | Tag `@flaky` + open a tracking issue |
| Assertions on CSS class or DOM shape | Assert on visible text, ARIA state, URL |
| `page.evaluate(() => app.__store__.user)` | Assert through the UI or network responses |
| `retries: 3` masking flaky tests | Fix root cause; zero retries on `main` branch |
| Hard-coded `http://localhost:3000` | `baseURL` in config / `process.env.BASE_URL` |
| One spec file covering every page | One spec file per user journey |
| Empty `expect` (no assertion in test) | Every test must have at least one assertion |

## CI wiring

- **Parallelise by worker** (`--workers=4` or `fullyParallel: true`) to keep suites fast.
- Run the **full suite on PRs**; run only the `@smoke` tag subset in pre-deploy pipelines for speed.
- Store traces and screenshots as **CI artifacts** on failure (`use: { trace: 'on-first-retry' }`).
- Set **`retries: 0` on main/trunk** CI — surviving retries hide flakes. Allow `retries: 1` on PRs as a noise filter, but alert on any retry.
- Gate merges on E2E status via a **required check**; never merge a PR that leaves the suite red.
- Run the suite against your **staging URL** before production deploys; use `process.env.BASE_URL` to point the same suite at different environments.
- **Nightly full-run** against production (read-only journeys): catches drift that PRs miss.

## Accessibility testing

- Use `@axe-core/playwright` (`checkA11y`) as a fixture-level assertion on key pages to catch regressions automatically.
- Run axe checks after navigation, not during animations or transitions.
- Failures from axe are assertions like any other — they block the test and surface in the report.

## Debugging

- `npx playwright test --ui` — time-travel runner with trace viewer built in.
- `--trace on` — record every action; open with `npx playwright show-trace trace.zip`.
- `--headed --debug` — step through with the Playwright Inspector.
- `PWDEBUG=1` — pause on the first `await page.pause()` call in the test.
- Use the Playwright MCP server to interactively navigate the live app and discover locators before writing the spec.
