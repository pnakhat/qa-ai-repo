---
name: performance-testing
description: Design and run performance tests that prove a system meets its SLOs under realistic load — backend load/stress/soak/spike with k6 and frontend web-vitals with Lighthouse. Use when asked to "load test", "check performance", "find our capacity", "set a latency budget", or gate a release on speed and scale. Enforces guardrails against reporting averages instead of percentiles, zero-think-time hammering, extrapolating from a localhost run, trusting a single run, and ignoring error rate at load. Defines SLOs first, models a realistic workload, and turns thresholds into pass/fail CI gates. See `reference.md` for a full k6 script, stress/soak variants, Lighthouse CI budgets, and metric formulas.
---

# Performance Testing

Performance testing answers two questions with numbers, not vibes: **"is it fast
enough?"** and **"how much load before it breaks?"** You cannot answer either
without a target. So the work is always in this order: **define the SLOs, model a
realistic workload, express the thresholds as gates, run against a production-like
target, then read the percentiles.** A run with no SLO is a benchmark nobody can
fail — it decorates a dashboard and changes no decision.

## SLOs first — the metrics that matter

Decide the target *before* you write a script. Every threshold in the test traces
back to one of these. Report the whole distribution; **the average is the metric
that lies.**

| Metric | What it is | Target guidance |
|--------|-----------|-----------------|
| **p95 / p99 latency** | 95th/99th-percentile response time — 1 in 20 / 1 in 100 requests is slower | Set per endpoint from user expectation, e.g. read API p95 < 300 ms, p99 < 800 ms |
| **Error rate** | share of requests that fail (5xx, timeouts, failed checks) at load | < 0.1% under expected peak; a fast error is still an error |
| **Throughput (RPS)** | requests/sec the system sustains within SLO | Derive from real traffic; it's a result, not a knob |
| **Saturation** | how full the resource is (CPU, memory, connection pool, queue depth) | Alert well before 100% — the knee is near saturation |
| **LCP** (frontend) | Largest Contentful Paint — main content visible | "Good" ≤ 2.5 s at p75 of real users |
| **INP** (frontend) | Interaction to Next Paint — responsiveness | "Good" ≤ 200 ms at p75 |
| **CLS** (frontend) | Cumulative Layout Shift — visual stability | "Good" ≤ 0.1 at p75 |

**Why averages lie.** Mean latency is dominated by the fast majority and erased by
a few extreme values. A service with a 40 ms mean can still have a 2 s p99 — and
that p99 is the checkout that times out, the customer who leaves. If a request has
5 downstream calls, the *slowest* of the five sets the response, so tail latency
compounds across a request path. Always report p50/p95/p99 (and the max); quote a
mean only alongside them, never instead.

| ✅ Report this | ❌ Not this |
|---------------|-----------|
| "p95 210 ms, p99 640 ms, max 2.1 s, error 0.04%" | "avg 58 ms" |
| Latency as a distribution per endpoint | One number for "the API" |
| Error rate *at the load where latency was measured* | Latency with no mention of failures |

## Test types — each catches something different

Pick the type from the question you're answering. Most systems need load + soak in
CI-adjacent cadence, and stress + spike before a big launch.

| Type | Load profile | Purpose — what it catches |
|------|-------------|---------------------------|
| **Smoke** | 1–5 VUs, ~1 min | Sanity: the script works and the system is up before you spend real load |
| **Load** | ramp to **expected peak**, hold | Does it meet SLOs at the traffic you actually expect? The baseline gate |
| **Stress** | ramp **past** peak until it degrades | Finds the **knee** — the capacity ceiling and how it fails (graceful vs cliff) |
| **Spike** | sudden jump to a multiple of peak, then drop | Sudden-surge resilience: autoscaling lag, cold pools, thundering-herd retries |
| **Soak / endurance** | moderate load for hours | Slow killers: **memory leaks**, connection/FD exhaustion, disk fill, cache bloat, downstream quota drift |

A soak test is the only one that reliably catches a memory leak — a 5-minute load
test ends before the leak matters. A stress test is the only way to know your
actual ceiling; without it, "we can handle Black Friday" is a guess.

## Workload modeling — make the load look like real traffic

Synthetic load that doesn't resemble production tells you about a system nobody
uses. Model it from real numbers.

- **Derive concurrency from real traffic.** By Little's Law, `concurrent_users ≈
  arrival_rate × avg_session_duration`. If you serve 50 sessions/sec averaging 6
  min, that's ~18,000 concurrent — size VUs or arrival rate to that, don't guess a
  round number. Prefer an **arrival-rate** (open) model for request-driven APIs so
  a slowing system doesn't accidentally reduce the load you apply.
- **Include think time.** Real users read, type, and pause. Put `sleep()` between
  requests (typically 1–10 s, ideally randomized) so N VUs generate realistic RPS
  instead of a denial-of-service loop. Zero think time measures a different,
  fictional system.
- **Ramp in stages.** `0 → target` over minutes, **hold at steady state**, then
  ramp down. Never start at full load — you'll measure cold-start artifacts, not
  steady behavior.
- **Measure only at steady state.** Discard the ramp-up window; JITs warm, pools
  fill, autoscalers settle. Report from the hold phase.
- **Be explicit about cache state.** A cache-warm single URL benchmarks the cache,
  not the app. Decide deliberately: warm caches to measure typical load, or cold
  caches / varied keys to measure the worst case — and state which you did.

| ✅ Realistic workload | ❌ Fictional workload |
|----------------------|----------------------|
| Arrival rate + think time derived from traffic logs | A round number of VUs looping with no pause |
| Mixed endpoints in production proportions | Hammering one cheap cached endpoint |
| Ramp → steady-state hold → measure the hold | Measure from t=0 including cold start |
| Randomized inputs / cache keys across the working set | Same ID every request, served from cache |

## Thresholds as gates — a number that fails the run

A threshold that only prints is a suggestion. In k6, `thresholds` set the process
exit code, so a breach **fails CI**. Tie every threshold to an SLO and name the
consequence.

```js
export const options = {
  thresholds: {
    // SLO: read API p95 < 300 ms, p99 < 800 ms → breach blocks the deploy
    http_req_duration: ['p(95)<300', 'p(99)<800'],
    // SLO: error rate < 0.1% at peak → breach blocks the deploy
    http_req_failed: ['rate<0.001'],
    // Custom business check must hold under load
    checks: ['rate>0.99'],
  },
};
```

For the frontend, Lighthouse CI `assert` budgets play the same role — a regressed
LCP or an oversized bundle fails the PR:

```json
{ "ci": { "assert": { "assertions": {
  "categories:performance": ["error", { "minScore": 0.9 }],
  "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
  "cumulative-layout-shift":  ["error", { "maxNumericValue": 0.1 }],
  "total-byte-weight":        ["error", { "maxNumericValue": 500000 }]
}}}}
```

| ✅ Gating threshold | ❌ Decorative number |
|--------------------|---------------------|
| `http_req_duration: ['p(95)<300']` — non-zero exit blocks merge | "we saw about 300 ms" in a slide |
| `http_req_failed: ['rate<0.001']` fails the run | Latency dashboard with no pass/fail |
| Lighthouse `maxNumericValue` on LCP fails the PR | "Lighthouse score looked fine" |

## Environment discipline — measure the system, not the toy

- **Test a production-like target.** Same instance sizes, same DB tier, same
  network topology, representative data volume. A localhost or a 1-vCPU staging box
  has a different ceiling; numbers from it **do not extrapolate** — say so
  explicitly if that's all you have.
- **Isolate the load generator.** Run k6 on a separate machine with headroom. If
  the generator saturates its own CPU/network, you're measuring the client, not the
  server — watch the generator's own utilization.
- **Measure the system under test, not the client.** Correlate k6 numbers with
  server-side metrics (CPU, memory, pool saturation, GC) so you can locate the
  bottleneck instead of just observing slowness.
- **State the caveats.** If the environment isn't prod-like, the result is a
  relative signal ("no regression vs last run") not an absolute capacity claim.

## Frontend — lab vs field

Two complementary signals; you need both.

- **Lab (Lighthouse):** a controlled, repeatable run with a fixed device/network
  profile. Great for **catching regressions in CI** and setting performance
  budgets — deterministic, so a diff is meaningful. But it's one synthetic machine,
  not your users.
- **Field (RUM / CrUX):** real-user measurements at p75 across actual devices and
  networks. This is what Core Web Vitals are officially judged on and what users
  actually experience. Lab tells you *it can be fast*; field tells you *it is fast
  for real people*. Gate CI on lab; hold yourself accountable to field.
- **Performance budgets:** cap bundle size, image weight, request count, and the
  vitals in `lighthouserc` so a regression fails the PR before it ships.

## Metric formulas

- **Percentile p(x):** sort all N samples ascending; `p(x)` is the value at rank
  `ceil(x/100 × N)`. p95 of 1000 sorted latencies = the 950th value — 95% of
  requests were at or below it. Percentiles do **not** average across runs; merge
  the raw samples or report each run.
- **Error rate:** `failed_requests / total_requests`. "Failed" = non-2xx/3xx,
  timeouts, connection errors, or failed checks — decide the definition up front.
- **Throughput (RPS):** `total_requests / duration_seconds`, reported from the
  steady-state window only.
- **Apdex** (satisfaction, threshold T): `(satisfied + tolerating/2) / total`,
  where *satisfied* ≤ T, *tolerating* ≤ 4T, *frustrated* > 4T. Ranges 0–1.

**Worked example.** A 10-minute load test logs 600,000 requests, 480 of them 5xx.
Latencies sorted give the 570,000th value = 210 ms and the 594,000th = 640 ms.
- Throughput = 600,000 / 600 = **1000 RPS**
- Error rate = 480 / 600,000 = **0.08%** (passes `rate<0.001`)
- p95 = **210 ms** (passes `p(95)<300`), p99 = **640 ms** (passes `p(99)<800`)
- Apdex at T=300 ms: 561,000 satisfied, 33,000 tolerating, 6,000 frustrated →
  `(561000 + 33000/2) / 600000` = **0.963** — solidly good.

Note the mean here might be ~70 ms and would have hidden that 1-in-100 users waited
640 ms. Report the percentiles.

## Anti-patterns — smells to reject

| ❌ Smell | ✅ Fix |
|---------|--------|
| "Average response time was 58 ms" | Report p50/p95/p99 + max; the tail is what users feel |
| VUs looping with zero think time | Add randomized `sleep()`; model real pacing or use arrival rate |
| Load-testing localhost, then promising prod numbers | Test a production-like env; if you can't, state numbers don't extrapolate |
| One run declared a trend ("we're 10% faster") | Repeat runs; compare medians across runs, watch variance before claiming a trend |
| Chasing p99 while 8% of requests 5xx | Gate `http_req_failed` too — latency of successful requests only is meaningless if many fail |
| No ramp: full load from t=0 | Ramp → hold → measure the steady-state window; discard warm-up |
| Hardcoded `sleep(3)` used as load pacing | Think time models a *user*; control *load* with arrival rate / VU stages, not fixed sleeps |
| Benchmarking one cache-warm URL | Vary keys across the working set (or deliberately cold-cache) and mix endpoints in prod proportions |
| Load generator pinned at 100% CPU | Isolate + size the generator; verify you're measuring the server, not the client |
| Threshold that prints but doesn't fail | Use k6 `thresholds` / Lighthouse `assert` so a breach sets a non-zero exit and blocks CI |
| Running the full soak on every commit | Perf is its own layer — smoke per-commit, load/soak nightly or pre-release |

## Works well with

These are soft complements — no hard dependency, but they compose well:

- **`qa-strategy`** — the SLOs and non-functional requirements you define here are
  exactly the "metrics that gate" that strategy tracks; feed p95/error-rate/vitals
  targets back as gated release metrics.
- **`api-contract-testing`** — load-test the very endpoints whose contracts you
  pinned. Contract testing fixes the *shape*; performance testing fixes the *speed
  and scale* of the same boundary.
- **`test-pyramid`** — performance is its own layer, not part of the unit/E2E
  count. Run smoke on every commit but load/stress/soak nightly or pre-release, so
  the fast feedback loop stays fast.

## Reference

See `reference.md` for a complete idiomatic k6 script (ramp stages, p95/p99
thresholds, checks, custom Trend/Rate metrics, think time), stress and soak
variants, a Lighthouse CI config with budgets and assertions, the metric formulas
with worked numbers, and a CI job that fails the pipeline on a threshold breach.
