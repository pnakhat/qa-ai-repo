# API Contract Testing — Setup & Reference

Runnable, copy-pasteable contract tests, broker commands, and CI wiring.
Check the installed tool versions for API drift; the shapes below target Pact
v3/v4 (`@pact-foundation/pact` v10+), Spectral v6, Schemathesis v3, and
oasdiff v1.

## Install

```bash
# Consumer-driven (JS/TS)
npm i -D @pact-foundation/pact
npm i -D @pact-foundation/pact-cli        # publish, can-i-deploy, record-deployment

# Spec-first (OpenAPI)
npm i -D @stoplight/spectral-cli           # lint the spec
pipx install schemathesis                  # property-based conformance fuzzing
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
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { getOrder } from '../../src/orders-client';
import path from 'path';

const { like, eachLike, integer, iso8601DateTimeWithMillis, regex } = MatchersV3;

const provider = new PactV3({
  consumer: 'web-checkout',
  provider: 'orders-service',
  dir: path.resolve(process.cwd(), 'pacts'),
});

describe('orders-service contract', () => {
  it('returns an order by id', () => {
    provider
      .given('an order 42 exists for a confirmed customer')  // provider state
      .uponReceiving('a request for order 42')
      .withRequest({
        method: 'GET',
        path: '/orders/42',
        headers: { Accept: 'application/json' },
      })
      .willRespondWith({
        status: 200,
        headers: { 'Content-Type': regex('application/json.*', 'application/json') },
        // Assert on TYPE and SHAPE — the matcher's example value is only a sample.
        body: like({
          id: integer(42),
          status: regex('pending|confirmed|shipped', 'confirmed'),
          createdAt: iso8601DateTimeWithMillis(),
          total: like(19.99),
          items: eachLike({
            sku: like('SKU-001'),
            qty: integer(1),
          }),
        }),
      });

    return provider.executeTest(async (mockServer) => {
      const order = await getOrder(mockServer.url, 42);   // your REAL client code
      expect(order.id).toBe(42);                          // exercise the client, not the mock
    });
  });
});
```

Why matchers, not literals: `integer(42)` verifies the provider returns *an
integer* named `id`; if the test asserted `body: { id: 42 }` literally, the pact
would demand the provider always return exactly `42`, which is data, not a
contract. `eachLike` verifies array element shape for 1..N elements.

### Provider verification — replay pacts against the real provider

`contracts/provider/verify.test.ts`:

```ts
import { Verifier } from '@pact-foundation/pact';
import { startServer, stopServer, resetDb, seedConfirmedOrder } from '../../test/harness';

describe('orders-service verifies its consumers', () => {
  beforeAll(() => startServer(8080));
  afterAll(() => stopServer());

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
        { deployedOrReleased: true },                // whatever is live in prod/staging
      ],
      publishVerificationResult: process.env.CI === 'true',

      // Provider states: set up exactly the data an interaction needs.
      stateHandlers: {
        'an order 42 exists for a confirmed customer': async () => {
          await resetDb();
          await seedConfirmedOrder({ id: 42 });
          return 'order seeded';
        },
      },
    }).verifyProvider();
  });
});
```

Provider states replace shared fixtures: each `given(...)` string maps to a
handler that seeds precisely that state, isolated per interaction — no global
fixture the whole suite depends on.

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
pact-broker can-i-deploy \
  --pacticipant web-checkout \
  --version "$GIT_SHA" \
  --to-environment production \
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

---

## Async / event contracts

### Message pact (Pact) — consumer of an event

`contracts/events/order-created.pact.test.ts`:

```ts
import { MessageConsumerPact, MatchersV3 } from '@pact-foundation/pact';
import { handleOrderCreated } from '../../src/consumers/order-created';
import path from 'path';

const { like, integer } = MatchersV3;

const messagePact = new MessageConsumerPact({
  consumer: 'fulfilment-worker',
  provider: 'orders-service',
  dir: path.resolve(process.cwd(), 'pacts'),
});

describe('order.created event contract', () => {
  it('accepts an order.created message', () => {
    return messagePact
      .given('an order was created')
      .expectsToReceive('an order.created event')
      .withContent({
        eventType: like('order.created'),
        orderId: integer(42),
        total: like(19.99),
      })
      .withMetadata({ 'content-type': 'application/json' })
      .verify(async (message) => {
        // Drive your REAL message handler against the contracted payload.
        await handleOrderCreated(message.contents);
      });
  });
});
```

The provider side verifies by producing the message from its real publisher code
using the same `Verifier` (with `messageProviders` / state handlers) so producer
and consumer never drift.

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
# Run against a live provider; --checks all includes response-schema conformance
schemathesis run openapi.yaml \
  --base-url http://localhost:8080 \
  --checks all \
  --hypothesis-max-examples 200 \
  --report junit --report-junit-path schemathesis.xml
```

Alternatively **Dredd** replays the spec's own examples against the provider:

```bash
npx dredd openapi.yaml http://localhost:8080
```

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
on the previous deploy) so the diff is against what is actually live.

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
        with: { node-version: 20, cache: npm }
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
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run test:contract:provider          # Verifier publishes results

  # --- Spec-first breaking-change gate (runs in parallel) -------------------
  spec-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx spectral lint openapi.yaml -r .spectral.yaml --fail-severity=error
      - name: Breaking-change diff vs last release
        run: |
          git show "$(git describe --tags --abbrev=0)":openapi.yaml > openapi-base.yaml
          oasdiff breaking openapi-base.yaml openapi.yaml --fail-on ERR

  # --- Deploy gate: can-i-deploy BLOCKS a bad release -----------------------
  can-i-deploy:
    needs: [consumer, provider-verify]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - name: Gate on compatibility with production
        run: |
          npx pact-broker can-i-deploy \
            --pacticipant web-checkout \
            --version "$GIT_SHA" \
            --to-environment production
      # deploy step runs only if the gate above exits 0
      - name: Record deployment
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
schemathesis run openapi.yaml --base-url http://localhost:8080 --checks all
oasdiff breaking openapi-base.yaml openapi.yaml --fail-on ERR
npx dredd openapi.yaml http://localhost:8080

# GraphQL
npx @graphql-inspector/cli diff schema-base.graphql schema.graphql   # fail on breaking
```
