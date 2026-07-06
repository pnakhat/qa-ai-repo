---
name: ui-test-auditor
description: Audit an existing UI/E2E test suite for overuse and recommend which tests to move down to the API (or unit) layer. Works across Playwright, WebdriverIO, and Selenium/WebDriver in any language (TS/JS, Python, Java, C#, Ruby). Use when the suite is slow/flaky, when asked "are we testing too much through the UI", "which E2E tests should be API tests", or to fix an inverted test pyramid.
---

# UI Test Overuse Auditor

Browser tests are the slowest, flakiest, most expensive tests to run and
maintain. Teams overuse them — verifying business rules, validation, permissions,
and data variations *through the UI* when a fast API or unit test would prove the
same thing. This skill audits the suite and reclassifies each test:
**keep-as-UI**, **demote-to-API**, or **demote-to-unit**. See
`detection-signals.md` for framework/language markers and the exact rubric.

## How to run the audit

1. **Locate the UI tests** regardless of framework/language. Detect Playwright,
   WebdriverIO, and Selenium/WebDriver by their imports/APIs (see
   `detection-signals.md`). Count files and test cases; note the framework+language.
2. **Establish the shape.** Compare UI test count against API/unit test counts.
   A healthy suite has a *handful* of UI journeys, not hundreds. Flag inversion.
3. **Classify each UI test** by *what it actually verifies* (read the assertions,
   not the title):
   - **Keep-as-UI** — the behavior only manifests in the browser: rendering,
     client-side interaction, navigation/routing, form UX, visual, accessibility,
     or a genuine critical end-to-end journey.
   - **Demote-to-API** — business rules, validation messages, permission/authz,
     error codes, pagination/filtering/sorting, calculations, data
     transformations — anything asserted on data/state, reachable via an HTTP call.
   - **Demote-to-unit** — pure logic with no I/O.
4. **Find the repetition.** The biggest win: **N UI tests that differ only by
   input data** (each retyping a form to check a different validation/branch).
   Collapse them into one parameterized API test plus **one** UI happy-path smoke.
5. **Flag UI-driven setup.** Logging in, seeding data, or navigating through the
   UI just to reach a state = move to programmatic/API setup or fixtures; it's not
   what the test verifies.
6. **Report** with `audit-report-template.md`: inventory, overuse findings ranked
   by cost saved, per-test recommendation with reasoning, the target counts, and
   a migration plan.

## Overuse smells (what to grep for and read)

- Many tests with **near-identical steps, only data changes** → parameterize at API.
- **Assertions on API responses or DB rows** inside a browser test → it's an API test wearing a UI costume.
- **No assertion on rendered output** — navigates, fills, submits, then checks a
  value/flag → demote.
- **Validation/error-message matrices** driven through forms → API-level.
- **Permission/role matrices** exercised by logging in as each role via the UI.
- **Repeated UI login/setup** in `beforeEach` across large suites.
- One giant test asserting many unrelated things → split; most parts go lower.

## Principles

- **Keep the reason, not the coverage.** If a test's assertion is about data, it
  belongs at the API; only browser-specific behavior justifies a UI test.
- **One happy path per journey at the UI**, exhaustive variations at the API/unit level.
- **Don't delete coverage — relocate it.** Every demotion recommendation names the
  API endpoint or unit under test that should now carry it.
- **Rank by payoff**: slowest/flakiest/most-duplicated UI tests first.
- **Language-agnostic**: the same rubric applies whether the suite is TS, Python,
  Java, C#, or Ruby — only the syntax of the markers differs.
