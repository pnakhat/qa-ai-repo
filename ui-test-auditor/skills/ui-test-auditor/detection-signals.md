# Detection Signals & Demotion Rubric

## 1. Find UI tests by framework × language

Grep for these markers to locate suites regardless of language.

### Playwright
| Language | Markers to grep |
|----------|-----------------|
| TS/JS | `@playwright/test`, `import { test, expect }`, `page.goto`, `page.getByRole`, `page.locator` |
| Python | `from playwright.sync_api`, `pytest-playwright`, `page.goto(`, `expect(page` |
| Java | `com.microsoft.playwright`, `Playwright.create()`, `page.navigate(` |
| C#/.NET | `Microsoft.Playwright`, `IPage`, `await Page.GotoAsync` |

### Selenium / WebDriver
| Language | Markers to grep |
|----------|-----------------|
| Python | `from selenium import webdriver`, `driver.get(`, `find_element(` |
| Java | `org.openqa.selenium`, `new ChromeDriver()`, `driver.get(`, `findElement(` |
| C# | `OpenQA.Selenium`, `IWebDriver`, `driver.Navigate()` |
| Ruby | `require 'selenium-webdriver'`, `Selenium::WebDriver`, `driver.navigate` |
| JS | `selenium-webdriver`, `Builder()`, `driver.get(` |

### WebdriverIO / others
- **WebdriverIO** (JS/TS): `@wdio/`, `browser.url(`, `$(`, `$$(`.
- **Cypress** (JS/TS): `cy.visit(`, `cy.get(` — same rubric applies if present.
- **Protractor** (legacy): `browser.get(`, `element(by.` — flag for migration.

Test-case counters: `test(`/`it(` (JS/TS), `def test_` (Python), `@Test` (Java),
`[Test]`/`[Fact]` (C#), `it '`/`scenario` (Ruby/RSpec/Cucumber).

## 2. Signals a UI test should be DEMOTED

Read the body, not the name. Look for:

- **Data-only assertions** — checks a value, count, status, boolean, JSON field,
  or DB row; nothing about rendered DOM/visuals.
  - JS: `expect(res).`, `expect(data.`, `.status).toBe(`
  - Py: `assert response.`, `assert data[`
  - Java/C#: `assertEquals(expected, response...)`, `Assert.Equal(...response...)`
- **Direct API/DB calls inside the UI test** (`fetch(`, `axios`, `requests.get`,
  `RestAssured`, `HttpClient`, raw SQL) — the intent is API-level.
- **No render/interaction assertion** — has `goto/get/navigate` + `fill/click` but
  the only `expect/assert` is on non-visual state.
- **Parametrized data matrices**: `test.each`, `@pytest.mark.parametrize`,
  `@ParameterizedTest`, `[TestCase(...)]`, RSpec/Cucumber `Examples:` tables that
  drive a **form** to check validation/branches.
- **Duplicate step sequences** across tests differing only by input constants.
- **Role/permission loops** logging in as each role through the UI.
- **UI-driven setup** in `beforeEach`/`setUp`/`Background`: login, create-record,
  navigate — only to reach a precondition.

## 3. Classification rubric

| Verifies… | Level | Recommend |
|-----------|-------|-----------|
| Rendering, layout, visual, client-side interaction, navigation/routing, form UX, accessibility | **UI** | Keep |
| One end-to-end critical journey (checkout, signup, pay) | **UI** | Keep — one per journey |
| Business rules, validation messages, calculations, permissions/authz, error codes, pagination/filter/sort, data mapping | **API** | Demote → name the endpoint |
| Pure logic, formatting, parsing, no I/O | **Unit** | Demote → name the module |

## 4. For each demotion, output

- Test id/file + line.
- What it currently asserts and through how many UI steps.
- Target level + the **specific API endpoint or unit** that should carry it.
- Whether it collapses into an existing parameterized test (dedupe) or is new.
- Rough payoff: est. runtime/flake removed, duplicates merged.

Keep **one** UI smoke per journey when demoting a data matrix — don't drop the
browser path entirely, just stop retesting logic through it.
