---
name: accessibility-testing
description: Test web UIs for accessibility to WCAG 2.2 AA with axe-core automation plus the manual keyboard, focus, and screen-reader checks automation can't catch. Use when adding a11y assertions to a suite, auditing a page or component, wiring a11y into CI, or reviewing UI for WCAG conformance. Enforces guardrails against aria-label spam, div-soup role hacks, disabling axe rules to go green, and treating an axe pass as full coverage. See `reference.md` for setup code, rule/tag config, contrast thresholds, and a manual checklist.
---

# Accessibility Testing

Make the UI usable by everyone — keyboard users, screen-reader users, low-vision
users, people who need reduced motion. Automate what a machine can verify, then
manually test what it can't. **An axe pass is a floor, not a certificate.**

## Automation catches ~30–40% — the rest is manual

Automated tools reliably detect only about a third of real accessibility issues.
The high-value bugs — a keyboard trap, a focus that vanishes, a button that reads
as "button" with no name — are invisible to a scanner. Split the work honestly.

| ✅ Automation catches (cheap, gate it) | ❌ Needs a human (automation can't judge) |
|----------------------------------------|-------------------------------------------|
| Missing `alt` attribute on `<img>` | Whether `alt` text is *meaningful* or noise |
| Color contrast below AA thresholds | Whether focus *order* is logical |
| Form control with no associated label | Whether an error message is *understandable* |
| Duplicate `id`, invalid ARIA attribute | Whether a custom widget is operable by keyboard |
| Missing document `lang`, empty heading | Whether a modal traps and restores focus |
| Wrong `role` value, `aria-*` on wrong element | Whether a screen reader announces state changes |
| Missing `name` on a form field | Whether the reading order matches the visual order |

Run axe on every key page/component to hold the line, then walk the manual
checklist below for the flows that matter.

## Automated setup — assert zero violations at the right level

Push a11y assertions as low as possible: unit/component where the markup lives,
one browser smoke for the assembled page. See `reference.md` for full code.

| Level | Tool | Use for |
|-------|------|---------|
| Component (unit) | `jest-axe` / `vitest-axe` (`toHaveNoViolations`) | Design-system components, forms, widgets |
| Storybook | `@storybook/addon-a11y` + `@axe-core/playwright` on stories | Every documented component state |
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
- **Zoom / reflow.** Content is usable and doesn't require two-dimensional
  scrolling at **200%** browser zoom and reflows at **400%** (≈320px viewport).

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

## Guardrails

- **Prefer native HTML over ARIA.** Every ARIA role you add is behavior you now
  own and must test by keyboard and screen reader.
- **Never disable an axe rule to pass.** Fix the underlying markup. Scoping a scan
  to a region is fine; silencing a real violation is not.
- **Never claim full accessibility from automation alone.** State the coverage
  honestly: automated pass + which manual checks were performed.
- **Cite the WCAG success criterion** for every finding so it's actionable and
  auditable, not an opinion.

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
`jest-axe`, and Storybook setups, rule/tag config (`wcag2a`, `wcag2aa`,
`wcag22aa`) with safe scoping/exclusion, a full manual keyboard + screen-reader
checklist, the contrast thresholds table, and a CI gate that fails on new
violations.
