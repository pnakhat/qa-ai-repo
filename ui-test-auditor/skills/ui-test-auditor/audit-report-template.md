# UI Test Overuse Audit — <Project>

> Generated <date> · Frameworks: <Playwright/WebdriverIO/Selenium> · Languages: <…>

## 0. Suite inventory
| Framework | Language | Files | Test cases |
|-----------|----------|-------|-----------|
| … | … | … | … |
Current pyramid shape: UI __ · API __ · unit __ → **inverted? yes/no**.

## 1. Headline findings (ranked by payoff)
1. <e.g. "42 UI tests validate form errors — collapse to 1 API param test + 1 UI smoke; ~6 min & main flake source removed">
2. …

## 2. Per-test recommendations
| Test (file:line) | Currently asserts | Verdict | Move to | Notes |
|------------------|-------------------|---------|---------|-------|
| checkout.spec:12 | order total math | Demote | API `POST /orders` | logic, not UI |
| login.spec:8 | role-based menu items | Keep (UI) | — | rendering |
| signup.spec:30–120 | 15 validation cases via form | Demote | API `POST /users` (param) | keep 1 UI happy path |

Verdict ∈ {Keep-UI, Demote-API, Demote-Unit}.

## 3. Repetition to collapse
Groups of near-identical UI tests (differ only by data) → one parameterized
API/unit test + one UI smoke each. List each group and the merged target.

## 4. UI-driven setup to relocate
Login/seed/navigate performed through the UI only to reach a precondition →
programmatic/API setup or fixtures.

## 5. What stays at the UI (and why)
The small set of genuine browser journeys + rendering/interaction/a11y/visual
tests that are correctly placed.

## 6. Target shape & savings
| Level | Now | After |
|-------|-----|-------|
| UI | | |
| API | | |
| Unit | | |
Estimated runtime and flake reduction.

## 7. Migration plan (Now / Next / Later)
Order the demotions by payoff; note any API endpoints/units that must be added
to receive the relocated coverage.
