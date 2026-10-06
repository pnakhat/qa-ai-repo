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

## Evidence-driven execution

Read [verification.md](verification.md) before selecting the workflow or reporting results. It defines domain-specific failure probes, evidence requirements, and limits on what a passing run proves.

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
   fixtures (see `reference.md`) — thin glue. `Given`/`When` steps call POM
   methods; `Then` steps make web-first `expect` assertions on locators/state the
   POM exposes. No branching or loops in steps.
6. **Parameterize data variations** as a `Scenario Outline` + `Examples`, where
   the examples are business-meaningful values (not test scaffolding).
7. **Factor shared setup** into `Background` (business preconditions), and reuse
   steps across features — write them once, phrase them generically.
8. **Verify parity.** Run `bddgen` then `playwright test`; the BDD suite must
   cover the same behavior as the original before you delete it. List the
   original test's assertions and tick each one off against a `Then` — a
   scenario that passes but asserts less is a coverage loss, not a conversion.
9. **Carry over test metadata.** `test.skip/fixme/slow`, `{ tag }`, and
   `test.describe.configure({ mode })` map to Gherkin tags (`@skip`, `@fixme`,
   `@slow`, `@smoke`, `@mode:serial`); auth `storageState` and `test.use()`
   options stay in project config or fixtures, not in the `.feature`.

**Know when not to convert.** Pure API tests, visual snapshots, and low-level
technical checks (headers, retries, error-boundary internals) have no business
reader — leave them as plain Playwright specs in their own project.

## Wiring fixtures (summary — detail in `reference.md`)

- Extend `test` **imported from `playwright-bdd`** (not `@playwright/test`) with
  typed page-object fixtures, and export it — generated files import it.
- In the same file export `const { Given, When, Then } = createBdd(test)`; every
  step then receives `{ page, <yourFixtures> }` and only instantiates what it uses.
- Keep steps stateless; pass data between steps through a test-scoped fixture
  (e.g. `ctx`), never module globals — those leak across parallel scenarios.
- Prefer fixtures over `Before`/`After` hooks for setup and teardown (rules
  below); reuse the Playwright setup-project + `storageState` pattern for auth.

## Test data: setup and teardown

A `Given` states a precondition; a fixture makes it true. Code in `reference.md`
→ *Test data — Given steps over a seeding fixture*.

- **Each scenario creates the data its `Given`s describe** through the API, a DB
  helper, or a factory — never by clicking through the UI unless that UI is the
  behavior under test — and never relies on pre-existing records or on what an
  earlier scenario left behind.
- **Unique per scenario and worker**: derive emails/names from a run id +
  `testInfo.workerIndex` + a random suffix. `Examples` rows hold domain values
  (`gold`, `$100`); the fixture turns them into unique records.
- **Teardown always runs and deletes exactly what was created.** A seeding
  fixture records each id it creates and deletes them after `await use()`, which
  runs when a step fails too. If you must use an `After` hook, it reads the ids
  from the scenario-scoped fixture (never module globals) and still runs on
  failure. Never truncate shared tables.
- **Prefer isolation that needs no cleanup**: per-run tenant, ephemeral
  environment/DB, `page.route` mocks for third parties.
- **Idempotent setup** and a scheduled **sweeper** that removes prefixed data
  older than a few hours, for runs that crashed before teardown.
- **Guard by environment**: the seeding fixture refuses production and shared
  hosts; `@smoke` runs against production stay read-only.
- **Prove it**: `bddgen && playwright test --repeat-each=2 --fully-parallel` is
  green, a single scenario passes alone (`--grep "<scenario title>"`), and no
  prefixed records remain afterwards.

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
| Assertions buried in page-object methods, or branching/loops in a step | `Then` step asserts with web-first `expect` on a locator the POM exposes; POMs stay assertion-free |
| `@only` / bare `@skip` committed | `forbidOnly` in CI; `@fixme` + issue link in the scenario description |
| Near-duplicate steps (`signs in`, `logs in`, `is logged in`) | One canonical phrasing; prune with `bddgen export --unused-steps` |
| `Background` longer than ~4 lines or with UI setup | Keep it to business context; move setup into fixtures |
| One step hard-coded to one email/user | Parameterize: `Given a "<tier>" member` + `Examples` |
| `.feature` named after a page (`cart-page.feature`) | Name after the capability (`checkout.feature`, `refunds.feature`) |
| `Given a customer "ada@example.com"` — a shared seed user many scenarios mutate | `Given a gold member` → seeding fixture creates a unique customer per scenario |
| Scenario passes only after another scenario created its data | Each scenario's `Given`s seed their own data |
| Cleanup as the last `Then`/`When` step, skipped when a step fails | Delete after `use()` in the fixture (or an `After` hook reading fixture-tracked ids) |
| `BeforeAll`/`BeforeWorker` data that many scenarios mutate | Per-scenario fixture; worker-level data stays read-only |
| Relying on a DB reset script that CI never runs | Fixture teardown + a scheduled sweeper |

## CI wiring

- **Generate then run** — the pipeline step is `bddgen && playwright test`; the
  committed `"test:bdd"` script (`"bddgen && playwright test"`) is what CI invokes.
  `bddgen` must run first every time — it regenerates the runnable specs from the
  current `.feature` + step files.
- **Keep `.features-gen/` out of git.** It's a build artifact regenerated on every
  run; add it to `.gitignore`. Commit the `.feature` files instead — they *are*
  the living behavior docs the business reads and reviews in PRs.
- **Tag-filter for speed.** Run the smoke subset in pre-deploy pipelines:
  `bddgen --tags "@smoke and not @wip" && playwright test` (Cucumber tag
  expressions); run the full suite on PRs. Scenario tags also become Playwright
  tags, so `playwright test --grep @smoke` works on an already-generated suite.
- **Publish behavior docs.** Add `cucumberReporter('html', { outputFile })` from
  `playwright-bdd` to the Playwright `reporter` array (not to `defineBddConfig`)
  so each run emits a human-readable scenario report — this is the artifact
  non-engineers actually consume. Upload it as a CI artifact on both pass and fail.
- **Fail the build on undefined steps.** Keep `missingSteps: 'fail-on-gen'` (the
  default) so `bddgen` exits non-zero when a Gherkin step has no definition;
  never switch to `'skip-scenario'` to get green. Ambiguous matches also fail.
- **Version floor.** playwright-bdd v9 needs Node 20+ and `@playwright/test`
  1.53+; it no longer needs `@cucumber/cucumber` installed.
