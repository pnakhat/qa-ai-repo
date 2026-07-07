# Performance Testing — Setup & Reference

Runnable, copy-pasteable k6 scripts, Lighthouse CI budgets, metric formulas, and
CI wiring. Check installed tool versions for drift; the shapes below target
**k6 v0.50+** and **@lhci/cli v0.13+ / Lighthouse v11+**.

## Install

```bash
# Backend load testing
brew install k6                       # or: https://grafana.com/docs/k6/latest/set-up/install-k6/

# Frontend web-vitals in CI
npm i -D @lhci/cli                     # Lighthouse CI runner + assertions
npx playwright install chromium        # or rely on system Chrome
```

## Project layout

```
perf/
  load.js              # expected-peak load test — the baseline gate
  stress.js            # ramp past peak to find the knee
  soak.js              # hours at moderate load — leak detection
  spike.js             # sudden surge, then drop
  lib/config.js        # shared BASE_URL, headers, SLO thresholds
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

// --- Config (override at run time: k6 run -e BASE_URL=https://staging.example.com) ---
const BASE_URL = __ENV.BASE_URL || 'https://staging.example.com';

// --- Custom metrics: measure business-meaningful timings/rates, not just HTTP ---
const checkoutLatency = new Trend('checkout_latency', true); // true = time metric (ms)
const businessErrors  = new Rate('business_errors');         // logical failures, not just 5xx
const ordersCreated   = new Counter('orders_created');

export const options = {
  // Open model: k6 injects requests at a target ARRIVAL RATE, independent of how
  // slow the system gets — so a degrading server doesn't silently reduce load.
  scenarios: {
    steady_load: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 200,   // pool sized from Little's Law; raise if VUs saturate
      maxVUs: 500,
      stages: [
        { target: 200, duration: '2m' },  // ramp 0 → 200 req/s (warm-up, discarded)
        { target: 200, duration: '5m' },  // HOLD at expected peak — measure this window
        { target: 0,   duration: '1m' },  // ramp down
      ],
    },
  },
  // --- Thresholds ARE the gate: any breach → non-zero exit → CI fails ---
  thresholds: {
    // SLO: read/checkout p95 < 300 ms, p99 < 800 ms
    http_req_duration: ['p(95)<300', 'p(99)<800'],
    // SLO: error rate < 0.1% at peak
    http_req_failed: ['rate<0.001'],
    // Custom: checkout path p95 < 500 ms, and <1% business-logic failures
    checkout_latency: ['p(95)<500'],
    business_errors: ['rate<0.01'],
    // Functional checks must hold under load
    checks: ['rate>0.99'],
  },
};

// To exclude ramp-up noise from your reported numbers, tag the steady-state
// window and filter on it in analysis (e.g. add {steady:'true'} tags during the
// hold), or read k6's end-of-test percentiles knowing the short ramp barely moves
// them at this sample size.

const headers = { Accept: 'application/json' };

export default function () {
  group('browse', () => {
    const res = http.get(`${BASE_URL}/api/products?page=1`, { headers });
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

Run it:

```bash
k6 run -e BASE_URL=https://staging.example.com perf/load.js
# Exits non-zero if any threshold breaches → the CI step fails.
```

k6 prints p50/p90/p95/p99 for every trend automatically. Read the **hold-window**
percentiles and the error rate together — never the average alone.

---

## k6 — stress variant (find the knee)

`perf/stress.js`. Push **past** expected peak in steps until latency/error climbs,
so you learn the capacity ceiling and *how* it fails (graceful slope vs cliff).

```js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'https://staging.example.com';

export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-arrival-rate',
      startRate: 50,
      timeUnit: '1s',
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
  thresholds: {
    http_req_failed: ['rate<0.05'],   // <5% errors even while overloaded
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/products`);
  check(res, { 'status 2xx/3xx': (r) => r.status < 400 });
  sleep(Math.random() * 2 + 1);
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
import { check, sleep } from 'k6';
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
      preAllocatedVUs: 200,
      maxVUs: 400,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.001'],
    // Latency must not DRIFT: compare early vs late windows in analysis.
    http_req_duration: ['p(95)<400'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/products`);
  latency.add(res.timings.duration);
  check(res, { 'ok': (r) => r.status === 200 });
  sleep(Math.random() * 4 + 2);
}
```

Leak detection is about the **trend**, not a single percentile: export
time-series (`k6 run --out json=soak.json ...` or stream to Prometheus/InfluxDB)
and confirm p95 in the last 30 min ≈ p95 in the first 30 min. A steadily climbing
line while load is flat = a leak; take it to the server's memory/GC graphs.

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
        "largest-contentful-paint":   ["error", { "maxNumericValue": 2500 }],
        "interaction-to-next-paint":  ["error", { "maxNumericValue": 200 }],
        "cumulative-layout-shift":    ["error", { "maxNumericValue": 0.1 }],
        "total-blocking-time":        ["warn",  { "maxNumericValue": 300 }],

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

Lab (this) catches regressions deterministically; complement with **field** data
(CrUX / RUM at p75) for what real users experience — gate CI on lab, track field.

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
      - name: Install k6
        run: |
          sudo gpg -k
          sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
            --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
            | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update && sudo apt-get install -y k6
      - name: Run load test (thresholds gate the job)
        run: k6 run -e BASE_URL=${{ vars.PERF_TARGET_URL }} perf/load.js
        # k6 exits non-zero on any threshold breach → this step (and the job) FAILS.

  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
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
k6 run --summary-trend-stats="p(50),p(95),p(99),max" perf/load.js  # force percentile output

# Lighthouse CI
npx lhci autorun --config=lighthouserc.json          # collect + assert (fails on error)
npx lhci collect --url=https://staging.example.com/  # collect only
```
