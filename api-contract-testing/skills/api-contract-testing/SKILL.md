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
| Consumers you own, but the provider can't/won't run Pact verification (third party, other org) | **Bi-directional (PactFlow)** — consumer pact compared statically against the provider's *tested* OpenAPI spec |
| Event/message boundary (Kafka, AMQP, WebSocket) | **Message pacts** (consumer-driven) or **AsyncAPI** (spec-first) |
| GraphQL | Schema-diff breaking-change detection (GraphQL Inspector / Rover checks) |

Consumer-driven asks *"what does each consumer actually use?"* and only verifies
that. Spec-first asks *"does traffic match the published contract?"* — necessary
when you can't enumerate consumers. See `tooling.md` for the tool matrix.

## Consumer-driven (Pact) workflow

1. **Consumer test**: write an interaction (request → expected response) against
   a Pact mock; run the consumer's real client code against it. This generates a
   pact file — assert on *shape/types*, not exact values (use matchers).
2. **Publish** the pact (consumer version = git sha, plus `--branch`) to a
   Pact Broker / PactFlow. Branches + environments replace the legacy tags.
3. **Provider verification**: the provider replays every consumer interaction
   against its real implementation, using provider states to set up data. A
   broker webhook (`contract_requiring_verification_published`) runs it as soon
   as a pact changes; **pending** pacts and **WIP** pacts let a new consumer
   expectation be verified without breaking the provider's main build.
4. **`can-i-deploy`**: before releasing either side, query the broker to confirm
   the version is compatible with everything it will meet in the target env.
   Block the deploy if not.

## Spec-first workflow

1. Treat the **OpenAPI/AsyncAPI** spec as the contract; lint it (Spectral) in CI.
2. **Provider side**: assert responses conform to the spec — property-based
   fuzzing with Schemathesis (`--phases examples` replays the spec's own
   examples; Dredd, the old tool for that, was archived in 2024). Never fuzz
   production — it sends invalid and destructive requests.
3. **Consumer side**: run against a spec-driven **mock** (Prism) so consumers
   develop against the contract, not a live service.
4. **Detect breaking changes**: diff the spec against the last released version
   (e.g. `oasdiff breaking --fail-on ERR`) and fail CI on backward-incompatible
   changes. Remove things through deprecation (`deprecated: true` + `x-sunset`),
   not in one step.

A spec only works as a contract if it is the *real* interface: generate it from
code (or code from it) and fail CI when they drift. A hand-maintained spec that
nobody checks against the implementation is fiction.

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

- **Contract ≠ end-to-end, and ≠ provider functional test.** Verify the
  interface shape and semantics, not full business flows or provider business
  rules (those belong in the provider's own tests). Keep each interaction small
  and deterministic.
- **Contract only what the consumer uses** (tolerant reader). A pact listing
  fields the client never reads blocks the provider from evolving for no reason.
- **Cover the error responses the client handles** (404/400/401/409), not just
  the happy path — a changed error shape breaks clients too.
- **Match on type/shape, not brittle exact values** (except enums/status codes
  that are genuinely part of the contract).
- **Version everything** — pacts and specs are tied to a service version + sha,
  and no provider verification runs without a `providerVersion`, so
  `can-i-deploy` can reason about environments.
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
| A new consumer pact turns the provider's main build red | `enablePending: true` (+ `includeWipPactsSince`) so un-verified pacts report without failing |
| Provider verification stubs the provider's own controllers/repositories | Run the real provider code; stub only its *downstream* dependencies |
| Pact used to test a public API with unknown consumers | Spec-first (OpenAPI + Schemathesis + oasdiff) — Pact needs known consumers |
| Pipelines built on `--tag` / `latest` selectors | Use `--branch`, `record-deployment`/`record-release` and environment selectors |
| Schemathesis or any fuzzer pointed at production | Run against an ephemeral or test environment with test credentials |
| Spec lint / breaking-change diff not in CI | `spectral lint` + `oasdiff breaking` on every PR, failing on `ERR` |
| `can-i-deploy` result recorded but deploy proceeds anyway | Non-zero exit must **block** the pipeline, not warn |
| No `record-deployment` after release | Record it so later `can-i-deploy` knows what's actually live |

## CI wiring

Three gates: consumers publish pacts on PR, providers verify, and `can-i-deploy`
blocks the deploy. Full runnable workflow in `reference.md`.

- **Consumer PR** → run consumer tests → publish pact tagged with branch + sha.
- **Provider PR** → verify against broker pacts (`mainBranch` + `deployedOrReleased`
  selectors) → publish verification results.
- **Pre-deploy** → `can-i-deploy --to-environment <env> --retry-while-unknown`
  (Pact) and/or `oasdiff breaking` + `spectral lint` (spec-first) as
  **blocking** gates.
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
      --retry-while-unknown 30 --retry-interval 10 \
      --broker-base-url "$PACT_BROKER_BASE_URL" \
      --broker-token "$PACT_BROKER_TOKEN"
```

## Reference

See `reference.md` for: a full Pact consumer test with matchers, provider
verification with provider states and pending/WIP pacts, publish + `can-i-deploy` +
`record-deployment` commands, bi-directional contracts, a spec-first path (Spectral / Schemathesis / oasdiff), message-pact and
AsyncAPI event snippets, and a complete GitHub Actions workflow wiring the gates.
See `tooling.md` for language-specific tools and when to use each.

## Works well with

These objectives extend contract coverage; neither is a hard dependency.

- **`performance-testing`** — load-, stress-, and soak-test the very endpoints
  whose request/response contracts you pinned here, so shape *and* speed are guaranteed.
- **`test-pyramid`** — contracts are the seam layer of the pyramid; use them to
  replace slow cross-service E2E rather than duplicating coverage at the tip.
