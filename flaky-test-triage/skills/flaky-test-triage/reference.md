# Flaky Test Triage — Detection, Formulas & Fix Recipes Reference

Runnable rerun/detection commands, the flake-rate + flake-score math with worked
numbers, the quarantine workflow with a CI lane config, and per-cause before/after
fixes. Every fix here **removes** the source of non-determinism — it does not paper
over it with retries.

---

## 1. Rerun & detection commands

Force the flake to reproduce. A green loop of N runs is evidence; a single pass is
not. Loop first, then vary the axis (order, workers, TZ, seed) the taxonomy points at.

### Playwright (TS/JS)

```bash
# Loop one test many times, single worker (isolate timing, not parallelism)
npx playwright test tests/e2e/checkout.spec.ts --repeat-each=50 --workers=1

# Loop under full parallelism (expose shared-state / ordering flake)
npx playwright test tests/e2e/checkout.spec.ts --repeat-each=50 --workers=4

# Run a file ALONE vs. in the whole suite — divergence = order dependence
npx playwright test tests/e2e/checkout.spec.ts            # alone
npx playwright test                                       # full suite

# CI: label (do NOT cure) flake — retries mark pass-on-retry tests "flaky",
# --fail-on-flaky-tests keeps the gate red when any test needed a retry
npx playwright test --retries=2 --fail-on-flaky-tests --reporter=json > run.json

# List flaky tests from the JSON report (suites nest, so walk the whole tree)
jq -r '[.. | objects | select(has("specs")) | .specs[]
        | select(any(.tests[]; .status == "flaky"))
        | "\(.file):\(.line) \(.title)"] | unique[]' run.json

# Re-run only what failed last time
npx playwright test --last-failed
```

### Jest / Vitest (TS/JS)

```bash
# Jest: loop one test until it fails
for i in $(seq 1 50); do npx jest -t 'applies discount' || { echo "flaked on $i"; break; }; done

# Jest: serial vs. parallel — divergence = shared state
npx jest --runInBand           # serial
npx jest --maxWorkers=4        # parallel

# Jest (>= 29.2, jest-circus): shuffle test order; reuse the printed seed to reproduce
npx jest --randomize --showSeed
npx jest --randomize --seed=1234

# Jest: find leaked handles (timers, sockets, DB pools) — implies --runInBand
npx jest --detectOpenHandles

# Vitest: repeat + shuffle order + vary seed
npx vitest run --repeats=50 checkout.test.ts
npx vitest run --sequence.shuffle --sequence.seed=12345
```

### pytest (Python)

```bash
# pytest-repeat: run one test 50×
pytest tests/test_checkout.py::test_discount --count=50

# pytest-flakefinder: auto-repeat every collected test to surface flake
pytest tests/ --flake-finder --flake-runs=30

# pytest-randomly: shuffle order + seed (re-run with the SAME seed to reproduce)
pytest tests/                       # prints "Using --randomly-seed=NNN"
pytest tests/ --randomly-seed=NNN   # or --randomly-seed=last

# Serial vs. parallel (pytest-xdist) — divergence = shared state
pytest tests/                       # serial
pytest tests/ -n 4                  # parallel

# Expose environment coupling
TZ=Pacific/Kiritimati pytest tests/ # +14h TZ shakes out date-boundary flake
```

### Mining CI history (framework-agnostic)

The retry log **is** the flake inventory — every "passed on attempt 2" is a flake
you already paid for. Aggregate pass-on-retry counts per test over a rolling window
and sort descending; that ranking is your triage queue. Emit JUnit XML
(`--reporter=junit`, `jest-junit`, `pytest --junitxml`) so any CI analytics tool
(GitHub/GitLab test reports, Buildkite/Datadog/Trunk flaky-test views) can
aggregate per-test history. Keep results separated by configuration (browser, OS,
shard) — Google's flaky-test infra does this so an environment-only flake isn't
blamed on the test everywhere.

---

## 2. Flake-rate & flake-score formulas

### Suite flake rate

```
flake_rate = (runs that passed only after a retry) / (total runs)
```

Worked: over 200 CI runs on unchanged code, 6 went green only on a retry.
`flake_rate = 6 / 200 = 0.03 = 3%`. If the `qa-strategy` gate is "< 1%, else block
the merge lane", 3% is over budget → triage the top contributors until it's back
under 1%.

### Per-test flake score

Over the last **N** runs of a test on unchanged code, count *flips* (a pass↔fail
transition between consecutive runs, or a pass-after-retry within a run):

```
flake_score = flips / N
```

Worked: a test's last 100 results are 95 pass / 5 fail with identical code →
`flake_score = 5 / 100 = 0.05` (5%). Threshold is **1%** → this test is over and
gets triaged now. Queue order = flake_score; tie-break by blast radius (blocks
trunk? on a critical path?).

### Crossing the threshold — the decision

| Condition | Action |
|-----------|--------|
| `flake_score > 1%` **or** ≥ 1 pass-on-retry in window | Triage now: reproduce → classify → fix or quarantine |
| Reproduced + cause known + fix is small | Fix at root; verify ≥ N green; close |
| Reproduced but fix can't land this cycle | Quarantine with owner + issue + SLA |
| Can't reproduce after heavy rerun | Keep isolating (order/TZ/seed); do **not** close as "works now" |

---

## 3. Quarantine workflow

Tag → issue → SLA → non-blocking lane. Owner, issue, and due date are mandatory.

### Step 1 — tag with a paper trail

```ts
// Playwright — annotate, don't silently skip. Keeps it running for signal.
test('checkout applies promo', { tag: '@flaky' }, async ({ page }) => {
  test.info().annotations.push({
    type: 'flaky',
    // owner + issue + SLA are REQUIRED — a quarantine without them is rejected
    description: 'owner=@aditi issue=QA-482 sla=2026-07-21 score=0.06',
  });
  // …
});
```

```python
# pytest — use a custom `quarantine` marker. Don't reuse `flaky`: pytest-rerunfailures
# and the `flaky` plugin both treat that name as "retry me", which hides the flake.
# pytest.ini:  markers = quarantine(reason): flaky test held out of the blocking lane
import pytest

@pytest.mark.quarantine(reason="owner=@aditi issue=QA-482 sla=2026-07-21 score=0.06")
def test_checkout_applies_promo():
    ...
# blocking lane: pytest -m "not quarantine"     flaky lane: pytest -m quarantine --count=20
```

### Step 2 — open the tracking issue

Title: `[flaky] test_checkout_applies_promo (score 0.06)`. Body: reproduction
command, suspected cause from the taxonomy, owner, SLA date, and the un-quarantine
bar (`N=20 consecutive green runs in the flaky lane`).

### Step 3 — route to a non-blocking CI lane

```yaml
# .github/workflows/tests.yml — flaky lane runs but never blocks the merge
jobs:
  test:                                   # blocking gate — zero tolerance for flake
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npx playwright install --with-deps
      - run: npx playwright test --grep-invert @flaky --retries=2 --fail-on-flaky-tests

  flaky-watch:                            # non-blocking — measures score trending to 0
    runs-on: ubuntu-latest
    continue-on-error: true               # never fails the pipeline
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npx playwright install --with-deps
      - run: npx playwright test --grep @flaky --repeat-each=20 --retries=0
      # If any @flaky test is now 20/20 green → un-quarantine (remove tag).
      # If SLA date has passed and it still flakes → auto-escalate: fix-or-delete.
```

### Step 4 — exit criteria

- **Un-quarantine:** N consecutive green runs (e.g. 20/20) in the flaky lane → remove
  the tag, move back to the blocking gate, close the issue.
- **SLA breach:** due date passed and still flaking → auto-escalate. Owner makes an
  explicit fix-or-delete call. Deleting is a deliberate, recorded trade (coverage <
  noise) — never a silent "make CI green" reflex.

---

## 4. Per-cause before/after fix recipes

### Recipe A — async/timing: hardcoded sleep → web-first assertion

**Before** — guesses a duration; too short flakes on slow CI, too long wastes time.

```ts
await page.getByRole('button', { name: 'Apply' }).click();
await page.waitForTimeout(2000);                          // ❌ hope 2s is enough
expect(await page.getByTestId('order-total').textContent()).toBe('$90.00');
```

**After** — auto-retries until the condition holds or times out. No guessing.

```ts
await page.getByRole('button', { name: 'Apply' }).click();
await expect(page.getByTestId('order-total')).toHaveText('$90.00'); // ✅ waits for the state
```

If no visible state changes, wait on the request instead — start listening
*before* the click so a fast response isn't missed:

```ts
const discount = page.waitForResponse(r => r.url().includes('/api/cart/discount') && r.ok());
await page.getByRole('button', { name: 'Apply' }).click();
await discount;
```

### Recipe B — shared state & ordering: cross-test leak → per-test setup

**Before** — `beforeAll` seeds once; tests mutate the shared row, so they pass only
in the order that happens to leave it valid.

```python
@pytest.fixture(scope="module")            # ❌ one cart shared by every test
def cart():
    return create_cart(items=[item(100)])

def test_apply_discount(cart):
    apply_code(cart, "SAVE10")
    assert cart.total == 90

def test_empty_cart_total(cart):           # ❌ passes only if it runs BEFORE the test above
    assert cart.total == 100
```

**After** — every test builds its own fresh state; order and parallelism are irrelevant.

```python
@pytest.fixture                            # ✅ function scope: fresh cart per test
def cart():
    c = create_cart(items=[item(100)])
    yield c
    c.delete()                             # teardown: no residue for the next test

def test_apply_discount(cart):
    apply_code(cart, "SAVE10")
    assert cart.total == 90

def test_empty_cart_total(cart):
    assert cart.total == 100               # ✅ true in any order
```

The code after `yield` runs even when the test fails, so the teardown is not
happy-path-only. Verify the fix the way the flake appeared:
`pytest --count=2 -n 4` with pytest-randomly, pytest-repeat and pytest-xdist
installed — shuffled, twice, in parallel — then confirm no carts are left behind.

### Recipe C — non-deterministic time → frozen clock

**Before** — "expires in 7 days" is computed from the wall clock; fails across DST
and month boundaries, and is untestable near midnight.

```ts
test('coupon shows a 7-day expiry', () => {
  const coupon = issueCoupon();                          // expires = Date.now() + 7d
  expect(daysUntil(coupon.expiresAt)).toBe(7);           // ❌ off-by-one near midnight/DST
});
```

**After** — freeze time so "now" is fixed and reproducible.

```ts
import { vi, beforeEach, afterEach, test, expect } from 'vitest'; // Jest: jest.useFakeTimers / jest.setSystemTime

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-01T12:00:00Z'));    // ✅ deterministic "now"
});
afterEach(() => vi.useRealTimers());                       // restored even if the test fails

test('coupon shows a 7-day expiry', () => {
  const coupon = issueCoupon();
  expect(coupon.expiresAt).toBe(new Date('2026-03-08T12:00:00Z').getTime());
});
```

```ts
// Playwright E2E: freeze the browser clock (Playwright >= 1.45)
await page.clock.setFixedTime(new Date('2026-03-01T12:00:00Z'));
await page.goto('/coupons');
```

```python
# pytest equivalent
from freezegun import freeze_time

@freeze_time("2026-03-01 12:00:00")
def test_coupon_expiry():
    coupon = issue_coupon()
    assert coupon.expires_at == datetime(2026, 3, 8, 12, 0, 0)
```

Seed RNG the same way when randomness drives the assertion:

```ts
// Inject a seeded RNG instead of Math.random() so "random" is reproducible
// (seedrandom shown; any seedable PRNG or faker.seed(42) works). Log the seed.
const rng = seedrandom('flake-triage-42');
const pick = items[Math.floor(rng() * items.length)];    // ✅ same pick every run
```

### Recipe D — unmocked third-party → route mock

**Before** — the test hits a live payment provider; it flakes whenever that service
is slow, rate-limited, or down — none of which is your code under test.

```ts
test('checkout shows success on payment', async ({ page }) => {
  await page.getByRole('button', { name: 'Pay' }).click(); // ❌ real call to Stripe
  await expect(page.getByText('Payment successful')).toBeVisible();
});
```

**After** — mock what you don't own: stub the boundary deterministically. The test
now proves *your* UI handles a success response, not that Stripe is up.

```ts
test('checkout shows success on payment', async ({ page }) => {
  await page.route('**/v1/payment_intents**', route =>   // ✅ stub the third party
    route.fulfill({ status: 200, json: { id: 'pi_123', status: 'succeeded' } }),
  );
  await page.getByRole('button', { name: 'Pay' }).click();
  await expect(page.getByText('Payment successful')).toBeVisible();
});  // routes live on this test's page, so they die with it — no unroute needed
```

Keep **one** real-integration test against the live provider in a separate,
non-blocking lane where a bounded retry is acceptable — there the flake genuinely is
the network, and that's the only place a retry is honest.

---

## 5. Animations & resource leaks — quick fixes

```ts
// Playwright: kill animations so asserts don't land mid-transition
// playwright.config.ts — only helps if the app honours prefers-reduced-motion
use: { reducedMotion: 'reduce' },
// or per test, forcing it regardless of app support:
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
// screenshots: expect(page).toHaveScreenshot({ animations: 'disabled' }) (the default)
```

```ts
// Resource leaks (Jest/Vitest): dispose what each test/file opened.
// Playwright's built-in page/context fixtures are closed for you — only
// close contexts you created yourself with browser.newContext().
let pollTimer: NodeJS.Timeout;
afterEach(() => clearInterval(pollTimer));   // timers
afterAll(async () => { await pool.end(); }); // DB connections
// Find what's still open: npx jest --detectOpenHandles
```
