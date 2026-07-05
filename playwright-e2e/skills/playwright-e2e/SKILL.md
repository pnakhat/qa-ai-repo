---
name: playwright-e2e
description: Author and maintain resilient Playwright end-to-end tests using the Page Object Model, fixtures, and stable, user-facing locators. Use when writing, reviewing, or debugging Playwright E2E specs.
---

# Playwright E2E Testing

Write end-to-end tests that survive UI churn and stay fast.

## Locators — prefer user-facing, avoid brittle selectors
- Prefer `getByRole`, `getByLabel`, `getByPlaceholder`, `getByText` — they mirror how a user finds things.
- Use `getByTestId` only when no accessible handle exists; keep `data-testid` stable.
- Never select by CSS/XPath tied to layout or generated class names.

## Page Object Model
- One class per page/major component under `tests/pages/`.
- Expose intent-level methods (`login(user)`, `addToCart(sku)`), not raw clicks.
- Return the next Page Object from navigations so flows read top-to-bottom.

## Waiting — assertions, never sleeps
- Rely on Playwright's web-first, auto-retrying assertions (`await expect(locator).toBeVisible()`).
- Never use `page.waitForTimeout()` to "let things settle"; wait for a condition.

## Structure & isolation
- Each test is independent: set up its own state, no ordering assumptions.
- Use fixtures for shared setup (authenticated context, seeded data).
- Keep specs in `tests/e2e/*.spec.ts`; name by user journey, not by page.

## Debugging
- `npx playwright test --ui` for the time-travel runner.
- `--trace on` and open `trace.zip` to inspect failures with DOM snapshots.
- `--headed --debug` to step through with the Inspector.
