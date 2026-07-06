---
name: playwright-bdd
description: Convert existing imperative Playwright tests into BDD using the playwright-bdd runner — generate Gherkin .feature files and wire step definitions to Playwright fixtures and page objects. Enforces business-language specs (declarative, not click-by-click). Use when asked to "move to BDD/Cucumber", "generate feature files from Playwright tests", or "make our E2E tests readable by the business".
---

# Playwright → BDD Converter

Turn `@playwright/test` specs into BDD with **`playwright-bdd`** (runs Gherkin
`.feature` files on the Playwright test runner). The point of BDD is a spec the
**business can read** — so the `.feature` files describe *behavior in domain
language*, and all the mechanical detail (locators, clicks, waits) lives in step
definitions and page objects. See `reference.md` for setup/wiring and
`gherkin-style.md` for the business-language rules.

## The golden rule

**Feature files contain zero UI mechanics.** No `click`, `fill`, selectors, URLs,
or waits in Gherkin. A step reads like a product requirement:

- ❌ `When I click "#login-btn" and type "ada@corp.com" into "#email"`
- ✅ `When she signs in as a registered customer`

The imperative "how" goes into the step definition, which calls a page-object
method. If a non-engineer can't read the scenario, it's wrong.

## Conversion method (per test)

1. **Recover the intent.** Read the imperative test and ask: *what user goal and
   what behavior(s) does it verify?* Ignore the mechanics for now.
2. **Split by behavior.** One `Scenario` = one behavior/outcome. A test that
   asserts several unrelated things becomes several scenarios.
3. **Map to Given / When / Then in domain terms:**
   - preconditions/state → **Given**
   - the user action or event under test → **When**
   - the observable business outcome → **Then**
   Use the product's vocabulary (customer, cart, invoice), never widget names.
4. **Extract page objects.** Turn the raw steps into intent-level methods on a
   POM (`loginPage.signInAs(user)`, `cart.checkout()`). These carry the clicks.
5. **Write step definitions** that bind each Gherkin step to a POM method via
   fixtures (see `reference.md`) — thin glue, no assertions logic beyond calling
   the object and checking outcomes.
6. **Parameterize data variations** as a `Scenario Outline` + `Examples`, where
   the examples are business-meaningful values (not test scaffolding).
7. **Factor shared setup** into `Background` (business preconditions), and reuse
   steps across features — write them once, phrase them generically.
8. **Verify parity.** Run `bddgen` then `playwright test`; the BDD suite must
   cover the same behavior as the original before you delete it.

## Wiring fixtures (summary — detail in `reference.md`)

- Create typed Playwright fixtures for your page objects: `test = base.extend<...>({...})`.
- Bind steps with `const { Given, When, Then } = createBdd(test)` so every step
  receives `{ page, <yourFixtures> }`.
- Keep steps stateless; pass state through fixtures or a `World`/custom fixture,
  not module globals.

## Principles

- **Declarative over imperative** — describe *what*, not *how*. The `.feature` is
  documentation that executes.
- **Ubiquitous language** — mirror the domain terms the team/PM actually use.
- **Reusable, generic steps** — "signs in as a registered customer" beats a
  step hard-coded to one email; parameterize.
- **Thin glue, rich page objects** — behavior lives in POMs; steps just wire.
- **One outcome per scenario**; use `Background` for shared context.
- **Preserve behavior** — BDD is a rewrite of expression, not of coverage.
