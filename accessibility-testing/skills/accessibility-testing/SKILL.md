---
name: accessibility-testing
description: Test web UIs for accessibility to WCAG 2.2 AA with axe-core automation plus the manual keyboard, focus, and screen-reader checks automation can't catch. Use when adding a11y assertions to a suite, auditing a page or component, wiring a11y into CI, or reviewing UI for WCAG conformance. Enforces guardrails against aria-label spam, div-soup role hacks, disabling axe rules to go green, and treating an axe pass as full coverage. See `reference.md` for setup code, rule/tag config, contrast thresholds, and a manual checklist.
---

# Accessibility Testing

Make the UI usable by everyone — keyboard users, screen-reader users, low-vision
users, people who need reduced motion. Automate what a machine can verify, then
manually test what it can't. **An axe pass is a floor, not a certificate.**

## Evidence-driven execution

Read [verification.md](verification.md) before selecting the workflow or reporting results. It defines domain-specific failure probes, evidence requirements, and limits on what a passing run proves.

## Combine automation with interaction and human review

Automated coverage varies by page, state, rule set, and issue distribution; do not assign a universal percentage. Scanners can detect many accessible-name and markup issues. Scripted keyboard tests can verify focus movement and restoration, while people assess whether interaction and announcements are usable. Report these separately.

| ✅ Automation catches (cheap, gate it) | Needs interaction tests and human judgment |
|----------------------------------------|-------------------------------------------|
| Missing `alt` attribute on `<img>` | Whether `alt` text is *meaningful* or noise |
| Color contrast below AA thresholds | Whether focus *order* is logical |
| Form control with no associated label | Whether an error message is *understandable* |
| Duplicate `id` referenced by ARIA, invalid ARIA attribute | Whether a custom widget is operable by keyboard |
| Missing document `lang`, empty heading | Whether a modal traps and restores focus |
| Wrong `role` value, `aria-*` on wrong element | Whether a screen reader announces state changes |
| Missing `name` on a form field | Whether the reading order matches the visual order |
| Pointer target < 24×24 CSS px (`target-size`, only with the `wcag22aa` tag) | Whether focus is hidden behind a sticky header or cookie banner |

Run axe on every key page/component to hold the line, then walk the manual
checklist below for the flows that matter.

## Automated setup — assert zero violations at the right level

Push a11y assertions as low as possible: unit/component where the markup lives,
one browser smoke for the assembled page. See `reference.md` for full code.

| Level | Tool | Use for |
|-------|------|---------|
| Component (unit) | `jest-axe` / `vitest-axe` (`toHaveNoViolations`) | Design-system components, forms, widgets |
| Storybook | `@storybook/addon-a11y` with `parameters.a11y.test: 'error'` (runs in the Vitest addon) | Every documented component state |
| E2E / page | `@axe-core/playwright` (`AxeBuilder`) as a fixture-level assertion | Assembled pages, real routes, post-interaction states |

- Wrap axe as a **fixture-level assertion** (`checkA11y`) so any spec can assert
  a page is clean without boilerplate — a violation fails the test like any other.
- **Scope** the scan to a region when auditing one widget:
  `new AxeBuilder({ page }).include('#checkout-form')`. Don't scan the whole
  page when you mean one component.
- **Run axe after** navigation settles — not during animations, transitions, or
  loading states, which produce transient false results.
- Assert **zero violations at a chosen impact level** (e.g. fail on
  `serious`/`critical`; triage `moderate`/`minor`) rather than an ad-hoc count.
- **Pass the tags explicitly**: `withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'])`.
  axe's WCAG 2.2 rule (`target-size`) is **off by default** and only runs when
  `wcag22aa` is requested. Tag filtering also drops `best-practice` rules
  (`region`, `heading-order`, `landmark-one-main`); add that tag as a
  non-blocking report if you want them.
- **Automate the keyboard checks you can.** `page.keyboard.press('Tab')` +
  `expect(locator).toBeFocused()` pins focus order, modal focus trap, and focus
  restore; `toMatchAriaSnapshot` pins the role/name tree of a widget;
  `page.emulateMedia({ reducedMotion: 'reduce' })` tests the reduced-motion path.
  These still don't replace a screen-reader pass.

## Test data: setup and teardown

Most scans only read a page. Scans of states that need data — a filled cart, a
form's error state after submit, a populated table — create it, and then the
same rules as any E2E test apply. Code in `reference.md` (seeded-state scan).

- **Seed the state through the API in a fixture**, not by clicking through
  other pages, and never by borrowing whatever a shared account happens to hold.
- **Unique per test/worker** (run id + worker index + random suffix) so parallel
  scans don't edit each other's cart.
- **Delete what the fixture created after `await use()`** — that runs when the
  axe assertion fails too. Never wipe shared tables.
- **Mock third-party widgets and feeds** at the boundary when the scan is about
  your markup; it needs no cleanup.
- **Component-level scans** (`jest-axe`) unmount between tests — keep Testing
  Library's automatic `cleanup` on; don't render into a shared container.
- **Guard by environment**: seeding fixtures refuse production; a production
  a11y smoke is read-only.

## The manual checklist — where the real bugs are

Walk these for every key flow. `reference.md` has the copy-pasteable long form
plus VoiceOver/NVDA quick keys.

- **Keyboard-only nav.** Unplug the mouse. Every interactive element reachable by
  `Tab`, in a logical order; nothing reachable by mouse but not keyboard. No
  **keyboard trap** (you can always `Tab`/`Shift+Tab`/`Esc` out). **Visible focus**
  on every focusable element. **Skip link** to bypass repeated nav.
- **Focus management.** On route change, focus moves to a sensible target (heading
  or main), not lost to `<body>`. Opening a **modal** moves focus in and traps it;
  closing **restores** focus to the trigger. Focus never lands on hidden elements.
- **Screen-reader semantics.** Every control exposes a correct **role**, an
  **accessible name**, and current **state** (`aria-expanded`, `aria-checked`,
  `aria-selected`, `aria-current`). Dynamic updates announce via a live region.
- **Forms.** Every input has a programmatically **associated label**
  (`<label for>` or `aria-labelledby`). Errors are **identified in text** (not
  color alone) and tied to the field (`aria-describedby`, `aria-invalid`).
  Required state is conveyed, not just styled.
- **Color contrast.** Body text ≥ **4.5:1**; large text (≥ 24px, or ≥ 18.66px
  bold) and UI components/graphics ≥ **3:1**. Information is never carried by
  color alone.
- **Motion.** Honor `prefers-reduced-motion`: disable non-essential animation,
  parallax, and auto-play when the user asks for less motion.
- **Zoom / reflow.** Text resizes to **200%** without loss of content (1.4.4),
  and content reflows without two-dimensional scrolling at **320 CSS px** wide —
  i.e. 400% zoom on a 1280px viewport (1.4.10). Text spacing overrides (1.4.12)
  don't clip content.
- **WCAG 2.2 additions** — scanners barely cover these, so check them by hand:
  - **2.4.11 Focus Not Obscured (AA)** — a focused element is never fully hidden
    by a sticky header/footer, chat widget, or cookie banner.
  - **2.5.7 Dragging Movements (AA)** — every drag (sortable list, slider, map)
    has a single-pointer alternative (buttons, click-to-move).
  - **2.5.8 Target Size (AA)** — pointer targets ≥ 24×24 CSS px, or spaced so a
    24px circle around each doesn't overlap a neighbour (inline links exempt).
  - **3.2.6 Consistent Help (A)** — help/contact links sit in the same relative
    place on every page.
  - **3.3.7 Redundant Entry (A)** — info already entered in the flow is
    auto-filled or selectable, not retyped (e.g. "billing same as shipping").
  - **3.3.8 Accessible Authentication (AA)** — login needs no cognitive test
    (memorise, transcribe, solve a puzzle): paste and password managers work,
    `autocomplete` is set, and any CAPTCHA has a non-cognitive alternative.

## WCAG severity — prioritize by impact, not by count

Map every finding to a WCAG 2.2 success criterion and an axe impact level, then
fix blockers first. A hundred `minor` contrast nits matter less than one keyboard
trap that locks a screen-reader user out of checkout.

| Severity | Meaning | Examples | Priority |
|----------|---------|----------|----------|
| **Blocker** (critical) | Task is impossible for some users | Keyboard trap, unlabeled submit, focus lost | Fix now — ship blocker |
| **Serious** | Major barrier, workaround is painful | No visible focus, missing form labels, 2.9:1 contrast on body text | Fix this iteration |
| **Moderate** | Degraded experience | Illogical heading order, redundant links | Backlog with a date |
| **Minor** | Polish | Slightly low contrast on decorative text | Batch later |

## ARIA — the first rule is don't use ARIA

Native HTML elements come with roles, states, keyboard behavior, and focus for
free. ARIA only *describes*; it never *adds* behavior. Reach for a native element
first; reach for ARIA only when no native element fits.

The five rules of ARIA, paraphrased:

1. **Use a native HTML element** if one with the semantics and behavior you need
   exists. `<button>` over `<div role="button">`, always.
2. **Don't change native semantics** unless you truly must
   (`<h2 role="tab">` — avoid; wrap instead).
3. **All interactive ARIA controls must be keyboard-operable** — a `role="button"`
   needs `tabindex="0"` *and* `Enter`/`Space` handlers you wrote yourself.
4. **Don't put `role="presentation"` or `aria-hidden="true"` on a focusable
   element** — you'll hide it from AT while it still takes focus.
5. **Every interactive element needs an accessible name** — via content,
   `aria-label`, or `aria-labelledby`.

`aria-*` is **correct** when adding relationships or state a native element can't
express (`aria-describedby` for a hint, `aria-live` for async updates,
`aria-expanded` on a disclosure). It's **harmful** when it papers over the wrong
element (`<div role="button">`) or duplicates/overrides a name the element
already has correctly.

## Anti-patterns — smells to reject

| ❌ Smell | ✅ Fix |
|---------|--------|
| `aria-label` on everything, including elements with visible text | Let visible text be the name; use `aria-label` only when there is no visible label |
| `<div role="button" onclick>` | Use `<button>` — you get focus, `Enter`/`Space`, and role for free |
| Disabling an axe rule (`.disableRules([...])`) to go green | Fix the markup; a silenced rule is an un-fixed bug hidden from the report |
| `outline: none` with no replacement | Provide a clear `:focus-visible` style; never remove focus without one |
| `alt=""` on a meaningful image | Empty `alt` is only for decoration; describe informative images |
| `tabindex="1"` (positive tabindex) | Use `0`/`-1` and fix DOM order; positive values break natural tab flow |
| "axe passed, so we're accessible" | Automation ≈ 30–40%; add the manual keyboard/SR/focus review |
| Color-only error/required indication | Add text + `aria-invalid`/`aria-describedby`; don't rely on red alone |
| `aria-hidden="true"` on a focusable node | Remove focusability too, or drop the `aria-hidden` |
| Custom widget with no keyboard support | Implement the WAI-ARIA Authoring Practices keyboard pattern, or use native |
| Scanning the cart of a shared seed account that other tests change | Seed a unique cart in a fixture, scan, delete it after `use()` |

## Guardrails

- **Prefer native HTML over ARIA.** Every ARIA role you add is behavior you now
  own and must test by keyboard and screen reader.
- **Never disable an axe rule to pass.** Fix the underlying markup. Scoping a scan
  to a region is fine; silencing a real violation is not.
- **Never claim full accessibility from automation alone.** State the coverage
  honestly: automated pass + which manual checks were performed.
- **Cite the WCAG success criterion** for every finding so it's actionable and
  auditable, not an opinion. Use WCAG 2.2 numbering; **4.1.1 Parsing is obsolete**
  in 2.2 — don't report raw duplicate ids or HTML validity under it (map to 1.3.1
  or 4.1.2 only when they actually break a name, role, or relationship).
- **Give a concrete fix, not advice.** Name the element and the exact markup/CSS
  change, not "improve accessibility."

## Works well with

Soft companions — none is a hard dependency; use them where they already exist.

- **`playwright-e2e`** — add `checkA11y` as a **fixture-level assertion** on key
  pages so a11y regressions fail the same E2E run.
- **`ui-test-auditor`** — a11y assertions belong at the **right level**: component/
  unit where possible, one browser smoke for the assembled page. Don't pile every
  a11y check into slow E2E.
- **`visual-regression`** — focus rings, contrast, and `prefers-reduced-motion`
  states are **visual** too; snapshot them so a "clean" refactor can't silently
  remove a focus outline.

## Reference

See `reference.md` for install commands, working `@axe-core/playwright`,
`jest-axe`/`vitest-axe`, and Storybook setups, rule/tag config (`wcag2a` …
`wcag22aa`) with safe scoping/exclusion, Playwright keyboard/focus and
reduced-motion tests, a full manual keyboard + screen-reader + WCAG 2.2
checklist, the contrast thresholds table, and a CI gate that fails on new
violations.
