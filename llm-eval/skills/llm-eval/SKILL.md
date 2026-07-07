---
name: llm-eval
description: Author LLM/RAG/agent evaluation suites in DeepEval that prove a feature is correct with gated numbers, not vibes. Use when asked to "eval an LLM", "test a prompt", "measure RAG quality", "check for hallucination", "score answer relevancy", "verify tool calls", or gate a release on model output quality. Ships the metric definitions baked in — faithfulness, answer relevancy, contextual precision/recall/relevancy, hallucination, tool correctness, G-Eval, bias, toxicity — with the inputs each needs, the score formula, and which direction passes. Enforces guardrails against unpinned judge models, exact-matching non-deterministic output, contaminated goldens, single-run scores, and metric-picking that ignores the real failure mode. See `reference.md` for runnable DeepEval suites and CI wiring, `tooling.md` for install/versions and alternatives.
---

# LLM Evaluation with DeepEval

Evaluating an LLM feature answers one question with numbers: **"is the output good
enough to ship?"** You cannot answer it by reading a few outputs and nodding. The
work is always in this order: **build a golden dataset, pick the metric that
matches the failure mode you're afraid of, set a threshold, run it as a gate, then
read the score distribution.** An eval with no threshold is a demo — it decorates a
notebook and blocks no regression.

Two properties make LLM eval different from ordinary testing, and every guardrail
here follows from them:

1. **The output is non-deterministic and semantic.** The same input yields
   different valid wordings. So you assert on *meaning* via metrics-with-thresholds,
   never on exact strings — except where the output is structured (JSON, a tool
   call), where you go back to deterministic checks.
2. **The grader is often another LLM.** Most quality metrics are *LLM-as-judge*.
   The judge is itself non-deterministic and can be wrong, so it must be pinned,
   constrained, and spot-checked against humans — a judge you never validate is a
   ruler you never calibrated.

## The metrics — baked in

Pick by the failure mode you're guarding against, not by what's easy to compute.
Every DeepEval metric takes an `LLMTestCase`; the **Inputs** column is which fields
that metric actually reads. **Direction** is the trap: most metrics are *maximize*
(pass when `score >= threshold`), but hallucination, bias, and toxicity are
*minimize* (pass when `score <= threshold`).

| Metric | What it scores | Inputs (LLMTestCase fields) | Score means | Pass when |
|--------|----------------|-----------------------------|-------------|-----------|
| **AnswerRelevancy** | Does the output actually address the input? (generator) | `input`, `actual_output` | relevant statements ÷ total statements in output | `>= threshold` |
| **Faithfulness** | Does the output stay true to what was retrieved? (generator) | `input`, `actual_output`, `retrieval_context` | truthful claims ÷ total claims vs retrieved docs | `>= threshold` |
| **ContextualPrecision** | Are the *relevant* retrieved chunks ranked above noise? (retriever) | `input`, `actual_output`, `expected_output`, `retrieval_context` | ranking-weighted relevance of retrieved nodes | `>= threshold` |
| **ContextualRecall** | Did retrieval fetch everything the answer needs? (retriever) | `input`, `expected_output`, `retrieval_context` | claims in expected_output attributable to retrieval ÷ total | `>= threshold` |
| **ContextualRelevancy** | How much of what was retrieved is on-topic? (retriever noise) | `input`, `actual_output`, `retrieval_context` | relevant statements in retrieval ÷ total retrieved | `>= threshold` |
| **Hallucination** | Does the output contradict known ground truth? | `input`, `actual_output`, `context` | contradicted contexts ÷ total contexts | **`<= threshold`** |
| **ToolCorrectness** | Did the agent call the right tools? (**deterministic**, no judge) | `input`, `actual_output`, `tools_called`, `expected_tools` | correctly-called tools ÷ expected (name ± args/output/order) | `>= threshold` |
| **TaskCompletion** | Did the agent accomplish the user's goal? | `input`, `actual_output`, `tools_called` | judge's assessment the task's outcome was achieved | `>= threshold` |
| **GEval** (custom) | Any criterion you write in plain English | you declare `evaluation_params` | chain-of-thought judge score 0–1 on your rubric | `>= threshold` |
| **Summarization** | Is the summary both accurate and complete? | `input` (source), `actual_output` | min(alignment, coverage) | `>= threshold` |
| **Bias** | Gender/race/political/etc. bias in the output | `actual_output` | share of biased opinions | **`<= threshold`** |
| **Toxicity** | Toxic / harmful language in the output | `actual_output` | share of toxic statements | **`<= threshold`** |

**Faithfulness vs. Hallucination — the most-confused pair.** They look identical
and are not. *Faithfulness* checks the output against `retrieval_context` — what
*your RAG actually pulled* — and asks "did the generator stay grounded in its
sources?" (higher is better). *Hallucination* checks against `context` — the
*ideal/ground-truth* facts *you* supply in the golden — and asks "did the output
contradict reality?" (lower is better, so it's a minimize-metric). Use faithfulness
to debug the generation step of a live RAG; use hallucination when you have curated
ground truth and want a factuality gate.

**The RAG triad.** When a RAG answer is wrong, the metrics localize the fault:

| The answer is… | Suspect | Metric that catches it |
|----------------|---------|------------------------|
| Confidently making things up | Generator ignoring its context | **Faithfulness** low |
| Off-topic / doesn't answer | Generator | **AnswerRelevancy** low |
| Missing facts that *were* retrievable | Retriever didn't fetch them | **ContextualRecall** low |
| Buried the good chunk under junk | Retriever ranking | **ContextualPrecision** low |
| Drowning in irrelevant chunks | Retriever precision / chunking | **ContextualRelevancy** low |

Slapping `AnswerRelevancy` on everything tells you nothing about *why* a RAG
answer is wrong. Run generator + retriever metrics together and read which dropped.

## Golden dataset first — the thing you evaluate against

A metric with no dataset is a formula with nothing to score. Build the goldens
before the metrics, the same way you define SLOs before a load test.

- **A golden is `input` + labels.** Minimally the `input`; add `expected_output`
  and/or `context` for the reference-based metrics (recall, precision, hallucination
  need labels — relevancy and faithfulness do not). Keep them in a versioned file
  (CSV/JSON/`EvaluationDataset`), not inline in the test.
- **Cover the failure modes, not just the happy path.** Include adversarial inputs,
  out-of-scope questions (the model should decline), long contexts, ambiguous
  phrasings, and known past regressions. 20 sharp goldens beat 500 easy ones.
- **Hold goldens out of the prompt.** If your few-shot examples *are* your eval
  set, you're grading the open-book exam you handed out — **contamination** inflates
  every score. Eval inputs must be unseen by the system under test.
- **Version and own it.** A golden set drifts as the product changes; check it into
  git, review changes, and record which prompt/model version each score was measured
  against. A score with no dataset+model provenance is not comparable to the next.

| ✅ Real golden set | ❌ Fake confidence |
|-------------------|--------------------|
| Curated inputs + labels, versioned in git, adversarial cases included | A handful of happy-path prompts written from memory |
| Eval inputs disjoint from few-shot / fine-tune data | Grading on the same examples the prompt already contains |
| Each run tagged with prompt + model + dataset version | Bare scores with no provenance, compared across weeks |

## LLM-as-judge discipline — calibrate the ruler

Most of these metrics *are* an LLM grading your LLM. That judge is a dependency
with its own failure modes; treat it like one.

- **Pin the judge model and version.** `FaithfulnessMetric(model="gpt-4o-2024-08-06")`,
  not "whatever's newest." A judge that silently upgrades makes last month's scores
  meaningless. Record the judge in the run provenance.
- **Constrain it for repeatability.** Use `strict_mode=True` (binary, stricter
  pass) where you want a hard gate; judges run at low temperature. Even so, expect
  small run-to-run variance — never treat a single score as exact.
- **Validate the judge against humans.** On a sample, have a person label
  pass/fail and check the metric agrees. If judge and human disagree often, fix the
  rubric (for G-Eval) or the metric choice before you trust the gate. An uncalibrated
  judge is an opinion with a decimal point.
- **Mind the judge's biases.** LLM judges favor longer answers, their own family's
  style, and the first option in a pair. Prefer absolute rubric scoring (G-Eval with
  explicit `evaluation_steps`) over vague "rate 1–10," and don't let a model be the
  sole judge of its own output without a human spot-check.
- **`include_reason=True` so failures are debuggable.** The metric's reason string
  tells you *why* it scored low — keep it on; a bare number you can't explain you
  can't act on.

## Deterministic where you can, semantic where you must

Not everything needs a judge. Reach for the cheapest check that catches the bug.

| Output shape | ✅ Check with | ❌ Don't |
|--------------|--------------|---------|
| Exact tool name / args | `ToolCorrectnessMetric` (deterministic) | An LLM judge — it's slower, costlier, and less precise here |
| JSON structure / schema | Schema validation, key assertions | Fuzzy "looks like JSON" judging |
| Must-contain fact / forbidden phrase | Regex / substring assertion | A judge for a mechanical string check |
| Free-form answer quality | `AnswerRelevancy` / `Faithfulness` / `GEval` | `assert output == expected` on prose |
| Semantic equivalence to a reference | `GEval` correctness rubric | Exact match — kills on valid paraphrase |

Exact-string-matching a paraphrasable answer is the classic false-red: the model
said the right thing a different way and your suite fails. Match structure
deterministically; match meaning with a metric.

## Thresholds as gates — a score that fails the run

A threshold that only prints is a suggestion. `assert_test()` (and
`deepeval test run` under pytest) raises / sets a non-zero exit on breach, so a
regression **fails CI**. Tie every threshold to a decision.

```python
# assert_test raises AssertionError on breach -> pytest fails -> CI blocks the merge
from deepeval import assert_test
from deepeval.test_case import LLMTestCase
from deepeval.metrics import FaithfulnessMetric, AnswerRelevancyMetric

def test_rag_answer():
    tc = LLMTestCase(
        input="What's the refund window?",
        actual_output=rag(app, "What's the refund window?"),
        retrieval_context=retrieve("refund window"),
    )
    assert_test(tc, [
        FaithfulnessMetric(threshold=0.8, model="gpt-4o-2024-08-06", include_reason=True),
        AnswerRelevancyMetric(threshold=0.7, model="gpt-4o-2024-08-06"),
    ])
```

- **Set the threshold from measured baseline + a margin**, not a round number.
  Score the current system first; gate a little below it so normal variance doesn't
  flap but a real drop fails.
- **Report the distribution, not one number.** Run the whole golden set and read
  the pass rate and the low-scoring cases; a 0.82 average can hide five 0.3s. Don't
  average unrelated metrics into a single "quality score" — that hides exactly the
  dimension that's failing (a faithful-but-irrelevant answer).
- **Gate cost-aware.** Judge metrics cost tokens and latency. Run deterministic
  metrics (tool correctness, schema) on every commit; run the LLM-judge suite in CI
  on PRs / nightly, not on every keystroke.

## Anti-patterns — smells to reject

| ❌ Smell | ✅ Fix |
|---------|--------|
| `assert output == "expected text"` on prose | Score with `AnswerRelevancy`/`GEval` + threshold; exact-match only structured output |
| Judge model unpinned ("gpt-4o", latest) | Pin `model="gpt-4o-2024-08-06"`; record it in run provenance |
| Eval set == few-shot examples in the prompt | Hold goldens out of the prompt/training data — contamination inflates scores |
| One run, one number, called a result | Run the full set; report pass rate + variance; repeat before claiming a regression |
| `HallucinationMetric(threshold=0.8)` expecting high=good | Hallucination/bias/toxicity are *minimize* — pass is `score <= threshold`; set it low |
| `AnswerRelevancy` used to catch a hallucination | Relevancy ≠ factuality; use Faithfulness (vs retrieval) or Hallucination (vs ground truth) |
| RAG answer wrong, only generator metrics run | Add ContextualRecall/Precision — the fault may be retrieval, not generation |
| One averaged "quality score" across metrics | Report each metric; an average hides the failing dimension |
| LLM judge with no human calibration | Spot-check judge vs human labels; fix rubric/metric if they disagree |
| Reference-based metric with no labels | ContextualRecall/Precision/Hallucination need `expected_output`/`context` — supply them or pick a reference-free metric |
| Whole judge suite on every commit | Deterministic checks per-commit; judge suite on PR/nightly — it costs tokens and time |
| Tool call graded by an LLM judge | `ToolCorrectnessMetric` is deterministic — exact, cheap, no judge needed |

## Works well with

Soft complements — no hard dependency, but they compose:

- **`api-contract-testing`** — an LLM that emits tool calls or structured JSON has
  a *contract*. Pin the output shape with schema/contract tests; use `llm-eval`
  for the semantic quality *inside* that shape. Structure is deterministic; meaning
  is graded.
- **`performance-testing`** — LLM eval scores *quality*; perf scores *speed/cost*.
  Track judge-token cost and p95 latency of the model call as their own SLOs, and
  gate both — a faithful answer that takes 12 s or costs $0.40 still fails the user.
- **`qa-strategy`** — faithfulness / hallucination / tool-correctness thresholds
  are release-gating metrics; feed them into the strategy's gated-metrics set
  alongside coverage and perf SLOs.
- **`test-pyramid`** — LLM eval is its own layer, like perf: fast deterministic
  checks broad and per-commit, expensive judge suites narrow and pre-release.

## Reference

See `reference.md` for runnable DeepEval suites — RAG triad, faithfulness +
hallucination side by side, a custom G-Eval metric with `evaluation_steps`,
deterministic `ToolCorrectnessMetric` for agents, conversational metrics, an
`EvaluationDataset` of goldens driving `@pytest.mark.parametrize`, `evaluate()` for
batch scoring, and a CI job that fails the pipeline on a threshold breach.
`tooling.md` covers install, model/provider config, versions, and when to reach for
Promptfoo / Ragas / OpenAI Evals instead.
