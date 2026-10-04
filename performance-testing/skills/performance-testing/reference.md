# Performance Testing — Setup & Reference

Runnable, copy-pasteable k6 scripts, Lighthouse CI budgets, metric formulas, and
CI wiring. Check installed tool versions for drift; the shapes below target
**k6 v1.x / v2.x** (verified against 2.3) and **@lhci/cli v0.15 / Lighthouse
v12+**. k6 runs `.ts` scripts natively since v1.0 — rename any file below to
`.ts` and add types; no bundler needed.

k6 v2 removed: `--no-summary` (use `--summary-mode=disabled`), the
`externally-controlled` executor, `k6 login`, and `k6 cloud script.js` (now
`k6 cloud run script.js`). Lighthouse 12 removed native `budgets`; use the
`resource-summary:*` assertions shown below instead.

## Install

```bash
# Backend load testing
brew install k6                       # or: https://grafana.com/docs/k6/latest/set-up/install-k6/

# Frontend web-vitals in CI
npm i -D @lhci/cli                     # Lighthouse CI runner + assertions (uses the runner's Chrome)
```

## Project layout

```
perf/
  load.js              # expected-peak load test — the baseline gate
  stress.js            # ramp past peak to find the knee
  soak.js              # hours at moderate load — leak detection
  spike.js             # sudden surge, then drop
lighthouserc.json      # frontend budgets + assertions
.github/workflows/perf.yml
```

---

## k6 — load test (the baseline gate)

`perf/load.js`. Ramp to expected peak, hold at steady state, ramp down. Thresholds
are tied to SLOs and **fail the run** on breach.

```js
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// --- Config (override at run time: k6 run -e BASE_URL=... -e RATE=20) ---
const BASE_URL = __ENV.BASE_URL || 'https://staging.example.com';
const RATE = Number(__ENV.RATE || 20);   // ITERATIONS (user journeys) per second, not requests

// --- Custom metrics: measure business-meaningful timings/rates, not just HTTP ---
const checkoutLatency = new Trend('checkout_latency', true); // true = time metric (ms)
const businessErrors  = new Rate('business_errors');         // logical failures, not just 5xx
const ordersCreated   = new Counter('orders_created');

// VU sizing (Little's Law): VUs needed = arrival rate × iteration duration.
// One iteration ≈ 2 requests + 5–13 s of think time ≈ 10 s, so 20 it/s needs
// ~200 VUs. Too few VUs → k6 drops iterations and you silently under-load.
const VUS = Math.ceil(RATE * 10 * 1.25);

export const options = {
  // Open model: k6 starts iterations at a target ARRIVAL RATE, independent of how
  // slow the system gets — so a degrading server doesn't silently reduce load
  // (the closed-model "coordinated omission" trap).
  scenarios: {
    warmup: {                                 // JIT, pools, caches, autoscaling settle
      executor: 'ramping-arrival-rate',
      startRate: 0, timeUnit: '1s',
      preAllocatedVUs: VUS, maxVUs: VUS * 2,
      stages: [{ target: RATE, duration: '2m' }],
    },
    peak: {                                   // the window the SLOs are judged on
      executor: 'constant-arrival-rate',
      rate: RATE, timeUnit: '1s', duration: '5m',
      startTime: '2m',                        // begins when warm-up ends
      preAllocatedVUs: VUS, maxVUs: VUS * 2,
    },
  },
  // --- Thresholds ARE the gate: any breach → non-zero exit → CI fails ---
  // Scoped to {scenario:peak} so warm-up noise can't pass or fail the run.
  thresholds: {
    // SLO: p95 < 300 ms, p99 < 800 ms at expected peak
    'http_req_duration{scenario:peak}': ['p(95)<300', 'p(99)<800'],
    // SLO: error rate < 0.1% at peak
    'http_req_failed{scenario:peak}': ['rate<0.001'],
    // Custom: checkout path p95 < 500 ms, and <1% business-logic failures
    'checkout_latency{scenario:peak}': ['p(95)<500'],
    business_errors: ['rate<0.01'],
    // Functional checks must hold under load
    checks: ['rate>0.99'],
    // The load generator must actually deliver the modelled load
    dropped_iterations: ['count<1'],
  },
};

const headers = { Accept: 'application/json' };

export default function () {
  group('browse', () => {
    const res = http.get(`${BASE_URL}/api/products?page=1`, {
      headers,
      tags: { name: 'GET /api/products' },   // one URL bucket, not one per query string
    });
    check(res, {
      'browse 200': (r) => r.status === 200,
      'browse has items': (r) => (r.json('items') || []).length > 0,
    });
    sleep(Math.random() * 3 + 2); // think time: 2–5 s, a real user reading the page
  });

  group('checkout', () => {
    const res = http.post(
      `${BASE_URL}/api/checkout`,
      JSON.stringify({ sku: 'SKU-001', qty: 1 }),
      { headers: { ...headers, 'Content-Type': 'application/json' } },
    );
    // Record the checkout timing into the custom Trend regardless of pass/fail.
    checkoutLatency.add(res.timings.duration);
    const ok = check(res, { 'checkout 201': (r) => r.status === 201 });
    businessErrors.add(!ok);           // logical failure rate, independent of HTTP
    if (ok) ordersCreated.add(1);
    sleep(Math.random() * 5 + 3);      // think time: 3–8 s
  });
}
```

Notes:
- `dropped_iterations` > 0 means the generator ran out of VUs (or CPU) and
  delivered *less* load than modelled — raise `maxVUs` or add generators; the
  latency numbers from that run are not valid for the target rate.
- Tag dynamic URLs (`tags: { name: ... }`) or every `/orders/123` becomes its own
  metric series and thresholds/summary become unreadable.
- Use per-VU unique test data (`SharedArray` from a CSV/JSON of accounts and
  SKUs) so you exercise the working set, not one cached row.

Run it:

```bash
k6 run -e BASE_URL=https://staging.example.com perf/load.js
# Exit code 99 when a threshold breaches → the CI step fails.
```

The end-of-test summary lists every threshold with ✓/✗ and per-scenario
values. Read the **peak-scenario** percentiles and the error rate together —
never the average alone. k6's default trend stats are avg/min/med/max/p(90)/p(95);
add p(99) with `--summary-trend-stats`.

---

## k6 — test data lifecycle

`perf/checkout-data.js`. `setup()` provisions a pool before load starts,
each VU uses its own account, every write carries the run id, and `teardown()`
removes it all — also when a threshold fails the run. A run killed outright
skips `teardown()`; the age-based sweeper below catches that.

```js
import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'https://perf.example.com';
const RUN_ID = __ENV.RUN_ID || `${Date.now()}`;          // CI: the pipeline run id
const PREFIX = `perf-${RUN_ID}`;
const MAX_VUS = 200;
const SAFE_HOSTS = (__ENV.PERF_SAFE_HOSTS || 'perf.example.com,localhost').split(',');
const ADMIN = {
  headers: { Authorization: `Bearer ${__ENV.ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
};

export const options = {
  setupTimeout: '2m',                                    // provisioning the pool takes a while
  scenarios: {
    peak: {
      executor: 'constant-arrival-rate',
      rate: 20, timeUnit: '1s', duration: '5m',
      preAllocatedVUs: 100, maxVUs: MAX_VUS,
    },
  },
  // Scoped to the load scenario: setup()/teardown() requests don't count toward the SLO.
  thresholds: { 'http_req_duration{scenario:peak}': ['p(95)<300'] },
};

export function setup() {
  const host = BASE_URL.replace(/^\w+:\/\//, '').split(/[:/]/)[0];   // k6 has no global URL
  if (!SAFE_HOSTS.includes(host)) exec.test.abort(`Refusing to provision data on ${host}`);

  // One account per possible VU, so no two VUs mutate the same cart.
  const accounts = [];
  for (let i = 1; i <= MAX_VUS; i++) {
    const res = http.post(`${BASE_URL}/api/test-accounts`,
      JSON.stringify({ email: `${PREFIX}-u${i}@example.test` }), ADMIN);
    if (res.status !== 201) exec.test.abort(`pool provisioning failed: ${res.status}`);
    accounts.push({ id: res.json('id'), token: res.json('token') });
  }
  return { accounts };                                   // passed to default() and teardown()
}

export default function (data) {
  const account = data.accounts[exec.vu.idInTest - 1];
  const ref = `${PREFIX}-v${exec.vu.idInTest}-i${exec.scenario.iterationInTest}`;
  const res = http.post(`${BASE_URL}/api/checkout`,
    JSON.stringify({ sku: 'SKU-001', qty: 1, clientRef: ref }),   // tagged with the run id
    { headers: { Authorization: `Bearer ${account.token}`, 'Content-Type': 'application/json' },
      tags: { name: 'POST /api/checkout' } });
  check(res, { 'checkout 201': (r) => r.status === 201 });
  sleep(Math.random() * 5 + 3);
}

export function teardown(data) {
  // Orders created by VUs never reach teardown (VUs share no memory), so delete them
  // by the run tag; then delete the pool setup() created. Nothing else is touched.
  const orders = http.del(`${BASE_URL}/api/test-data/orders?clientRefPrefix=${PREFIX}`, null, ADMIN);
  check(orders, { 'run orders deleted': (r) => r.status === 204 });
  for (const a of data.accounts) http.del(`${BASE_URL}/api/test-accounts/${a.id}`, null, ADMIN);
}
```

- `/api/test-data/*` and `/api/test-accounts` stand for whatever your service
  exposes to tests (an admin API, or a SQL script run by the pipeline); keep them
  disabled outside test environments.
- **Pre-provisioned pool instead of `setup()`**: for large pools, a seed script
  creates them once (idempotent on email), writes `accounts.csv`, and the test
  reads it with `SharedArray`. The accounts stay; the script resets their state and
  `teardown()` still deletes the run's writes.
- **Sweeper** (scheduled, catches killed runs):
  ```sql
  DELETE FROM orders WHERE client_ref LIKE 'perf-%' AND created_at < now() - interval '12 hours';
  ```
- **Check it**: run twice back to back with the same `RUN_ID` scheme and compare
  p95; then `SELECT count(*) FROM orders WHERE client_ref LIKE 'perf-<run>-%'` → 0.

---

## k6 — stress variant (find the knee)

`perf/stress.js`. Push **past** expected peak in steps until latency/error climbs,
so you learn the capacity ceiling and *how* it fails (graceful slope vs cliff).

```js
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'https://staging.example.com';

export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      timeUnit: '1s',
      // No think time below, so an iteration lasts one request. VUs needed =
      // rate × response time: 1500 it/s × up to ~1 s near the knee ≈ 1500, + headroom.
      preAllocatedVUs: 500,
      maxVUs: 2000,
      stages: [
        { target: 200,  duration: '3m' },  // expected peak
        { target: 500,  duration: '3m' },  // 2.5× peak
        { target: 1000, duration: '3m' },  // 5× peak — watch for the knee here
        { target: 1500, duration: '3m' },  // push until it degrades
        { target: 0,    duration: '2m' },  // recovery — does it come back cleanly?
      ],
    },
  },
  // In a stress test you EXPECT to break SLO — don't hard-fail on latency.
  // Instead assert the system fails gracefully: it must not error-storm.
  // abortOnFail stops the run once it's clearly broken, so you don't keep
  // hammering a shared environment past the point of learning anything.
  thresholds: {
    http_req_failed: [
      { threshold: 'rate<0.05', abortOnFail: true, delayAbortEval: '30s' },
    ],
    dropped_iterations: ['count<1'],  // past this point you're measuring k6, not the server
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/products`);
  check(res, { 'status 2xx/3xx': (r) => r.status < 400 });
  // No sleep(): under an arrival-rate executor the rate sets the load. Think time
  // only lengthens each iteration, so k6 needs more VUs than maxVUs allows and
  // drops iterations — the dropped_iterations gate would then fail on k6, not the server.
}
```

The knee is the arrival rate where p95 turns sharply upward or errors begin — that,
minus headroom, is your safe capacity. Correlate with server CPU/memory/pool
saturation to name the bottleneck.

---

## k6 — soak variant (leak detection)

`perf/soak.js`. Moderate load for hours. Latency/error should stay **flat**; an
upward drift over time means a leak (memory, connections, file descriptors, cache).

```js
import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'https://staging.example.com';
const latency = new Trend('req_latency', true);

export const options = {
  scenarios: {
    soak: {
      executor: 'constant-arrival-rate',
      rate: 100,               // steady, moderate — well below the knee
      timeUnit: '1s',
      duration: '3h',          // long enough for a slow leak to surface
      // VUs needed = rate × iteration time (one request, no sleep): 100 × 0.4 s = 40.
      // 200 pre-allocated / 400 max leaves room for a leak to slow responses 10×
      // before k6 runs out of VUs.
      preAllocatedVUs: 200,
      maxVUs: 400,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.001'],
    // Latency must not DRIFT: compare early vs late windows in analysis.
    http_req_duration: ['p(95)<400'],
    // A soak that silently sends less than the modelled load proves nothing.
    dropped_iterations: ['count<1'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/products`);
  latency.add(res.timings.duration);
  check(res, { 'ok': (r) => r.status === 200 });
  // No sleep(): the arrival rate sets the load (see the stress variant).
}
```

Leak detection is about the **trend**, not a single percentile: export
time-series (`k6 run --out json=soak.json ...`, `--out experimental-prometheus-rw`,
or `--out opentelemetry`)
and confirm p95 in the last 30 min ≈ p95 in the first 30 min. A steadily climbing
line while load is flat = a leak; take it to the server's memory/GC graphs.

---

## k6 — spike variant (sudden surge)

`perf/spike.js`. Jump to a multiple of peak in seconds, hold briefly, drop.
Answers: does autoscaling react in time, do pools/queues absorb the burst, and
does the system **recover** once the spike passes?

```js
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'https://staging.example.com';

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-arrival-rate',
      startRate: 50, timeUnit: '1s',
      preAllocatedVUs: 500, maxVUs: 3000,
      stages: [
        { target: 50,  duration: '2m' },   // normal traffic baseline
        { target: 500, duration: '20s' },  // 10× surge in 20 s
        { target: 500, duration: '2m' },   // hold the surge
        { target: 50,  duration: '20s' },  // drop back
        { target: 50,  duration: '3m' },   // recovery window — must return to baseline
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],        // shed load gracefully (429/503 + Retry-After), not 500s
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/products`, { tags: { name: 'GET /api/products' } });
  check(res, { 'not 5xx': (r) => r.status < 500 });
}
```

Compare p95 in the recovery window against the baseline window: a system that
stays slow after the spike (stuck queues, exhausted pools, retry storms) fails
the spike test even if it never errored. No `sleep()` here on purpose — under an
arrival-rate executor the rate, not think time, sets the load.

---

## Lighthouse CI — frontend budgets & assertions

`lighthouserc.json`. Runs Lighthouse against real URLs and **fails the PR** when a
vital or budget regresses. Median of several runs reduces lab noise.

```json
{
  "ci": {
    "collect": {
      "url": [
        "https://staging.example.com/",
        "https://staging.example.com/product/SKU-001"
      ],
      "numberOfRuns": 5,
      "settings": {
        "preset": "desktop",
        "onlyCategories": ["performance"]
      }
    },
    "assert": {
      "assertions": {
        "categories:performance":     ["error", { "minScore": 0.9, "aggregationMethod": "median-run" }],
        "largest-contentful-paint":   ["error", { "maxNumericValue": 2500, "aggregationMethod": "median-run" }],
        "cumulative-layout-shift":    ["error", { "maxNumericValue": 0.1,  "aggregationMethod": "median-run" }],
        "total-blocking-time":        ["error", { "maxNumericValue": 200,  "aggregationMethod": "median-run" }],

        "total-byte-weight":          ["error", { "maxNumericValue": 500000 }],
        "resource-summary:script:size":  ["error", { "maxNumericValue": 300000 }],
        "resource-summary:image:size":   ["warn",  { "maxNumericValue": 200000 }],
        "resource-summary:third-party:count": ["warn", { "maxNumericValue": 10 }]
      }
    },
    "upload": { "target": "temporary-public-storage" }
  }
}
```

Run it:

```bash
npx lhci autorun --config=lighthouserc.json
# "error" assertions set a non-zero exit → CI fails. "warn" reports without failing.
```

**INP is not measurable in a navigation run** — it needs real interactions.
Lighthouse's lab proxy is **Total Blocking Time** (gated above). To lab-test INP
for a specific interaction, script a Lighthouse *user flow* (timespan mode via
Puppeteer) or use a `k6/browser` test and threshold `browser_web_vital_inp`.

Lab numbers depend on the runner: `preset: "desktop"` vs the default mobile
emulation (simulated slow 4G + 4× CPU throttle) give very different results, and
shared CI runners are noisy — that's why `numberOfRuns: 5` + `median-run`.
Lab (this) catches regressions; complement with **field** data (CrUX / RUM at
p75) for what real users experience — gate CI on lab, track field.

---

## Other tools — same rules, different syntax

Use what the repo already has; the SLO-first, percentile, open-model and
gate-the-build rules apply unchanged.

**Gatling** (3.x; Java/Kotlin/Scala DSLs plus a JavaScript/TypeScript SDK).
Open vs closed is explicit in the injection DSL — prefer `injectOpen` for
request-driven APIs. `assertions` fail the build (non-zero exit):

```java
setUp(
  scn.injectOpen(
    rampUsersPerSec(0).to(20).during(Duration.ofMinutes(2)),
    constantUsersPerSec(20).during(Duration.ofMinutes(5))
  )
).protocols(httpProtocol)
 .assertions(
   global().responseTime().percentile(95.0).lt(300),
   global().responseTime().percentile(99.0).lt(800),
   global().failedRequests().percent().lt(0.1)
 );
```

**JMeter** (5.6.x). Build plans in the GUI, **run them in CLI mode only** — the
GUI is not a load generator:

```bash
jmeter -n -t plan.jmx -l results.jtl -e -o report/   # non-GUI run + HTML dashboard
```

JMeter has no built-in pass/fail gate. Use the "Arrivals"/"Free-Form Arrivals"
thread groups (jmeter-plugins) for an open model, and gate CI by parsing
`report/statistics.json` (per-label `pct2ResTime` = p95 by default, `errorPct`)
in a small script that exits non-zero on breach.

---

## Metric formulas — with worked numbers

Given a 10-minute steady-state hold of **600,000 requests**, **480** of them 5xx,
sorted latencies giving the 570,000th value = **210 ms** and the 594,000th = **640 ms**:

| Metric | Formula | Worked value |
|--------|---------|--------------|
| **Throughput (RPS)** | `total_requests / duration_s` | `600000 / 600` = **1000 RPS** |
| **Error rate** | `failed / total` | `480 / 600000` = **0.08%** → passes `rate<0.001` |
| **p95** | value at rank `ceil(0.95 × N)` = 570,000 | **210 ms** → passes `p(95)<300` |
| **p99** | value at rank `ceil(0.99 × N)` = 594,000 | **640 ms** → passes `p(99)<800` |
| **Apdex** (T=300 ms) | `(satisfied + tolerating/2) / total`; satisfied ≤T, tolerating ≤4T | `(561000 + 33000/2)/600000` = **0.963** |

- **Percentile rule:** sort ascending, take rank `ceil(x/100 × N)`. Percentiles do
  **not** average across runs — merge raw samples or report each run separately.
- **The mean here (~70 ms) would have hidden the 640 ms p99** that 1-in-100 users
  hit. Always report the percentiles and the error rate together.

---

## CI wiring — fail the pipeline on a threshold breach

`.github/workflows/perf.yml`. Perf is its own layer: smoke on every push, the
gating load test + Lighthouse on a nightly/pre-release cadence.

```yaml
name: performance
on:
  schedule:
    - cron: '0 3 * * *'      # nightly — load + soak are too slow for per-commit
  workflow_dispatch: {}       # and on demand before a release

jobs:
  k6-load:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: grafana/setup-k6-action@v1     # pin k6-version: for reproducible runs
      - name: Smoke (script works, target is up)
        run: k6 run --vus 2 --duration 30s -e BASE_URL=${{ vars.PERF_TARGET_URL }} perf/load.js
      - name: Run load test (thresholds gate the job)
        run: |
          k6 run -e BASE_URL=${{ vars.PERF_TARGET_URL }} \
            --summary-trend-stats="med,p(95),p(99),max" \
            --out json=k6-results.json perf/load.js
        # k6 exits non-zero (99) on any threshold breach → this step (and the job) FAILS.
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: k6-results, path: k6-results.json }

  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - name: Lighthouse CI (assertions gate the job)
        run: npx lhci autorun --config=lighthouserc.json
        # "error" assertions exit non-zero → this step FAILS the build.
```

The gate that matters is the **non-zero exit**: k6 `thresholds` and Lighthouse
`error` assertions both fail the job, so a performance regression blocks the
release instead of being noticed in production.

## Useful commands

```bash
# k6
k6 run perf/load.js                                   # run with in-script defaults
k6 run -e BASE_URL=https://staging.example.com perf/load.js
k6 run --out json=soak.json perf/soak.js             # export time-series for trend/leak analysis
k6 run --summary-trend-stats="med,p(95),p(99),max" perf/load.js  # add p99 to the summary
k6 run --vus 2 --duration 30s perf/load.js           # smoke: overrides scenarios for a quick sanity run
k6 inspect perf/load.js                               # print the resolved options without running

# Lighthouse CI
npx lhci autorun --config=lighthouserc.json          # collect + assert (fails on error)
npx lhci collect --url=https://staging.example.com/  # collect only
```
