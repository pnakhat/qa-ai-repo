# UI Test Auditor — Conversions & Inventory Reference

Concrete before/after demotions, plus a ready-to-run catalog of ripgrep commands
to inventory suites and count UI vs API tests. Every conversion **relocates** the
assertion to a named endpoint or unit — coverage moves down, it is never dropped.

---

## Conversion 1 — Playwright (TS): discount calculation through the UI → API test

A calculation asserted through a browser round-trip. The number comes from the
server (or a pure pricing function); the DOM is incidental. Demote to the API that
returns it, and keep **one** UI smoke that the total renders at all.

### Before — `tests/e2e/checkout-discount.spec.ts` (one of many, differ only by data)

```ts
import { test, expect } from '@playwright/test';

const cases = [
  { code: 'SAVE10', subtotal: 100, expected: '$90.00' },
  { code: 'SAVE25', subtotal: 100, expected: '$75.00' },
  { code: 'HALF',   subtotal: 100, expected: '$50.00' },
  { code: 'BOGUS',  subtotal: 100, expected: '$100.00' }, // invalid code
];

for (const c of cases) {
  test(`discount ${c.code}`, async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('buyer@example.com');
    await page.getByLabel('Password').fill('pw');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.goto('/cart');
    await page.getByTestId('add-item').click();       // subtotal 100
    await page.getByLabel('Promo code').fill(c.code);
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByTestId('order-total')).toHaveText(c.expected);
  });
}
```

Four browser sessions, four logins, ~40s, all to check arithmetic.

### After — `tests/api/discount.spec.ts` (parameterized API test)

```ts
import { test, expect } from '@playwright/test';
// `request` is the built-in APIRequestContext fixture; relative URLs resolve
// against `use.baseURL` in playwright.config — set it, or pass absolute URLs.

const cases = [
  { code: 'SAVE10', subtotal: 100, expectedTotal: 90 },
  { code: 'SAVE25', subtotal: 100, expectedTotal: 75 },
  { code: 'HALF',   subtotal: 100, expectedTotal: 50 },
  { code: 'BOGUS',  subtotal: 100, expectedTotal: 100 },
];

for (const c of cases) {
  test(`POST /api/cart/discount applies ${c.code}`, async ({ request }) => {
    const res = await request.post('/api/cart/discount', {
      data: { subtotal: c.subtotal, code: c.code },
    });
    expect(res).toBeOK();                       // 2xx, prints the body on failure
    expect((await res.json()).total).toBe(c.expectedTotal);
  });
}
```

Plus **one** retained UI smoke (not per-code):

```ts
test('promo code updates the displayed total', async ({ page }) => {
  // …login via storageState fixture, add item…
  await page.getByLabel('Promo code').fill('SAVE10');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByTestId('order-total')).toHaveText('$90.00'); // wiring works
});
```

**Target unit alternative:** if the total is computed client-side or in a shared
`applyDiscount(subtotal, code)` function, demote to a unit test on that function
instead — no HTTP at all.

---

## Conversion 2 — Selenium (Python): role loop via UI login → parameterized API authz test

Logging in as each role through the browser to check what each may do is an authz
matrix. The rule lives at the endpoint; assert it there per token. Keep one UI
test that the correct nav renders for one role.

### Before — `tests/ui/test_permissions.py`

```python
import pytest
from selenium import webdriver
from selenium.webdriver.common.by import By

ROLES = [
    ("admin",  "admin@x.com",  True),
    ("editor", "editor@x.com", True),
    ("viewer", "viewer@x.com", False),
]

@pytest.mark.parametrize("role,email,can_delete", ROLES)
def test_delete_button_visibility(role, email, can_delete):
    driver = webdriver.Chrome()
    driver.get("https://app.example.com/login")
    driver.find_element(By.NAME, "email").send_keys(email)
    driver.find_element(By.NAME, "password").send_keys("pw")
    driver.find_element(By.CSS_SELECTOR, "button[type=submit]").click()
    driver.get("https://app.example.com/projects/1")
    buttons = driver.find_elements(By.CSS_SELECTOR, ".delete-btn")
    assert (len(buttons) > 0) == can_delete
    driver.quit()
```

Three real browsers, three logins, brittle CSS selector — to check who may delete.

### After — `tests/api/test_project_authz.py` (parameterized API authz test)

```python
import pytest
import requests

BASE = "https://app.example.com"

@pytest.mark.parametrize("role,expected_status", [
    ("admin",  204),
    ("editor", 204),
    ("viewer", 403),
])
def test_delete_project_authz(role, expected_status, token_for):
    res = requests.delete(
        f"{BASE}/api/projects/1",
        headers={"Authorization": f"Bearer {token_for(role)}"},
    )
    assert res.status_code == expected_status
```

`token_for` is a fixture that mints/returns a token per role via the auth API — no
browser. `viewer_driver` logs in once via the API and injects the session with
`driver.add_cookie(...)` (Selenium requires navigating to the domain first). Plus **one** retained UI smoke that the viewer sees no delete control:

```python
from selenium.webdriver.common.by import By

def test_viewer_ui_hides_delete(viewer_driver):  # fixture: driver with the viewer's session cookie pre-set
    viewer_driver.get(f"{BASE}/projects/1")
    # Selenium has no role locator — match the accessible name instead of a styling class
    assert viewer_driver.find_elements(By.XPATH, "//button[normalize-space()='Delete' or @aria-label='Delete']") == []
```

The authz *rule* is proven at the API for every role; the UI test only proves the
control is hidden — the one thing that manifests in the browser.

---

## Conversion 3 — validation matrix (any framework) → API param test + one UI smoke

The most common overuse: N UI tests retyping a form to check each error message.

**Before (shape):** `test_signup_email_required`, `test_signup_email_invalid`,
`test_signup_password_short`, `test_signup_password_no_digit`, … each does
`goto → fill → submit → assert error text`. 15 browser tests for 15 branches.

**After:** one parameterized API test on `POST /api/users` asserting
`{status, errorField, message}` per input row, plus **one** UI test that submitting
an invalid form shows *an* inline error (proves the form surfaces server errors).

| Before | After |
|--------|-------|
| 15 UI tests, ~3 min, top flake source | 15 API rows (~5s) + 1 UI smoke |
| Each re-logs in / re-navigates | One request each, no browser |
| Asserts error *text* in DOM | Asserts `message` in JSON; UI smoke asserts *an* error renders |

---

## Ripgrep catalog — inventory a suite

Run from the repo root. ripgrep's default regex engine handles alternation, `\b`
and `\s` — no `--pcre2` needed (and some distro builds lack it). `-l` lists
files, `-c` counts matching lines *per file* (pipe to `awk` to total), `-n`
shows line numbers. Adjust globs
(`-g '*.spec.ts'`, `-g '*_test.py'`) to your layout.

### Locate UI/E2E suites by framework × language

```bash
# Playwright (TS/JS, Python, Java, C#)
rg -l '@playwright/test|playwright\.sync_api|playwright\.async_api|com\.microsoft\.playwright|Microsoft\.Playwright'

# Selenium / WebDriver (Python, Java, C#, Ruby, JS)
rg -l 'from selenium import|org\.openqa\.selenium|OpenQA\.Selenium|selenium-webdriver'

# WebdriverIO (JS/TS)
rg -l '@wdio/|browser\.url\(|browser\.\$\$?\('   # bare `$(` matches jQuery/shell too
rg --files -g 'wdio.conf.*'

# Cypress (JS/TS) & Protractor (legacy) — same rubric applies
rg -l 'cy\.visit\(|cy\.get\('        # Cypress
rg -l 'browser\.get\(|element\(by\.' # Protractor → flag for migration
```

### Count test cases per language (UI vs API)

```bash
# UI test cases — point at your UI/e2e dirs
rg -c '^\s*(test|it)(\.(only|skip|fixme))?\s*\(' -g '*.spec.ts' -g '*.spec.js' tests/e2e   # JS/TS
rg -c 'def\s+test_'        -g '*.py'  tests/ui                      # Python
rg -c '@Test\b'            -g '*.java' src/test                     # Java
rg -c '\[(Test|Fact|Theory)\]' -g '*.cs' tests                     # C#
rg -c "\b(it|scenario)\s+['\"]" -g '*_spec.rb' spec                 # Ruby/RSpec

# API/integration test cases — point at your api/integration dirs, same patterns
rg -c '^\s*(test|it)(\.(only|skip|fixme))?\s*\(|def\s+test_|@Test\b|\[(Test|Fact|Theory)\]' tests/api tests/integration
```

Totals: append `| awk -F: '{s+=$NF} END {print s+0}'` to any `-c` command.
These are static counts; prefer the runner's own listing when it works
(`npx playwright test --list`, `pytest --collect-only -q`, `dotnet test
--list-tests`); use rg where the runner has no listing mode. Sum the UI and API
counts to get the pyramid shape. UI ≫ API is the inversion this audit exists to fix.

### Find the demotable smells inside UI test bodies

```bash
# Data-driven matrices (parameterization driving a form)
rg -n 'test\.each|it\.each|@pytest\.mark\.parametrize|@ParameterizedTest|\[TestCase\(|Examples:'

# Data-only assertions (checking state/JSON/status, not the DOM)
rg -n 'expect\(res|expect\(data|\.status\)\.toBe|assert response|assert data\[|assertEquals\(.*response|Assert\.(Equal|True)\(.*response'

# Direct API/DB calls inside a browser test
rg -n 'fetch\(|axios|requests\.(get|post|put|delete)|RestAssured|HttpClient|new .*Connection|SELECT .* FROM'

# UI-driven login/seed setup to relocate
rg -n -B1 -A3 'beforeEach|beforeAll|setUp\(|Background:|before\(:each\)'

# Role/permission loops
rg -n -i 'roles?\s*=|for.*role|as_(admin|user|viewer|editor)|login_as'
```

Every file these surface is a read-and-classify candidate. Open the body, apply
the rubric in `detection-signals.md`, and record the verdict + target endpoint/unit
in `audit-report-template.md`.

---

## Where demoted tests land — API client per stack

Use what the project already has; these need no new framework.

| Stack | API-level target | UI-setup shortcut (skip UI login) |
|-------|------------------|-----------------------------------|
| Playwright TS/JS | `request` fixture / `playwright.request.newContext()` (`APIRequestContext`), same runner | setup project + `storageState` |
| Playwright Python | `playwright.request.new_context(base_url=...)` or `requests`/`httpx` under pytest | `browser.new_context(storage_state=...)` |
| Playwright Java / .NET | `playwright.request().newContext()` / `Playwright.APIRequest.NewContextAsync()`, or REST Assured / `HttpClient` | `setStorageStatePath` / `StorageStatePath` |
| WebdriverIO (v9) | No built-in HTTP client — use `fetch` (Node 18+), `supertest`, or `axios` in the same Mocha/Jasmine runner | `browser.setCookies(...)` after an API login |
| Selenium 4 (Java) | REST Assured or `java.net.http.HttpClient` with JUnit 5 `@ParameterizedTest` | `driver.manage().addCookie(...)` after navigating to the domain |
| Selenium 4 (Python) | `requests`/`httpx` + `@pytest.mark.parametrize` | `driver.add_cookie(...)` |
| Selenium 4 (C#) | `HttpClient` + xUnit `[Theory]`/NUnit `[TestCase]` | `driver.Manage().Cookies.AddCookie(...)` |
| Cypress | `cy.request()` (no page visit) | `cy.session()` |
