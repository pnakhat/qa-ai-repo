---
name: test-pyramid
description: Analyze a full-stack application (frontend, backend, middleware) and design a complete test pyramid — deciding exactly which tests belong in the FE, which in the BE, which at middleware/seams, and at what level (unit, integration/component, contract, E2E). Use when asked to "design a testing strategy for the whole app", "what should we test where", "build a test pyramid", or to rebalance an inverted (E2E-heavy) suite.
---

# Full-Stack Test Pyramid

Design testing for an application **as a whole system of layers**, not one suite.
The goal: every behavior is tested at the **lowest level that can meaningfully
verify it**, seams are covered by **contract tests**, and only a handful of
journeys reach **end-to-end**. See `layer-test-matrix.md` for the full
layer × level grid of what to test and which tools to use.

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

## Principles

- **Push tests down.** A bug catchable by a unit test should not need an E2E.
- **Contracts replace integration E2E.** Seams verified by contracts let you
  delete most cross-service E2E.
- **Test behavior, not implementation.** Especially in the FE — assert what the
  user sees, not internal state.
- **Isolation + speed at the base**, realism concentrated at the seams, breadth
  only at the tip.
- **Right-size to risk:** put the extra depth on revenue/safety-critical flows.
