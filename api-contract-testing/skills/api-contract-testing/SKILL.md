---
name: api-contract-testing
description: Design and implement API contract tests so a provider can't break its consumers. Enforces guardrails against exact-value matching, unversioned pacts, contract tests that are secretly E2E, and deploys that ship without a can-i-deploy gate. Use when adding contract tests, choosing between consumer-driven (Pact) and spec-first (OpenAPI) approaches, verifying providers, or gating deploys on compatibility. Covers REST, GraphQL, and event/message contracts. See `reference.md` for runnable tests, broker commands, and CI wiring.
---

# API Contract Testing

Contract testing verifies that two services **agree on the interface** without
standing up both in a slow, flaky end-to-end environment. It catches breaking
changes at the boundary — the highest-value, lowest-cost API tests.

## Pick the approach

| Situation | ✅ Approach |
|-----------|-----------|
| You own the consumers; internal microservices | **Consumer-driven (Pact)** — each consumer declares exactly what it needs; provider verifies against all of them |
| Public API, many/unknown consumers, a spec is the source of truth | **Spec-first (OpenAPI/AsyncAPI)** — validate real traffic conforms to the spec in both directions |
| You publish a spec *and* have known internal consumers | **Both** — spec-first for the public surface, Pact for the internal consumers |
| Event/message boundary (Kafka, AMQP, WebSocket) | **Message pacts** (consumer-driven) or **AsyncAPI** (spec-first) |
| GraphQL | Schema-diff breaking-change detection (GraphQL Inspector / Rover checks) |

Consumer-driven asks *"what does each consumer actually use?"* and only verifies
that. Spec-first asks *"does traffic match the published contract?"* — necessary
when you can't enumerate consumers. See `tooling.md` for the tool matrix.

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

## Matchers — assert on shape, not data

A contract fixes the *shape* of the interface, not the sample data used to write
it. Matching literal values turns a contract test into a snapshot of one row.

| ✅ Contract (shape/type) | ❌ Brittle (exact value) |
|--------------------------|--------------------------|
| `integer(42)` — "an integer named id" | `id: 42` — provider must always return 42 |
| `eachLike({ sku: like('X') })` — array of that shape, 1..N | `items: [{ sku: 'SKU-001' }]` — exact array |
| `iso8601DateTimeWithMillis()` — a timestamp | `createdAt: '2026-01-01T00:00:00.000Z'` |
| `regex('pending\|confirmed\|shipped', 'confirmed')` — enum membership | `status: 'confirmed'` |

Exceptions where the exact value *is* the contract: enum members, HTTP status
codes, error codes, and fixed header values. See `reference.md` for full matcher
usage in a consumer test.

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

## Anti-patterns — smells to reject

| ❌ Smell | ✅ Fix |
|---------|--------|
| Asserting exact values (`id: 42`, literal timestamps) | Type/shape matchers (`integer()`, `iso8601...()`, `eachLike`) |
| Contract test that spins up the DB and walks a full business flow | Keep it to one interaction; that's an E2E test, not a contract |
| Publishing a pact without a version + git sha | Tag every pact with `--consumer-app-version $SHA --branch $BRANCH` |
| Deploy pipeline that publishes pacts but never gates | `can-i-deploy --to-environment <env>` as a blocking step |
| Tightening a field / making it required and shipping quietly | That's a **breaking change** — bump the version, run `oasdiff breaking` |
| Removing a field consumers use, trusting nobody noticed | Provider verification against published pacts catches it — run it |
| Shared global fixture the whole suite mutates | Per-interaction **provider states** (`given(...)` → state handler) |
| Consumer test asserting on the Pact mock's own response | Drive your **real client code**; assert on what the client parsed |
| Provider verifies only local pact files | Pull from the broker with `consumerVersionSelectors` (main + deployed) |
| Spec lint / breaking-change diff not in CI | `spectral lint` + `oasdiff breaking` on every PR, failing on `ERR` |
| `can-i-deploy` result recorded but deploy proceeds anyway | Non-zero exit must **block** the pipeline, not warn |
| No `record-deployment` after release | Record it so later `can-i-deploy` knows what's actually live |

## CI wiring

Three gates: consumers publish pacts on PR, providers verify, and `can-i-deploy`
blocks the deploy. Full runnable workflow in `reference.md`.

- **Consumer PR** → run consumer tests → publish pact tagged with branch + sha.
- **Provider PR** → verify against broker pacts (`mainBranch` + `deployedOrReleased`
  selectors) → publish verification results.
- **Pre-deploy** → `can-i-deploy --to-environment <env>` (Pact) and/or `oasdiff
  breaking` + `spectral lint` (spec-first) as **blocking** gates.
- **Post-deploy** → `record-deployment` so future compatibility checks know
  what's live in each environment.
- **Nightly** → verify all consumers against provider `main` to catch drift early.

```yaml
# The gate that matters — a non-zero exit blocks the deploy
- name: can-i-deploy to production
  run: |
    npx pact-broker can-i-deploy \
      --pacticipant web-checkout \
      --version "${{ github.sha }}" \
      --to-environment production \
      --broker-base-url "$PACT_BROKER_BASE_URL" \
      --broker-token "$PACT_BROKER_TOKEN"
```

## Reference

See `reference.md` for: a full Pact consumer test with matchers, provider
verification with provider states, publish + `can-i-deploy` + `record-deployment`
commands, a spec-first path (Spectral / Schemathesis / oasdiff), message-pact and
AsyncAPI event snippets, and a complete GitHub Actions workflow wiring the gates.
See `tooling.md` for language-specific tools and when to use each.
