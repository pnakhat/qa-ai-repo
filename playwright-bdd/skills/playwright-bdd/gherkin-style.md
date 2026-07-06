# Business-Language Gherkin — Style Guide

The `.feature` file is a living spec the business reads. Write **declarative**
scenarios in domain language; push all mechanics into step definitions.

## Declarative, not imperative

| ❌ Imperative (UI mechanics) | ✅ Declarative (business behavior) |
|------------------------------|-----------------------------------|
| `When I click "#menu" then click "Logout"` | `When she signs out` |
| `When I fill "#qty" with "3" and click "Add"` | `When she adds 3 licences to the cart` |
| `Then "#total" has text "$90"` | `Then she is charged the discounted total` |
| `Given I navigate to "/admin/users?role=2"` | `Given an administrator is managing users` |
| `Then element ".toast" is visible` | `Then she is told the change was saved` |

If a step names a selector, URL, button label, or keystroke, it's too low-level.

## Anatomy

- **Feature** — a capability/business goal, with a short "In order to / As a /
  I want" narrative. Not a page name.
- **Scenario** — one behavior with one outcome, titled in plain business terms.
- **Given** — context/state that already exists (no actions to *test*).
- **When** — the single action or event under test.
- **Then** — the observable business outcome (what the user perceives), not DOM.
- **And/But** — continue the previous clause; don't chain unrelated actions.

## Rules of thumb

- **One When per scenario.** Multiple `When`s usually means multiple scenarios.
- **Third-person, present tense, consistent voice** ("she", "the customer").
- **Ubiquitous language** — reuse the exact domain terms from the PRD/team.
- **Generic + parameterized** over hard-coded. Prefer
  `Given a "gold" member` (Outline) to one scenario per member type.
- **No test scaffolding in the prose** — ids, tokens, fixtures, timings belong in
  steps, not Examples meant for humans.
- **Background** holds shared *business* preconditions, not UI setup.
- **Scenario count = behaviors**, not UI pages.

## Good example

```gherkin
Feature: Refunds
  In order to keep customers happy
  As a support agent
  I want to refund eligible orders

  Background:
    Given a delivered order paid by card

  Scenario: Full refund within the return window
    When the agent issues a full refund
    Then the customer is refunded the order total
    And the order is marked as refunded

  Scenario: Refund is blocked after the return window
    Given the return window has passed
    When the agent attempts a refund
    Then the refund is declined with a clear reason
```

Every line above is behavior a product owner can validate — the clicks that make
it happen live in `RefundPage` and the step definitions.

## Smells to reject during conversion

- Selectors/labels/URLs in `.feature` text.
- Steps like "I wait 2 seconds" (waits belong in POM assertions).
- Scenario titles that name a page or a test id.
- One mega-scenario with many `When`/`Then` pairs → split it.
- Examples tables full of ids/tokens instead of meaningful domain values.
