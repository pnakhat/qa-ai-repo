---
name: ui-test-auditor
description: Audit an existing UI/E2E test suite for overuse and recommend which tests to move down to the API (or unit) layer. Works across Playwright, WebdriverIO, and Selenium/WebDriver in any language (TS/JS, Python, Java, C#, Ruby). Enforces guardrails — relocate coverage never delete it, name a specific target endpoint/unit per demotion, keep exactly one UI happy-path per journey. Use when the suite is slow/flaky, when asked "are we testing too much through the UI", "which E2E tests should be API tests", or to fix an inverted test pyramid. See `reference.md` for before/after conversions and ready-to-run inventory commands.
---

# UI Test Overuse Auditor

Browser tests are the slowest, flakiest, most expensive tests to run and
maintain. Teams overuse them — verifying business rules, validation, permissions,
and data variations *through the UI* when a fast API or unit test would prove the
same thing. This skill audits the suite and reclassifies each test:
**keep-as-UI**, **demote-to-API**, or **demote-to-unit**. See
`detection-signals.md` for framework/language markers and the exact rubric, and
`reference.md` for concrete before/after conversions and copy-pasteable ripgrep
inventory commands.

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

## Anti-patterns — smells to reject

Each row is a way the browser layer gets overused, and where the coverage should
land instead. The demotion **relocates** the assertion — it never deletes it.

| ❌ Overuse pattern | ✅ Demote to |
|-------------------|-------------|
| Validation/error-message **matrix driven through a form** (N tests retyping fields to check each message) | 1 parameterized API test against the create/update endpoint + **1** UI happy-path smoke |
| **Role/permission loop via UI login** (log in as admin, editor, viewer… assert what each sees) | Parameterized API authz test hitting the endpoint per role/token; keep 1 UI test that a menu renders |
| **Assertion on API/DB state inside a browser test** (`expect(res.status)`, `assert response.json`, raw SQL) | API/integration test at that endpoint — it's an API test wearing a UI costume |
| **UI-driven login/seed in `beforeEach`** (navigate + fill + submit only to reach a precondition) | Programmatic/API fixture or storage-state setup; the login isn't what the test verifies |
| **Data-only assertion with no render check** (goto → fill → submit → assert a value/flag/count, never checks the DOM) | API test on the computed value; drop the browser round-trip |
| **Calculation/business-rule check through the UI** (discount, tax, totals, pricing tiers) | API test on the endpoint that returns the number, or a unit test on the pure function |
| **Pagination / filter / sort / search matrix** exercised by clicking through pages | API test asserting the query params return the right set; 1 UI test that a list renders |
| **One mega-test asserting many unrelated things** | Split: keep the browser-specific part at UI, push each data/logic assertion to its own API/unit test |
| **Duplicate step sequences** across tests differing only by input constants | Collapse into one parameterized API test; the steps were incidental |

## Scan procedure

Work from a full-suite inventory, then read bodies — never classify on the title
alone. Run these from the repo root (see `reference.md` for the full catalog and
per-language variants):

```bash
# 1. Locate UI/E2E suites regardless of framework/language
rg -l --pcre2 '@playwright/test|playwright\.sync_api|com\.microsoft\.playwright|Microsoft\.Playwright' # Playwright
rg -l --pcre2 'selenium|webdriver|OpenQA\.Selenium|ChromeDriver' # Selenium/WebDriver
rg -l --pcre2 '@wdio/|browser\.url\(' # WebdriverIO

# 2. Count UI test cases vs API/integration test cases (adjust globs to your dirs)
rg -c --pcre2 '\b(test|it)\(|def test_|@Test|\[(Test|Fact)\]' tests/e2e tests/ui        # UI cases
rg -c --pcre2 '\b(test|it)\(|def test_|@Test|\[(Test|Fact)\]' tests/api tests/integration # API cases

# 3. Find the overuse smells inside UI test bodies
rg -n --pcre2 'test\.each|@pytest\.mark\.parametrize|@ParameterizedTest|\[TestCase' # data-driven matrices
rg -n --pcre2 'expect\(res|\.status\)\.toBe|assert response|assertEquals\(.*response|Assert\.Equal\(.*response' # data-only assertions in UI tests
rg -n --pcre2 'fetch\(|axios|requests\.(get|post)|RestAssured|HttpClient' # direct API/DB calls in UI tests
rg -n --pcre2 -B2 'beforeEach|setUp|Background' # UI-driven setup to relocate
```

Then open each hit and apply the classification rubric in `detection-signals.md`.

## Principles

- **Keep the reason, not the coverage.** If a test's assertion is about data, it
  belongs at the API; only browser-specific behavior justifies a UI test.
- **One happy path per journey at the UI**, exhaustive variations at the API/unit level.
- **Don't delete coverage — relocate it.** Every demotion recommendation names the
  API endpoint or unit under test that should now carry it.
- **Rank by payoff**: slowest/flakiest/most-duplicated UI tests first.
- **Language-agnostic**: the same rubric applies whether the suite is TS, Python,
  Java, C#, or Ruby — only the syntax of the markers differs.

## Works well with

These objectives complement the audit; none is a hard dependency.

- **`flaky-test-triage`** — over-broad UI tests flake the most; demoting them per
  this audit often makes the flake disappear, and what remains gets triaged there.
- **`visual-regression`** — a screenshot is a UI-level tool; don't snapshot what a
  unit or API test should assert. Keep visual coverage where it belongs after a demotion.
- **`accessibility-testing`** — a11y assertions also belong at the right level:
  one browser smoke, with the rest pushed to component/unit checks.
