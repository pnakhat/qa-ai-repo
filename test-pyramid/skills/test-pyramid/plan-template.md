# Test Pyramid Strategy — <Application Name>

> Generated <date> · Scope: frontend + backend + middleware

## 0. Architecture map
Layers detected and their tech:
- **Frontend:** framework, state, routing, design system.
- **Backend:** services, API style (REST/GraphQL/gRPC), data stores.
- **Middleware:** gateway/BFF, auth, queues/event bus, cache, workers, 3rd parties.
Diagram or bullet list of how requests/events flow across layers.

## 1. Frontend test plan
- **Unit:** <hooks/reducers/utils/validators to cover> — tool.
- **Component/integration:** <rendered flows, forms, a11y, visual> — tool.
- **Consumer contracts:** <each API the FE consumes> — tool.
- Explicitly **not** in the FE: <backend rules to push down>.

## 2. Backend test plan
- **Unit:** <domain logic, calculations, validators>.
- **Integration:** <repositories, handlers, adapters, migrations> — real DB via Testcontainers.
- **Provider contracts / schema conformance:** <APIs to verify>.
- **Service/component:** <services to test in isolation>.

## 3. Middleware test plan
- **Unit:** <routing/auth/rate-limit/transform logic>.
- **Integration:** <queues, gateway, cache> with real infra.
- **Message/event contracts:** <topics/queues and their schemas>.
- **Resilience:** <retries, timeouts, circuit breakers, idempotency>.

## 4. Seams & contracts (the glue)
Table of every boundary → contract that covers it, so E2E can stay small.
| Seam | Consumer | Provider | Contract |
|------|----------|----------|----------|
| FE ↔ Orders API | web app | orders-svc | Pact / OpenAPI |
| orders-svc ↔ payments | orders-svc | payments-svc | Pact |
| orders-svc → events | producer | notif-worker | AsyncAPI / message pact |

## 5. End-to-end journeys (keep to a handful)
List the few critical full-stack paths that justify E2E, and why each can't be
covered lower down.

## 6. Cross-cutting
Performance/load, security (SAST/DAST/deps), accessibility — owners and cadence.

## 7. Target proportions & current gap
| Level | Target | Now | Action |
|-------|--------|-----|--------|
| Unit | ~70% | ? | |
| Integration/component | ~20% | ? | |
| Contract | ~7% | ? | |
| E2E | ~3% | ? | |
Note if the current suite is inverted and the rebalancing moves.

## 8. Tooling summary
Per layer: chosen runners, mocking, contract tooling, CI reporting.

## 9. Build order (Now / Next / Later)
Concrete first tests to add, then build-out, then hardening — with owners.
