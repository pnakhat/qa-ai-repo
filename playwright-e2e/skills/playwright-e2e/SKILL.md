---
name: playwright-e2e
description: Author and maintain resilient Playwright end-to-end tests using the Page Object Model, fixtures, and stable, user-facing locators. Enforces guardrails against flakiness, brittle selectors, and shared state. Use when writing, reviewing, or debugging Playwright E2E specs, or when wiring E2E tests into CI. See `reference.md` for config, fixture patterns, and commands.
---

# Playwright E2E Testing

Write end-to-end tests that survive UI churn, stay fast, and catch real bugs.

## Evidence-driven execution

Read [verification.md](verification.md) before selecting the workflow or reporting results. It defines domain-specific failure probes, evidence requirements, and limits on what a passing run proves.

## Locators — prefer user-facing, avoid brittle selectors

| ✅ Prefer | ❌ Avoid |
|-----------|---------|
| `getByRole('button', { name: 'Sign in' })` | `page.locator('#login-btn')` |
| `getByLabel('Email address')` | `page.locator('.form__input--email')` |
| `getByPlaceholder('Search products…')` | `page.locator('input[type="text"]:nth-child(2)')` |
| `getByText('Your order is confirmed')` | `page.locator('[data-v-3f8a92]')` |
| `getByTestId('checkout-total')` | XPath tied to DOM hierarchy |

- Priority (Playwright's own): `getByRole` → `getByLabel` → `getByPlaceholder` → `getByText` → `getByAltText` / `getByTitle` → `getByTestId`. They mirror how a user finds things and survive styling refactors; `getByText` is for non-interactive content, not buttons or links.
- Use `getByTestId` only when no accessible handle exists; keep `data-testid` stable and semantic (not numbered or auto-generated). If the app uses another attribute, set `use.testIdAttribute` in config rather than falling back to CSS.
- Narrow with **chaining and filtering**, not positional indexes: `page.getByRole('listitem').filter({ hasText: 'Product 2' }).getByRole('button', { name: 'Add' })`. Avoid `.first()` / `.nth()` unless order *is* the behavior under test — they silence Playwright's strictness check and pick the wrong element when the list changes.
- Never select by CSS class names, generated IDs, or XPath tied to layout or component internals.

## Page Object Model

- Reuse existing Page Objects for repeated workflows. Add a class under `tests/pages/` when it removes meaningful duplication; simple focused specs may use locators directly.
- Expose **intent-level methods** (`login(user)`, `addToCart(sku)`, `checkout()`), not raw clicks. The spec reads as a user story; the Page Object carries the mechanics.
- **Return the next Page Object** from navigation methods so flows compose naturally:
  ```ts
  const dashboard = await loginPage.signInAs(user); // returns DashboardPage
  await dashboard.navigateToOrders();
  ```
- Keep business-outcome assertions visible in the spec. Reusable component readiness checks may live in helpers or Page Objects when they make the workflow clearer.

## Waiting — assertions, never sleeps

- Use Playwright's **web-first, auto-retrying assertions**: `await expect(locator).toBeVisible()`, `.toHaveText()`, `.toHaveValue()`, `.toHaveCount()`, `expect(page).toHaveURL()`.
- **Never assert on a one-shot read**: `expect(await locator.isVisible()).toBe(true)` or `expect(await locator.textContent()).toBe(…)` checks once and does not retry — use the matching web-first matcher instead.
- **Await asynchronous Playwright actions and assertions.** Locator construction is synchronous. A missing `await` is a top source of flakes; enforce it with ESLint `@typescript-eslint/no-floating-promises` and run `tsc --noEmit` in CI.
- **Never** call `page.waitForTimeout()` (or sleep via `setTimeout`) — it hard-codes a delay that will be wrong under load or on slow CI, and it's a flakiness factory.
- For a specific condition without an assertion use `locator.waitFor({ state: 'visible' })`. Register `page.waitForResponse()` before the triggering action, then await the promise; otherwise a fast response can be missed. Match method, URL, and status. Avoid `networkidle` for readiness; assert the application's ready state.
- Increase `timeout` on a specific assertion for genuinely slow operations; do not increase the global default to mask problems.

## Structure & isolation

- Every test is **fully independent**: sets up its own state, makes no assumptions about other tests, and passes in any order and in parallel (see *Test data: setup and teardown*).
- Use **fixtures** for shared setup: authenticated contexts, seeded data, storage state. Keep fixture files under `tests/fixtures/`.
- Name spec files by **user journey**, not by page: `checkout-guest.spec.ts`, not `cart-page.spec.ts`.
- **One journey per spec file**; a spec that covers ten unrelated flows makes failures hard to triage.
- Use `test.describe` blocks to group related scenarios within a journey; use `test.beforeEach` for within-describe setup only.

## Auth & state management

- **Auth via storage state** — run login once in a Playwright **setup project** (preferred over `globalSetup`: it appears in the report, gets traces, and uses fixtures), save the cookie/token state to a file (`storageState`), and reuse it per worker. Never re-run a full login flow in every test.
- Use **separate storage state files** per role (`admin.json`, `customer.json`) and reference them in fixture definitions so role-switching is explicit.
- **Gitignore storage-state files** — they hold live session cookies/tokens. Read credentials from env vars/CI secrets, never commit them.
- A test that **mutates server-side state of a shared account** (settings, cart, profile) must not share one storage state across parallel workers — use a per-worker account (worker-scoped fixture keyed on `testInfo.parallelIndex`) or API-seeded data unique to the test.
- For tests that must start unauthenticated, override the fixture with an empty storage state — don't delete the default.

## Test data: setup and teardown

Non-negotiable for every spec that creates or changes server-side state. Code in `reference.md` → *Test data — create, track, tear down*.

- **Each test creates the data it needs** through the API (`request` fixture), a DB helper, or a factory — never through the UI unless that UI is the thing under test — and never depends on pre-existing records or on another test's leftovers.
- **Unique per test and worker.** Build names/emails from a run id + `testInfo.workerIndex` + a random suffix (`e2e-<run>-w3-a1b2c3`) so parallel workers, shards, and repeated runs never collide.
- **Teardown always runs and deletes exactly what the test created.** Put create *and* delete in a fixture: the code after `await use(...)` runs even when the test fails. Track created ids and delete those; never truncate a shared table or "delete all orders". Cleanup written at the end of the test body is skipped by the first failing assertion.
- **Prefer isolation that needs no cleanup**: a per-run tenant/org, an ephemeral environment or DB (per-PR env, Testcontainers), `page.route` mocks for third parties.
- **Idempotent setup** (safe to re-run; create-or-reuse on the unique key) plus a scheduled **sweeper** that deletes data carrying the e2e prefix older than a few hours — a crashed or cancelled run leaves orphans no fixture teardown saw.
- **Guard by environment.** Seeding and deleting run only against hosts on an allowlist (local, ephemeral, staging); the fixture refuses production and shared environments. Production runs stay read-only.
- **Prove it**: the suite passes twice in a row (`--repeat-each=2`), a single test passes alone (`-g "<title>"`), the suite passes fully parallel (`--fully-parallel --workers=4`) — Playwright can't shuffle order, so alone + parallel is the order check — and afterwards no records with the run's prefix remain.

## Network interception

- **Mock only what you don't own** (third-party services, slow external APIs). Never mock the system under test — that defeats the point of an E2E test.
- Use `page.route(pattern, handler)` with `route.fulfill({ json: … })` for controlled stubs. Routes on `page`/`context` die with the test's context; only routes registered in a shared (worker-scoped) context need `unroute`. Register the route **before** the action that triggers the request.
- Assert on network calls with `page.waitForResponse(url => …)` to confirm requests were made, not just that the UI changed.
- Document mocked routes in the test or fixture: future maintainers need to know what is real and what is stubbed.

## Anti-patterns — smells to reject

| ❌ Smell | ✅ Fix |
|---------|--------|
| `await page.waitForTimeout(2000)` | `await expect(locator).toBeVisible()` |
| `page.locator('.btn--primary')` | `page.getByRole('button', { name: '…' })` |
| Login repeated in every `beforeEach` | `storageState` fixture shared per worker |
| `test.only` committed | `forbidOnly: !!process.env.CI` in config fails the run |
| Bare `test.skip()` to silence a failure | `test.fixme()` with an issue link in `annotation`; triage via `flaky-test-triage` |
| `expect(await el.isVisible()).toBe(true)` | `await expect(el).toBeVisible()` (retries) |
| Missing `await` on an action/assertion | `no-floating-promises` lint rule, `tsc --noEmit` in CI |
| `.first()` / `.nth(2)` to dodge a strict-mode error | Make the locator unique: `filter({ hasText })`, chain from a container |
| Assertions on CSS class or DOM shape | Assert on visible text, ARIA state, URL |
| `page.evaluate(() => app.__store__.user)` | Assert through the UI or network responses |
| `retries: 3` masking flaky tests | Low retries so flakes are *detected*, `failOnFlakyTests` on trunk, fix root cause |
| Hard-coded `http://localhost:3000` | `baseURL` in config / `process.env.BASE_URL` |
| One spec file covering every page | One spec file per user journey |
| Empty `expect` (no assertion in test) | Every test must have at least one assertion |
| Shared seed user (`test@example.com`) whose cart/settings tests change | Per-test data from a fixture, or a per-worker account |
| Test relies on records another test created (order-dependent) | Each test seeds its own data via `request` in a fixture |
| Cleanup at the end of the test body / only on the happy path | Delete after `await use()` in the fixture — runs on failure too |
| `beforeAll` data that many tests mutate | Per-test fixture; `beforeAll`/worker data stays read-only |
| Relying on a DB reset script that CI never runs | Fixture teardown + a scheduled sweeper for orphans |

## CI wiring

- **Parallelise by worker** (`fullyParallel: true`) and, for large suites, **shard across machines** (`--shard=1/4`) with the `blob` reporter + `npx playwright merge-reports` to rebuild one HTML report.
- Install only the browsers you run: `npx playwright install --with-deps chromium`. Pin `@playwright/test` and upgrade deliberately (browsers are version-coupled).
- Choose PR and pre-deploy suites from risk and runtime budgets. Keep critical journeys as required checks and run broader regression on an appropriate cadence; report omitted coverage.
- Store traces and screenshots as **CI artifacts** on failure (`trace: 'on-first-retry'` when retries > 0, else `'retain-on-failure'`); upload with `if: ${{ !cancelled() }}`.
- **Retries detect flakes, they don't fix them.** A test that fails then passes is reported as *flaky*, not passed. Keep `retries` at 1–2 on CI so a flake doesn't block unrelated PRs, but set `failOnFlakyTests: true` on the trunk/nightly run (or alert on any flaky result) so it can't hide, and never raise retries to make a suite green.
- `forbidOnly: !!process.env.CI` so a stray `test.only` can't silently shrink the run.
- Gate merges on E2E status via a **required check**; never merge a PR that leaves the suite red.
- Run the suite against your **staging URL** before production deploys; use `process.env.BASE_URL` to point the same suite at different environments.
- Where production monitoring is authorized, use bounded read-only synthetic journeys with test identities and an owner; do not add production traffic merely because E2E tests exist.

## Accessibility testing

- Use `@axe-core/playwright` (`new AxeBuilder({ page }).withTags([...]).analyze()`) as a fixture-level assertion on key pages to catch regressions automatically. (`checkA11y` is the API of the separate `axe-playwright` package — don't mix the two.)
- Run axe checks after navigation, not during animations or transitions.
- Failures from axe are assertions like any other — they block the test and surface in the report.

## Debugging

- `npx playwright test --ui` — time-travel runner with trace viewer built in.
- `--trace on` — record every action; open with `npx playwright show-trace trace.zip`.
- `--debug` — runs headed with the Playwright Inspector, paused at the first action (same as `PWDEBUG=1`). `await page.pause()` adds a breakpoint anywhere.
- Trace from CI: download the artifact and open it with `npx playwright show-trace` or at trace.playwright.dev — it has DOM snapshots, network, and console per action.
- Use the Playwright MCP server to interactively navigate the live app and discover locators before writing the spec.

## Works well with

These objectives build on the same runner and fixtures; none is a hard dependency.

- **`flaky-test-triage`** — when a spec flakes, triage the root cause (waiting,
  isolation, unmocked third parties) instead of reaching for `retries`.
- **`visual-regression`** — add `toHaveScreenshot` to journeys you already have
  specs for; they reuse the storage-state auth and seeded data for determinism.
- **`accessibility-testing`** — drop `AxeBuilder` in as a
  fixture-level assertion on key pages so a11y regressions block the same suite.
