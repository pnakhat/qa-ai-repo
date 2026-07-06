# Test Pyramid — Reference Examples

One concrete, runnable example per layer/level so "what goes where" is unambiguous.
Each block ends with a one-line note on **why it belongs at that level**. Tools are
realistic (Vitest/Jest, Testing Library, MSW, Testcontainers, Pact, Playwright) but the
shapes matter more than the exact library — check installed versions for API drift.

The running example is an **orders** domain: a web app that lets a customer place an
order, an `orders-svc` backend with a Postgres store, and a queue that notifies a worker.

---

## FE unit — pure logic, no DOM, no network

```ts
// web/src/lib/cart.test.ts  (Vitest)
import { describe, it, expect } from 'vitest';
import { cartTotal } from './cart';

describe('cartTotal', () => {
  it('sums line items and applies a percentage discount', () => {
    const items = [
      { sku: 'A', price: 1000, qty: 2 }, // cents
      { sku: 'B', price: 500, qty: 1 },
    ];
    expect(cartTotal(items, { percentOff: 10 })).toBe(2250);
  });

  it('never returns a negative total', () => {
    expect(cartTotal([{ sku: 'A', price: 100, qty: 1 }], { percentOff: 300 })).toBe(0);
  });
});
```

**Why unit:** `cartTotal` is a pure function — inputs → output, no rendering, no I/O.
Milliseconds to run, one assertion per rule; there is no cheaper place to prove this.

---

## FE component — rendered UI with network mocked (Testing Library + MSW)

```ts
// web/src/features/checkout/Checkout.test.tsx  (Vitest + Testing Library + MSW)
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { Checkout } from './Checkout';

const server = setupServer(
  http.post('/api/orders', () =>
    HttpResponse.json({ id: 'ord_123', status: 'confirmed' }, { status: 201 }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it('confirms the order and shows the confirmation number', async () => {
  render(<Checkout cart={[{ sku: 'A', price: 1000, qty: 1 }]} />);

  await userEvent.click(screen.getByRole('button', { name: /place order/i }));

  expect(await screen.findByText(/order confirmed/i)).toBeInTheDocument();
  expect(screen.getByText(/ord_123/)).toBeInTheDocument();
});

it('shows a retryable error when the API fails', async () => {
  server.use(http.post('/api/orders', () => new HttpResponse(null, { status: 500 })));
  render(<Checkout cart={[{ sku: 'A', price: 1000, qty: 1 }]} />);

  await userEvent.click(screen.getByRole('button', { name: /place order/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/try again/i);
});
```

**Why component:** it proves the *rendered* wiring — user interaction, loading/error
states, and how the component reacts to each API response — without a browser or a real
backend. MSW stubs the boundary so the test is fast and deterministic; the API's own
correctness is proved in the BE, and the request/response *shape* by a contract (below).

---

## BE unit — domain logic, no I/O

```ts
// orders-svc/src/domain/order.test.ts  (Vitest/Jest)
import { describe, it, expect } from 'vitest';
import { placeOrder } from './order';

describe('placeOrder', () => {
  it('rejects an order that exceeds the per-customer credit limit', () => {
    const result = placeOrder({
      customer: { creditLimit: 5000, outstanding: 4000 },
      items: [{ sku: 'A', price: 2000, qty: 1 }],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('CREDIT_LIMIT_EXCEEDED');
  });

  it('accepts an order within the limit and computes the charge', () => {
    const result = placeOrder({
      customer: { creditLimit: 5000, outstanding: 0 },
      items: [{ sku: 'A', price: 2000, qty: 2 }],
    });
    expect(result).toMatchObject({ ok: true, charge: 4000 });
  });
});
```

**Why unit:** the credit-limit *business rule* is the single most important thing to test
and it needs no database. Proving it here (not through the UI or an HTTP call) means dozens
of edge cases run in milliseconds. This is the rule the FE component test above must *not*
re-test through the UI.

---

## BE integration — real DB via Testcontainers

```ts
// orders-svc/test/order-repo.int.test.ts  (Vitest + Testcontainers)
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { migrate } from '../src/db/migrate';
import { OrderRepo } from '../src/db/order-repo';

let container: StartedPostgreSqlContainer;
let pool: Pool;
let repo: OrderRepo;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  pool = new Pool({ connectionString: container.getConnectionUri() });
  await migrate(pool);            // run real migrations against the real engine
  repo = new OrderRepo(pool);
}, 60_000);

afterAll(async () => {
  await pool.end();
  await container.stop();
});

it('persists an order and enforces the unique idempotency key', async () => {
  const order = { customerId: 'cust_1', total: 4000, idempotencyKey: 'idem_1' };

  const saved = await repo.insert(order);
  expect(saved.id).toBeDefined();

  await expect(repo.insert(order)).rejects.toThrow(/duplicate key/i);
});
```

**Why integration:** SQL, migrations, constraints, and transactions are exactly what a
mock cannot verify — a unique index or a cascading delete only fails against a real engine.
Testcontainers gives a throwaway Postgres so the test is realistic yet hermetic and
CI-portable. Keep these far fewer than the unit tests.

---

## Contract — consumer expectation pinned so the seam can't drift (Pact)

```ts
// web/test/orders-api.pact.test.ts  (Pact consumer)
import { PactV3, MatchersV3 } from '@pact-foundation/pact';
import { OrdersClient } from '../src/api/orders-client';

const { like, integer } = MatchersV3;
const provider = new PactV3({ consumer: 'web', provider: 'orders-svc' });

it('POST /api/orders returns a confirmed order', async () => {
  provider
    .given('the customer is within their credit limit')
    .uponReceiving('a request to place an order')
    .withRequest({
      method: 'POST',
      path: '/api/orders',
      body: { items: [{ sku: 'A', qty: 1 }] },
    })
    .willRespondWith({
      status: 201,
      body: { id: like('ord_123'), status: like('confirmed'), total: integer(1000) },
    });

  await provider.executeTest(async (mock) => {
    const client = new OrdersClient(mock.url);
    const order = await client.placeOrder({ items: [{ sku: 'A', qty: 1 }] });
    expect(order.status).toBe('confirmed');
  });
});
```

The generated pact is published to a broker; `orders-svc` verifies it in its own CI:

```ts
// orders-svc/test/orders-api.verify.test.ts  (Pact provider verification)
import { Verifier } from '@pact-foundation/pact';

it('honors every consumer contract', () =>
  new Verifier({
    provider: 'orders-svc',
    providerBaseUrl: 'http://localhost:3000',
    pactBrokerUrl: process.env.PACT_BROKER_URL,
    stateHandlers: {
      'the customer is within their credit limit': async () => seedCustomerWithCredit(),
    },
  }).verifyProvider());
```

**Why contract:** the FE and BE are tested independently above; the one thing neither
proves alone is that they still *agree* on the request/response shape. A contract pins that
agreement on both sides and breaks in CI the moment either drifts — replacing the
cross-service E2E you would otherwise need. (An OpenAPI/Schemathesis or Dredd check gives a
schema-level equivalent when you own both sides and don't need per-consumer expectations.)

---

## Middleware — queue producer→consumer with real infra (Testcontainers)

```ts
// notif-worker/test/order-events.int.test.ts  (Vitest + Testcontainers, RabbitMQ)
import { RabbitMQContainer, StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import amqp from 'amqplib';
import { publishOrderPlaced } from '../src/publisher';
import { startConsumer } from '../src/consumer';

let container: StartedRabbitMQContainer;

beforeAll(async () => {
  container = await new RabbitMQContainer('rabbitmq:3.13-alpine').start();
}, 60_000);
afterAll(() => container.stop());

it('delivers an order.placed event to the notification consumer', async () => {
  const url = container.getAmqpUrl();
  const received: unknown[] = [];
  await startConsumer(url, (msg) => received.push(msg));

  await publishOrderPlaced(url, { orderId: 'ord_123', customerId: 'cust_1' });

  await vi.waitFor(() => expect(received).toHaveLength(1), { timeout: 5000 });
  expect(received[0]).toMatchObject({ orderId: 'ord_123' });
});
```

**Why integration:** exchange/queue bindings, routing keys, ack/nack, and serialization
are real broker behavior a mock can't reproduce. A real RabbitMQ in a container proves the
event actually flows producer→consumer. The *schema* of `order.placed` is separately pinned
by an AsyncAPI/message-pact contract so producer and consumer can evolve independently.

---

## E2E — one critical journey through the whole stack (Playwright)

```ts
// e2e/checkout.spec.ts  (Playwright)
import { test, expect } from '@playwright/test';

test('a customer places an order and sees confirmation', async ({ page }) => {
  await page.goto('/products');
  await page.getByRole('button', { name: 'Add SKU-A to cart' }).click();
  await page.getByRole('link', { name: 'Cart' }).click();
  await page.getByRole('button', { name: 'Place order' }).click();

  await expect(page.getByText('Order confirmed')).toBeVisible();
  await expect(page).toHaveURL(/\/orders\/ord_/);
});
```

**Why E2E (and why only one):** this proves the *whole system* wires together — real FE,
real backend, real DB, real broker — for the single revenue-critical path. Every rule it
touches (totals, credit limit, persistence, the confirmation event) is already proved
cheaply below; E2E exists only to catch integration gaps the lower layers can't see. Add a
second only for another journey of comparable business risk.

---

## Pushing a test down — before / after

A common smell: a slow, flaky E2E that asserts a **backend rule** by driving the browser.

### ❌ Before — a business rule tested through the UI

```ts
// e2e/credit-limit.spec.ts — SLOW, FLAKY, WRONG LAYER
test('rejects an order over the credit limit', async ({ page }) => {
  await loginAs(page, 'customer-near-limit');       // full auth flow
  await page.goto('/products');
  await page.getByRole('button', { name: 'Add SKU-A to cart' }).click();
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page.getByRole('alert')).toHaveText(/credit limit/i);
});
```

This boots the whole stack and drives a browser to check *one branch of a domain rule* —
and it must repeat for every credit-limit edge case. Minutes of runtime, real flake risk,
and it re-tests logic that has nothing to do with the UI.

### ✅ After — split across the levels that actually own each concern

```ts
// 1. BE unit — the rule and all its edge cases (milliseconds each)
expect(placeOrder({ customer: { creditLimit: 5000, outstanding: 4900 },
                     items: [{ sku: 'A', price: 2000, qty: 1 }] }).error)
  .toBe('CREDIT_LIMIT_EXCEEDED');

// 2. FE component — the UI shows the error when the API returns 422 (MSW-stubbed)
server.use(http.post('/api/orders', () =>
  HttpResponse.json({ error: 'CREDIT_LIMIT_EXCEEDED' }, { status: 422 })));
// ...render, click "Place order", assert getByRole('alert') shows "credit limit"

// 3. Contract — FE and BE agree that this case is a 422 with that error body
//    (the Pact interaction above, with a "customer is over their credit limit" state)
```

**Result:** every edge case runs in the BE unit suite; the FE proves it *renders* the error;
the contract guarantees the 422 shape stays in sync. The E2E for this rule disappears
entirely — the one checkout E2E above already covers the happy path through the real stack.
Same coverage, orders of magnitude faster and stabler.
