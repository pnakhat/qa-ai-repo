---
name: api-contract-testing
description: Design and implement API contract tests so a provider can't break its consumers. Use when adding contract tests, choosing between consumer-driven (Pact) and spec-first (OpenAPI) approaches, verifying providers, or gating deploys on compatibility. Covers REST, GraphQL, and event/message contracts.
---

# API Contract Testing

Contract testing verifies that two services **agree on the interface** without
standing up both in a slow, flaky end-to-end environment. It catches breaking
changes at the boundary — the highest-value, lowest-cost API tests.

## Pick the approach (see `tooling.md` for tool choices)

- **Consumer-driven contracts (Pact)** — when *you own the consumers* and want
  each consumer to declare exactly what it needs. Consumers generate a contract;
  the provider verifies against all of them. Best for internal microservices.
- **Spec-first / provider contracts (OpenAPI, JSON Schema, AsyncAPI)** — when a
  spec is the source of truth (public API, many/unknown consumers). Validate
  that real traffic conforms to the spec in both directions.
- Use **both** when you publish a spec *and* have known internal consumers.

## Consumer-driven (Pact) workflow

1. **Consumer test**: write an interaction (request → expected response) against
   a Pact mock; run the consumer's real client code against it. This generates a
   pact file — assert on *shape/types*, not exact values (use matchers).
2. **Publish** the pact (with consumer version + git sha + branch/tag) to a
   Pact Broker / PactFlow.
3. **Provider verification**: the provider replays every consumer interaction
   against its real implementation, using provider states to set up data.
4. **`can-i-deploy`**: before releasing either side, query the broker to confirm
   the version is compatible with everything it will meet in the target env.
   Block the deploy if not.

## Spec-first workflow

1. Treat the **OpenAPI/AsyncAPI** spec as the contract; lint it (Spectral) in CI.
2. **Provider side**: assert responses conform to the spec — property-based
   fuzzing (Schemathesis) or replaying the spec's examples (Dredd).
3. **Consumer side**: run against a spec-driven **mock** (Prism) so consumers
   develop against the contract, not a live service.
4. **Detect breaking changes**: diff the spec against the last released version
   (e.g. `oasdiff`) and fail CI on backward-incompatible changes.

## Principles

- **Contract ≠ end-to-end.** Verify the interface shape and semantics, not full
  business flows. Keep each interaction small and deterministic.
- **Match on type/shape, not brittle exact values** (except enums/status codes
  that are genuinely part of the contract).
- **Version everything** — pacts and specs are tied to a service version + sha
  so `can-i-deploy` can reason about environments.
- **Backward compatibility is the rule**: additive changes are safe; removing a
  field, tightening a type, or changing status codes is breaking — version it.
- **Provider states** replace shared fixtures — each interaction declares the
  state it needs; keep them cheap and isolated.
- **Gate deploys**, don't just report. A contract test that doesn't block a bad
  release is documentation, not a test.

## CI wiring

- Consumer PR → run consumer tests → publish pact (tagged with branch).
- Provider PR → verify against `main`-tagged pacts → publish results.
- Pre-deploy → `can-i-deploy --to <env>` (or spec breaking-change diff) as a gate.
- Nightly → verify all consumers against provider `main` to catch drift early.

See `tooling.md` for language-specific tools and when to use each.
