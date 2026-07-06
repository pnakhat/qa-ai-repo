---
name: test-pyramid
description: Analyze a full-stack application (frontend, backend, middleware) and design a complete test pyramid — deciding exactly which tests belong in the FE, which in the BE, which at middleware/seams, and at what level (unit, integration/component, contract, E2E). Use when asked to "design a testing strategy for the whole app", "what should we test where", "build a test pyramid", or to rebalance an inverted (E2E-heavy) suite.
---

# Full-Stack Test Pyramid

Design testing for an application **as a whole system of layers**, not one suite.
The goal: every behavior is tested at the **lowest level that can meaningfully
verify it**, seams are covered by **contract tests**, and only a handful of
journeys reach **end-to-end**. See `layer-test-matrix.md` for the full
layer × level grid of what to test and which tools to use, and `reference.md`
for a runnable example test at every level (plus a "push a test down" before/after).

## Method

1. **Map the architecture.** Identify each layer and its technology:
   - **Frontend** — SPA/SSR framework, state management, design system, routes.
   - **Backend** — services, APIs (REST/GraphQL/gRPC), domain logic, data stores.
   - **Middleware** — API gateway/BFF, auth, message queues/event bus, caching,
     service mesh, background workers, third-party integrations.
   Inspect the repo (package manifests, framework configs, `src/` layout, CI) and
   confirm rather than assume.

2. **List behaviors per layer**, then **assign each to the lowest suitable
   level** using this decision order:
   - Pure logic / rendering / validation → **unit**.
   - Behavior that needs a real collaborator (DB, rendered tree + network, queue)
     → **integration / component**.
   - Agreement across a boundary (FE↔API, service↔service, producer↔consumer)
     → **contract** (Pact / OpenAPI / AsyncAPI) — this is what lets you keep E2E small.
   - Only a full critical user journey that no lower level can prove → **E2E**.

3. **Cover the seams, not the internals twice.** Where two layers meet, use a
   contract test once instead of re-testing both sides through E2E.

4. **Set the shape.** Aim for a true pyramid, roughly:
   - ~70% unit · ~20% integration/component · <10% contract+E2E (E2E a small
     handful). If the current suite is an inverted "ice-cream cone" (mostly E2E),
     call it out and give the rebalancing plan.

5. **Output the plan** using `plan-template.md`: per-layer test lists, the seam
   contracts, the few E2E journeys, target proportions, tooling, CI wiring, and
   what to build first.

## What goes where (summary — detail in `layer-test-matrix.md`)

- **Frontend:** unit test component logic/hooks/reducers/utils; component-test
  rendered UI with mocked network (Testing Library + MSW), accessibility (axe),
  and visual regression; **consumer contract** tests against the API; a few E2E
  journeys. Do NOT drive backend business rules through the UI.
- **Backend:** unit test domain/business logic and validators; integration-test
  repositories and route handlers against a real (containerized) DB and real
  adapters; **provider contract** verification + OpenAPI/schema conformance;
  service/component tests with downstreams mocked.
- **Middleware:** unit test routing/transformation/auth/rate-limit logic;
  integration-test queue producers/consumers, gateway routing, and cache
  behavior with real infra (Testcontainers); **message/event contracts**
  (AsyncAPI, Pact message pacts); resilience tests for retries, timeouts,
  circuit breakers, and idempotency.
- **Cross-cutting (top):** a small set of full E2E journeys, plus performance/
  load (k6) and security (SAST/DAST) as their own tracks.

## Anti-patterns — smells to reject

| ❌ Smell | ✅ Fix |
|---------|--------|
| Inverted pyramid / "ice-cream cone" — mostly slow E2E, few units | Rebuild the base: push each E2E down to a component, integration, or contract test |
| A backend business rule (pricing, credit limit, validation) asserted by driving the browser | Test the rule as a **BE unit** test; let the FE component test only prove the UI *renders* the result |
| Every edge case of one behavior covered by a separate E2E | Cover edge cases at unit level; keep **one** E2E for the happy journey |
| Two layers each re-tested end-to-end to prove they agree | One **contract test** at the seam (Pact / OpenAPI / AsyncAPI) |
| Mocking the system under test (e.g. stubbing `orders-svc` in an `orders-svc` integration test) | Mock only what you *don't* own; use a real DB/broker via Testcontainers |
| Same behavior tested at three levels "to be safe" — duplicate coverage | Assign it to the **one** lowest level that can prove it; delete the rest |
| Unit tests that mock everything and assert implementation details (call counts, internal state) | Test observable behavior — inputs → outputs, what the user sees |
| Integration tests hitting shared staging DBs or live third-party APIs | Ephemeral containers (Testcontainers/LocalStack) + WireMock for third parties |
| E2E used as the only check on a seam between two services you own | Consumer + provider **contract**; reserve E2E for full-journey coverage |
| "Component" tests that spin up the real backend | Mock the network (MSW) — the backend is proved in its own suite |

## CI wiring

Run the fast, deterministic base on every change and reserve slow, broad suites for later
stages. Each layer earns its place in the pipeline by speed and blast radius.

| Stage | Runs | Rationale | Gate |
|-------|------|-----------|------|
| **Pre-commit** (hook) | Changed-file **unit** tests, lint, typecheck | Sub-second feedback; catch typos/logic before push | Local only |
| **PR / pull request** | Full **unit** + **component/integration** (Testcontainers) + **consumer contracts** (publish pacts) | The bulk of coverage; fast enough to block merge | **Required check — blocks merge** |
| **Merge / main** | **Provider contract verification** against published pacts + smoke E2E | Confirms both sides of every seam still agree before it lands | **Required — revert on red** |
| **Nightly / scheduled** | Full **E2E** suite, performance/load (k6), security (SAST/DAST), full a11y | Slow, broad, environment-heavy; not needed per-PR | Alert on failure; triage next morning |

- **Merge gates:** PR unit+integration+contract must be green; provider verification must
  pass before a consumer's contract-changing PR merges (use a Pact broker's `can-i-deploy`).
- **Zero retries on main.** Retries hide flakes; a retried green is a bug to fix, not pass.
- **Fail fast, cheap first:** order stages unit → integration → contract → E2E so the
  cheapest signal blocks earliest and the expensive suites only run once the base is green.
- **Parallelize by layer/shard** to keep the PR stage under a few minutes as the suite grows.
- **Publish contracts on PR, verify on merge:** consumers publish pacts tagged with the
  branch; providers verify them so a breaking API change fails *before* it ships.

## Principles

- **Push tests down.** A bug catchable by a unit test should not need an E2E.
- **Contracts replace integration E2E.** Seams verified by contracts let you
  delete most cross-service E2E.
- **Test behavior, not implementation.** Especially in the FE — assert what the
  user sees, not internal state.
- **Isolation + speed at the base**, realism concentrated at the seams, breadth
  only at the tip.
- **Right-size to risk:** put the extra depth on revenue/safety-critical flows.
