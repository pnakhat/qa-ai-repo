# LLM Eval — Tooling, Providers & Alternatives

## Versions

- **deepeval v2.x** — metrics API, `assert_test`, `evaluate`, `deepeval test run`.
  Verify with `pip show deepeval`; the metric names/params above target 2.x.
- **pytest v7+** — DeepEval's `test run` wraps pytest; plain `pytest` works if you
  only use `assert_test`.
- **Python 3.9+**.

## Judge provider config

DeepEval's LLM-judge metrics default to **OpenAI** — set `OPENAI_API_KEY` and pass
`model="gpt-4o-2024-08-06"` (always a dated snapshot, never a floating alias). To
judge with a different provider, either pass a DeepEval model object or configure
the CLI:

```bash
# Anthropic / Azure / local — set via CLI, then metrics pick it up
deepeval set-azure-openai --openai-endpoint <url> --openai-api-key <key> \
  --deployment-name <name> --openai-api-version <ver>
# Local / self-hosted judge (Ollama, vLLM) to avoid per-run token cost:
deepeval set-local-model --model-name=<name> --base-url="http://localhost:11434/v1" --api-key="ollama"
```

Pass a custom model object per-metric with `FaithfulnessMetric(model=my_model)` for
LangChain/LiteLLM-wrapped judges. Whatever you pick, **pin the exact version and
record it in run provenance** — the judge is part of what produced the score.

## Cost & latency control

- Judge metrics cost tokens per test case. Run the deterministic subset
  (`ToolCorrectnessMetric`, schema/regex assertions) on every commit for free; run
  the judge suite on PR / nightly.
- `async_mode=True` (default on most metrics) parallelizes judge calls across a
  batch — keeps a large `evaluate()` run fast.
- A smaller/local judge is fine for cheap metrics; reserve the frontier model for
  the nuanced ones (G-Eval correctness, faithfulness on subtle contradictions), and
  validate the cheaper judge against it on a sample first.

## When to reach for something else

| Need | Tool |
|------|------|
| Metric-based, code-first eval in a pytest/CI pipeline (this skill) | **DeepEval** |
| Prompt/model A/B matrix, YAML-declared, red-team/jailbreak scans | **Promptfoo** |
| RAG-specific research metrics (faithfulness, context precision/recall) in a data-science notebook flow | **Ragas** |
| Provider-native eval harness tied to OpenAI's ecosystem | **OpenAI Evals** |
| Hosted dashboard, dataset curation, run history, human review on top of the code above | **Confident AI** (DeepEval's platform — `deepeval login`) |
| Tracing/observability of live LLM calls (not offline eval) | LangSmith / Langfuse / Arize Phoenix |

DeepEval and Promptfoo overlap; the rule of thumb: **DeepEval** when eval lives in
your test suite and gates CI like any other test; **Promptfoo** when you're
sweeping many prompt/model variants and want a declarative side-by-side. They
coexist — Promptfoo for exploration, DeepEval for the gate.
