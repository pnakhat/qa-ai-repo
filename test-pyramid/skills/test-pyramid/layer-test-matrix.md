# Layer × Level Test Matrix

For each layer, what to test at each pyramid level and typical tools. Assign each
behavior to the **lowest** level that can prove it.

## Frontend (UI)

| Level | What to test in the FE | Tools |
|-------|------------------------|-------|
| Unit | Pure logic: hooks, reducers/stores, selectors, formatters, validation, utility fns | Jest / Vitest |
| Component / integration | Rendered components & flows with **network mocked**; forms, conditional UI, routing; accessibility; visual regression | Testing Library, MSW, jest-axe, Storybook + Playwright/Chromatic snapshots |
| Contract (consumer) | The shape/behavior the FE expects from each API it calls | Pact (consumer), or types generated from OpenAPI/GraphQL schema |
| E2E | A few critical user journeys through the real app | Playwright / Cypress |

**Don't** test backend business rules or data validation *through* the UI — mock
the API and test those rules in the BE.

## Backend (services / APIs)

| Level | What to test in the BE | Tools |
|-------|------------------------|-------|
| Unit | Domain/business logic, calculations, state machines, validators, mappers — no I/O | Jest/Vitest, Pytest, JUnit, Go test, RSpec |
| Integration | Repositories/ORM against a **real DB**, route/controller handlers, external adapters, migrations | Testcontainers, Supertest, test DB, WireMock for third parties |
| Contract (provider) | Verify the provider satisfies every consumer contract; conform to the published OpenAPI/GraphQL schema | Pact (provider verification), Schemathesis, Dredd, oasdiff |
| Component / service | The whole service in isolation with downstreams stubbed | in-process HTTP + mocked deps |

## Middleware (gateway / queues / auth / cache / workers)

| Level | What to test in middleware | Tools |
|-------|----------------------------|-------|
| Unit | Routing/transformation rules, auth/authorization middleware, rate limiting, serialization | framework test runner |
| Integration | Queue producers/consumers, event handlers, gateway routing/BFF aggregation, cache read/write/invalidation | Testcontainers (Kafka/RabbitMQ/Redis), LocalStack |
| Contract (message/event) | Event & message schemas between producers and consumers | AsyncAPI validation, Pact message pacts |
| Resilience | Retries, timeouts, circuit breakers, idempotency, dead-letter handling, backpressure | Toxiproxy, fault-injection, chaos tests |

## Cross-cutting (top of the pyramid — keep small)

| Concern | What | Tools |
|---------|------|-------|
| E2E journeys | A handful of full-stack critical paths only | Playwright / Cypress |
| Performance / load | Throughput, latency, soak, spike | k6, Gatling, Locust |
| Security | SAST, dependency scan, DAST | Semgrep/CodeQL, Snyk/Dependabot, OWASP ZAP |
| Accessibility | End-to-end a11y on key flows | axe, Lighthouse CI |

## Target shape

- ~70% unit · ~20% integration/component · ~7% contract · ~3% E2E (a small,
  fixed set). Contracts do the heavy lifting at seams so E2E stays tiny.
- Inverted suite (mostly slow E2E)? Push each E2E down: replace with a component
  test (FE), an integration test (BE), or a contract test (seam) wherever possible.
