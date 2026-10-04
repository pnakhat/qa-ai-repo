# API Contract Testing — Setup & Reference

Runnable, copy-pasteable contract tests, broker commands, and CI wiring.
Check the installed tool versions for API drift; the shapes below target the
Pact V4 spec via `@pact-foundation/pact` v13+ (verified against v17),
`@pact-foundation/pact-cli` v16+, Spectral v6, Schemathesis v4, and oasdiff v1.
Older suites using `PactV3`/`MessageConsumerPact` still run, but write new tests
against `Pact` (an alias of `PactV4`).

## Install

```bash
# Consumer-driven (JS/TS)
npm i -D @pact-foundation/pact
npm i -D @pact-foundation/pact-cli        # bins: pact-broker, pactflow (publish, can-i-deploy, record-deployment)
# no Node? docker run --rm pactfoundation/pact-cli:latest pact-broker ...

# Spec-first (OpenAPI)
npm i -D @stoplight/spectral-cli           # lint the spec
npm i -D @stoplight/prism-cli              # spec-driven mock for consumers
pipx install schemathesis                  # property-based conformance fuzzing (v4 CLI: `st` / `schemathesis`)
brew install oasdiff                        # or: go install github.com/oasdiff/oasdiff@latest
```

## Project layout

```
contracts/
  consumer/
    orders-client.pact.test.ts   # consumer test → generates a pact
  provider/
    verify.test.ts               # provider verification + provider states
  events/
    order-created.pact.test.ts   # async/message pact
pacts/                           # generated pact files (gitignored; published to broker)
openapi.yaml                     # spec-first source of truth
.spectral.yaml                   # lint ruleset
```

---

## Consumer-driven (Pact)

### Consumer test — shape/type matchers, never exact values

`contracts/consumer/orders-client.pact.test.ts`:

```ts
import { Pact, Matchers } from '@pact-foundation/pact';   // Pact === PactV4
import { getOrder } from '../../src/orders-client';
import path from 'path';

const { like, eachLike, integer, datetime, regex } = Matchers;

const provider = new Pact({
  consumer: 'web-checkout',
  provider: 'orders-service',
  dir: path.resolve(process.cwd(), 'pacts'),
});

describe('orders-service contract', () => {
  it('returns an order by id', () => {
    return provider
      .addInteraction()
      .given('an order exists', { id: 42 })               // provider state + params
      .uponReceiving('a request for an existing order')
      .withRequest('GET', '/orders/42', (b) => {
        b.headers({ Accept: 'application/json' });
      })
      .willRespondWith(200, (b) => {
        b.headers({ 'Content-Type': regex('application/json.*', 'application/json') });
        // Assert on TYPE and SHAPE — the matcher's example value is only a sample.
        b.jsonBody({
          id: integer(42),
          status: regex('^(pending|confirmed|shipped)$', 'confirmed'),
          createdAt: datetime("yyyy-MM-dd'T'HH:mm:ss.SSSX", '2026-01-01T10:00:00.000Z'),
          total: like(19.99),                     // any number — decimal() would reject 20
          items: eachLike({ sku: like('SKU-001'), qty: integer(1) }),
          // Only fields the client actually reads belong here — not the whole payload.
        });
      })
      .executeTest(async (mockServer) => {
        const order = await getOrder(mockServer.url, 42);   // your REAL client code
        expect(order.id).toBe(42);                          // assert what the client parsed
      });
  });

  it('returns 404 for an unknown order', () => {
    return provider
      .addInteraction()
      .given('no order exists', { id: 999 })
      .uponReceiving('a request for a missing order')
      .withRequest('GET', '/orders/999')
      .willRespondWith(404)
      .executeTest(async (mockServer) => {
        await expect(getOrder(mockServer.url, 999)).rejects.toThrow(/not found/i);
      });
  });
});
```

Why matchers, not literals: `integer(42)` verifies the provider returns *an
integer* named `id`; if the test asserted `body: { id: 42 }` literally, the pact
would demand the provider always return exactly `42`, which is data, not a
contract. `eachLike` verifies array element shape for 1..N elements.

Rules of thumb for consumer tests:
- **Contract only what the consumer reads** (Postel's law / tolerant reader). An
  extra field the provider adds must never break the pact; a field you list that
  the client ignores just blocks the provider from removing it.
- **Cover the error paths the client handles** (404, 400, 401) — they're contracts too.
- Provider-state params (`given('an order exists', { id: 42 })`) let one state
  handler serve many interactions and keep the state name free of data.

### Provider verification — replay pacts against the real provider

`contracts/provider/verify.test.ts`:

```ts
import { Verifier } from '@pact-foundation/pact';
import { startServer, stopServer, seedConfirmedOrder, deleteOrders } from '../../test/harness';

describe('orders-service verifies its consumers', () => {
  // startServer boots the real provider against a throwaway Postgres
  // (Testcontainers) owned by this run — never a shared or staging DB.
  beforeAll(() => startServer(8080));
  afterAll(() => stopServer());            // stops the app and the container

  const created: number[] = [];            // ids the current state's setup inserted

  it('honours every published consumer pact', () => {
    return new Verifier({
      provider: 'orders-service',
      providerBaseUrl: 'http://localhost:8080',
      providerVersion: process.env.GIT_SHA,          // tie verification to a version + sha
      providerVersionBranch: process.env.GIT_BRANCH,

      // Pull pacts from the broker instead of local files:
      pactBrokerUrl: process.env.PACT_BROKER_BASE_URL,
      pactBrokerToken: process.env.PACT_BROKER_TOKEN,
      consumerVersionSelectors: [
        { mainBranch: true },                        // latest from each consumer's main
        { matchingBranch: true },                    // consumer feature branch with the same name
        { deployedOrReleased: true },                // whatever is live in each environment
      ],
      // A NEW consumer expectation must not break the provider's build before the
      // provider has ever passed it: pending pacts report but don't fail.
      enablePending: true,
      includeWipPactsSince: '2026-01-01',            // pick up un-verified feature-branch pacts
      publishVerificationResult: process.env.CI === 'true',   // never from a laptop

      // Provider states: set up exactly the data an interaction needs, and tear
      // down exactly that data after it (teardown runs pass or fail).
      // Parameters from given(name, params) arrive as the handler argument.
      stateHandlers: {
        'an order exists': {
          setup: async (params) => {
            const order = await seedConfirmedOrder({ id: params.id });  // upsert: idempotent
            created.push(order.id);
            return { id: order.id };
          },
          teardown: async () => { await deleteOrders(created.splice(0)); },
        },
        // Nothing to seed: the DB is private to this run and every state cleans up.
        'no order exists': async () => {},
      },
    }).verifyProvider();
  });
});
```

Provider states replace shared fixtures: each `given(...)` string maps to a
handler that seeds precisely that state and removes it afterwards, isolated per
interaction — no global fixture the whole suite depends on. Check it: run the
verification twice in a row against the same container, and verify one
interaction alone with `PACT_DESCRIPTION="<description>" npx jest verify` (or
`PACT_PROVIDER_STATE="an order exists"`).

Verify against the **real provider code** (real routing, serialization,
validation). Stub only the provider's own *downstream* dependencies (other
services, third-party APIs); stubbing the provider's controllers or repositories
makes the verification prove nothing.

**Trigger provider verification when a pact changes**, not only on provider
commits: configure a broker webhook on `contract_requiring_verification_published`
that starts the provider's verify job with the pact URL, so a consumer PR learns
within minutes whether the provider already supports it.

### Publish + can-i-deploy (broker gates)

```bash
# Consumer: publish the generated pact tagged with version + branch
pact-broker publish ./pacts \
  --consumer-app-version "$GIT_SHA" \
  --branch "$GIT_BRANCH" \
  --broker-base-url "$PACT_BROKER_BASE_URL" \
  --broker-token "$PACT_BROKER_TOKEN"

# Pre-deploy GATE: can this version safely go to production?
# Exits non-zero (fails the pipeline) if any consumer/provider pair is unverified.
# --retry-while-unknown waits for an in-flight webhook-triggered verification.
pact-broker can-i-deploy \
  --pacticipant web-checkout \
  --version "$GIT_SHA" \
  --to-environment production \
  --retry-while-unknown 30 --retry-interval 10 \
  --broker-base-url "$PACT_BROKER_BASE_URL" \
  --broker-token "$PACT_BROKER_TOKEN"

# After a successful deploy: record it so future can-i-deploy checks know what's live
pact-broker record-deployment \
  --pacticipant web-checkout \
  --version "$GIT_SHA" \
  --environment production \
  --broker-base-url "$PACT_BROKER_BASE_URL" \
  --broker-token "$PACT_BROKER_TOKEN"
```

`can-i-deploy` is the gate — publishing a pact only records intent. Without it,
a consumer can ship expecting a field the provider never verified.

Environments must exist in the broker first (`pact-broker create-environment
--name production --production`). Use `record-deployment` for things that
replace the previous version (services); use `record-release` for things that
coexist in many versions (mobile apps, published libraries). Branches and
environments replace the old `--tag` / `latest` workflow — don't build new
pipelines on tags.

---

## Bi-directional contract testing (PactFlow)

When the provider already has an OpenAPI spec and you can't (or won't) run Pact
provider verification — a third-party provider, a team that won't adopt Pact —
PactFlow can compare the consumer pact against the provider's **verified** spec
statically. The provider publishes its spec *plus evidence it was tested*
(Schemathesis/Postman/Drift results):

```bash
pactflow publish-provider-contract openapi.yaml \
  --provider orders-service \
  --provider-app-version "$GIT_SHA" \
  --branch "$GIT_BRANCH" \
  --content-type application/yaml \
  --verification-exit-code=0 \
  --verification-results schemathesis.xml \
  --verification-results-content-type application/xml \
  --verifier schemathesis
```

`can-i-deploy` then works exactly as above. Trade-off: it only proves the pact is
a *subset of the spec*; it's as good as the provider's spec-conformance testing
and can't check provider-state semantics. Prefer real Pact verification when you
own both sides.

---

## Async / event contracts

### Message pact (Pact) — consumer of an event

`contracts/events/order-created.pact.test.ts`:

```ts
import { Pact, Matchers, v4AsynchronousBodyHandler } from '@pact-foundation/pact';
import { handleOrderCreated } from '../../src/consumers/order-created';
import path from 'path';

const { like, integer } = Matchers;

const messagePact = new Pact({
  consumer: 'fulfilment-worker',
  provider: 'orders-service',
  dir: path.resolve(process.cwd(), 'pacts'),
});

describe('order.created event contract', () => {
  it('accepts an order.created message', () => {
    return messagePact
      .addAsynchronousInteraction()
      .given('an order was created')
      .expectsToReceive('an order.created event', (b) => {
        b.withJSONContent({
          eventType: 'order.created',            // exact: the event type IS the contract
          orderId: integer(42),
          total: like(19.99),                     // any number — decimal() would reject 20
          currency: like('GBP'),
        }).withMetadata({ topic: 'orders', contentType: 'application/json' });
      })
      // No mock server for messages: Pact hands the body to your REAL handler;
      // the test passes if the handler processes it without throwing.
      .executeTest(v4AsynchronousBodyHandler(handleOrderCreated));
  });
});
```

Provider side — the description string from `expectsToReceive` maps to a
function that builds the message with the **real** producer code:

```ts
import { MessageProviderPact, providerWithMetadata } from '@pact-foundation/pact';
import { buildOrderCreatedEvent } from '../../src/events/order-created';

it('produces messages its consumers expect', () => {
  return new MessageProviderPact({
    provider: 'orders-service',
    providerVersion: process.env.GIT_SHA,
    providerVersionBranch: process.env.GIT_BRANCH,
    pactBrokerUrl: process.env.PACT_BROKER_BASE_URL,
    pactBrokerToken: process.env.PACT_BROKER_TOKEN,
    consumerVersionSelectors: [{ mainBranch: true }, { deployedOrReleased: true }],
    enablePending: true,
    publishVerificationResult: process.env.CI === 'true',
    messageProviders: {
      'an order.created event': providerWithMetadata(
        () => buildOrderCreatedEvent({ id: 42, total: 19.99, currency: 'GBP' }),
        { topic: 'orders', contentType: 'application/json' },
      ),
    },
  }).verify();
});
```


### AsyncAPI as the spec-first contract

For event-driven systems where a spec is the source of truth, describe channels
in AsyncAPI and validate/lint it:

```yaml
# asyncapi.yaml
asyncapi: 3.0.0
info: { title: Orders Events, version: 1.0.0 }
channels:
  orderCreated:
    address: order.created
    messages:
      OrderCreated:
        payload:
          type: object
          required: [eventType, orderId, total]
          properties:
            eventType: { type: string, const: order.created }
            orderId:   { type: integer }
            total:     { type: number }
```

```bash
npm i -g @asyncapi/cli
asyncapi validate asyncapi.yaml                 # structural validity
spectral lint asyncapi.yaml -r .spectral.yaml   # governance rules
```

---

## Spec-first (OpenAPI)

### Lint the spec — Spectral

`.spectral.yaml`:

Spectral's `spectral:oas` ruleset understands OpenAPI 2.0, 3.0 and 3.1. On 3.1
remember the schema dialect is full JSON Schema 2020-12: `nullable: true` is gone
(use `type: [string, "null"]`), and `example` is superseded by `examples`.

```yaml
extends: ["spectral:oas"]
rules:
  operation-operationId: error          # every operation must be named
  operation-tag-defined: error
  oas3-valid-media-example: error       # examples must match their schema
  no-$ref-siblings: error
```

```bash
spectral lint openapi.yaml -r .spectral.yaml --fail-severity=error
```

### Conformance fuzzing — Schemathesis

Property-based testing that generates requests from the schema and asserts every
response conforms (status, headers, body schema):

```bash
# Schemathesis v4 CLI. Run against a live provider (never production — it sends
# deliberately invalid and destructive requests). --checks all includes
# response-schema, status-code, content-type and negative-data checks.
schemathesis run openapi.yaml \
  --url http://localhost:8080 \
  --checks all \
  --max-examples 200 \
  --header "Authorization: Bearer $TEST_TOKEN" \
  --report junit --report-junit-path schemathesis.xml
# Exit codes: 0 pass, 1 a check failed, 2 config/schema error or nothing tested.

# Replay only the spec's own examples (the old Dredd use case — Dredd itself was
# archived in Nov 2024 and should not be adopted for new work):
schemathesis run openapi.yaml --url http://localhost:8080 --phases examples
```

Fuzzing creates and deletes records with generated inputs, so give each run its
own provider and DB and throw both away afterwards — no cleanup code, nothing
left in a shared environment:

```bash
export COMPOSE_PROJECT_NAME="st-${GITHUB_RUN_ID:-local}"  # unique stack per run
docker compose up -d --wait                                # provider + fresh DB
schemathesis run openapi.yaml --url http://localhost:8080 --checks all \
  --header "Authorization: Bearer $TEST_TOKEN"
status=$?
docker compose down -v                                     # drop containers + DB volume
exit $status
```

In GitHub Actions put `docker compose down -v` in its own step with
`if: always()` so a failed run still tears down.

v3 → v4 flag renames that break old scripts: `--base-url` → `--url`,
`--hypothesis-max-examples` → `--max-examples`, `--junit-xml` →
`--report junit`. Seed with `--seed` when you need to reproduce a failure.

### Breaking-change gate — oasdiff

Diff the proposed spec against the last released spec and fail on any
backward-incompatible change (removed field, tightened type, new required
request field, changed status code):

```bash
# Exits non-zero on breaking changes → fails CI
oasdiff breaking openapi-base.yaml openapi.yaml --fail-on ERR

# Human-readable changelog for the PR description
oasdiff changelog openapi-base.yaml openapi.yaml
```

Fetch `openapi-base.yaml` from the last release tag (e.g. the artifact published
on the previous deploy) so the diff is against what is actually live. In CI the
checkout must include history and tags (`fetch-depth: 0`), or `git describe`
finds nothing. `oasdiff` resolves `$ref`s across files; pass the root spec.

Deprecate before you remove: oasdiff honours `deprecated: true` plus an
`x-sunset` date, and only reports removal of a deprecated operation as breaking
if the sunset date hasn't passed. Add `--deprecation-days-stable 180` to make a
sunset date at least 180 days out mandatory for every deprecation.

---

## GitHub Actions — wiring the gates

Three gates: consumer publishes on PR, provider verifies, and `can-i-deploy`
blocks the deploy.

```yaml
# .github/workflows/contracts.yml
name: contracts
on: [push, pull_request]

env:
  PACT_BROKER_BASE_URL: ${{ vars.PACT_BROKER_BASE_URL }}
  PACT_BROKER_TOKEN: ${{ secrets.PACT_BROKER_TOKEN }}
  GIT_SHA: ${{ github.sha }}
  GIT_BRANCH: ${{ github.head_ref || github.ref_name }}

jobs:
  # --- Consumer side: generate + publish the pact ---------------------------
  consumer:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run test:contract:consumer          # generates ./pacts/*.json
      - name: Publish pact
        run: |
          npx pact-broker publish ./pacts \
            --consumer-app-version "$GIT_SHA" \
            --branch "$GIT_BRANCH"

  # --- Provider side: verify every consumer pact ----------------------------
  provider-verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run test:contract:provider          # Verifier publishes results

  # --- Spec-first breaking-change gate (runs in parallel) -------------------
  spec-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }                     # history + tags for the base spec
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npx spectral lint openapi.yaml -r .spectral.yaml --fail-severity=error
      - name: Breaking-change diff vs last release
        uses: oasdiff/oasdiff-action/breaking@v0
        with:
          base: "${{ github.base_ref && format('origin/{0}', github.base_ref) || 'HEAD~1' }}:openapi.yaml"
          revision: 'HEAD:openapi.yaml'
          fail-on: ERR

  # --- Deploy gate: can-i-deploy BLOCKS a bad release -----------------------
  can-i-deploy:
    needs: [consumer, provider-verify]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci                                 # provides the pact-broker bin
      - name: Gate on compatibility with production
        run: |
          npx pact-broker can-i-deploy \
            --pacticipant web-checkout \
            --version "$GIT_SHA" \
            --to-environment production \
            --retry-while-unknown 30 --retry-interval 10
      # Runs only if the gate above exits 0
      - name: Deploy
        run: ./scripts/deploy.sh production
      - name: Record deployment                     # only after a successful deploy
        run: |
          npx pact-broker record-deployment \
            --pacticipant web-checkout \
            --version "$GIT_SHA" \
            --environment production
```

## Useful commands

```bash
# Pact
npm run test:contract:consumer                 # run consumer tests → pacts/
npm run test:contract:provider                 # verify provider against broker pacts
pact-broker can-i-deploy --pacticipant X --version $SHA --to-environment production
pact-broker record-deployment --pacticipant X --version $SHA --environment production

# Spec-first
spectral lint openapi.yaml -r .spectral.yaml --fail-severity=error
schemathesis run openapi.yaml --url http://localhost:8080 --checks all
oasdiff breaking openapi-base.yaml openapi.yaml --fail-on ERR
npx prism mock openapi.yaml                    # spec-driven mock on :4010 for consumers

# GraphQL
npx @graphql-inspector/cli diff schema-base.graphql schema.graphql   # fail on breaking
```
