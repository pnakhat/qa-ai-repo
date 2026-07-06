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

## Anti-patterns — smells to reject

| ❌ Smell | ✅ Fix |
|---------|--------|
| `When I click "#login-btn"` / selector in `.feature` | `When she signs in` — move the selector into a page object |
| `Given I go to "/admin/users?role=2"` | `Given an administrator is managing users` — URLs live in the POM |
| `Then "#total" has text "$90"` — label/DOM in prose | `Then she is charged the discounted total` |
| `When I wait 2 seconds` | Drop it — waits are auto-retrying assertions inside the POM |
| Click-by-click imperative scenario (fill, click, fill, click) | Collapse into one intent step: `When she completes checkout` |
| Multiple `When`s in one scenario | Split into multiple scenarios, or fold setup actions into `Given` |
| Scenario titled `"Cart page"` or `"checkout-btn works"` | Title by behavior: `"Discount applied for gold members"` |
| `Examples` table full of ids/tokens (`sku_88a1`, `usr_02`) | Use domain values: tier `gold`, order `$100`, total `$90` |
| `expect(...)` assertion logic written in a step definition | Assert a state the POM exposes; keep mechanics in the page object |
| One step hard-coded to one email/user | Parameterize: `Given a "<tier>" member` + `Examples` |
| `.feature` named after a page (`cart-page.feature`) | Name after the capability (`checkout.feature`, `refunds.feature`) |

## CI wiring

- **Generate then run** — the pipeline step is `bddgen && playwright test`; the
  committed `"test:bdd"` script (`"bddgen && playwright test"`) is what CI invokes.
  `bddgen` must run first every time — it regenerates the runnable specs from the
  current `.feature` + step files.
- **Keep `.features-gen/` out of git.** It's a build artifact regenerated on every
  run; add it to `.gitignore`. Commit the `.feature` files instead — they *are*
  the living behavior docs the business reads and reviews in PRs.
- **Tag-filter for speed.** Run the smoke subset in pre-deploy pipelines:
  `bddgen --tags "@smoke" && playwright test`; run the full suite on PRs.
- **Publish behavior docs.** Enable a Cucumber/HTML reporter via `defineBddConfig`
  so each run emits a human-readable report of scenarios — this is the artifact
  non-engineers actually consume. Upload it as a CI artifact on both pass and fail.
- **Fail the build on undefined/ambiguous steps.** `bddgen` errors when a Gherkin
  step has no matching definition — treat that as a hard failure, not a warning,
  so drift between `.feature` files and steps can't merge.
