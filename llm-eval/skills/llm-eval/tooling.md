# LLM Eval — Tooling, Providers & Alternatives

## Versions

- **deepeval ≥ 4.2.3, < 5** — metrics API, `assert_test`, `evaluate`,
  `deepeval test run`. Verify with `pip show deepeval`. 4.2.3 flipped
  Hallucination/Bias/Toxicity to higher-is-better (`score >= threshold`); any
  suite written for 3.x – 4.2.2 must re-baseline those thresholds.
- **pytest 8+** — `deepeval test run` wraps pytest; plain `pytest` works too because
  `assert_test` raises.
- **Python 3.9+** (3.11+ recommended).

## Judge provider config

DeepEval's LLM-judge metrics default to **OpenAI** (`OPENAI_API_KEY`). Pin the
judge in code with a model object — always a dated snapshot, never a floating
alias:

```python
from deepeval.models import OpenAIModel, AnthropicModel, OllamaModel
JUDGE = OpenAIModel(model="gpt-4.1-2025-04-14", temperature=0)
# JUDGE = AnthropicModel(model="<dated claude model id>", temperature=0)   # ANTHROPIC_API_KEY
# JUDGE = OllamaModel(model="llama3.1:70b")                                # local, no token cost
FaithfulnessMetric(threshold=0.8, model=JUDGE)
```

Or set a project-wide default from the CLI (writes env vars; `--save=dotenv` to
persist):

```bash
deepeval set-openai --model gpt-4.1-2025-04-14
deepeval set-anthropic --model <dated-model-id>
deepeval set-azure-openai ...                # see `deepeval set-azure-openai --help`
deepeval set-ollama --model llama3.1:70b     # base URL defaults to http://localhost:11434
deepeval set-local-model --model <name> --base-url http://localhost:8000/v1   # any OpenAI-compatible server (vLLM, LM Studio)
```

`LiteLLMModel`, `GeminiModel`, `AmazonBedrockModel`, or a subclass of
`DeepEvalBaseLLM` cover everything else. Whatever you pick, **pin the exact
version and record it in run provenance** — the judge is part of what produced
the score. Code-level pinning beats CLI config: it is reviewed in the diff and
can't drift per machine.

## Cost & latency control

- Judge metrics cost tokens per test case. Run the deterministic subset
  (`ToolCorrectnessMetric` without `available_tools`, schema/regex assertions) on
  every commit; run the judge suite on PR / nightly.
- `async_mode=True` (the default) parallelizes judge calls; `deepeval test run -n`
  adds process parallelism; `-c` reuses cached results for unchanged cases.
- A smaller/local judge is fine for cheap metrics; reserve the frontier model for
  the nuanced ones (G-Eval correctness, faithfulness on subtle contradictions), and
  validate the cheaper judge against human labels on a sample first.

## Promptfoo — declarative matrix and red-teaming

Use when you're sweeping prompts × models side by side, or want generated
adversarial coverage. Node-based (`npx promptfoo@latest`), config in YAML:

```yaml
# promptfooconfig.yaml
prompts: [file://prompts/support.txt]
providers: [openai:gpt-4.1-2025-04-14, anthropic:messages:<dated-model-id>]
defaultTest:
  options:
    provider: openai:gpt-4.1-2025-04-14     # pinned grader for model-graded asserts
tests:
  - vars: { question: "What's the refund window?" }
    assert:
      - type: icontains                      # deterministic
        value: "30 days"
      - type: llm-rubric                     # model-graded
        value: "States the refund window and does not invent extra conditions"
      - type: latency
        threshold: 3000
```

```bash
npx promptfoo@latest eval -c promptfooconfig.yaml   # non-zero exit on failed asserts
npx promptfoo@latest view                            # side-by-side web report
npx promptfoo@latest redteam init --no-gui           # scaffold plugins (harms, PII, injection…) + strategies (jailbreak, …)
npx promptfoo@latest redteam run && npx promptfoo@latest redteam report
```

Deterministic asserts: `equals`, `contains`/`icontains`, `regex`, `is-json`,
`contains-json`, `javascript`, `python`, `latency`, `cost`. Model-graded:
`llm-rubric`, `g-eval`, `factuality`, `answer-relevance`, `context-faithfulness`,
`context-recall`, `context-relevance`.

## When to reach for something else

| Need | Tool |
|------|------|
| Metric-based, code-first eval in a pytest/CI pipeline (this skill) | **DeepEval** |
| Prompt/model A/B matrix, YAML-declared, red-team/jailbreak scans | **Promptfoo** |
| Red-teaming in Python alongside DeepEval (attacks + vulnerabilities, OWASP LLM Top 10 mapping) | **DeepTeam** (`pip install deepteam`) |
| RAG-specific metrics in a data-science notebook flow | **Ragas** |
| Evals hosted on the OpenAI platform (Evals API / dashboard graders), tied to OpenAI models | **OpenAI Evals** (the older `openai/evals` OSS repo is a registry of benchmark-style evals, not a CI gate) |
| Hosted dashboard, dataset curation, run history, human review on top of the code above | **Confident AI** (DeepEval's platform — `deepeval login`) |
| Tracing/observability of live LLM calls (not offline eval) | LangSmith / Langfuse / Arize Phoenix |

DeepEval and Promptfoo overlap; the rule of thumb: **DeepEval** when eval lives in
your test suite and gates CI like any other test; **Promptfoo** when you're
sweeping many prompt/model variants and want a declarative side-by-side, or need
generated red-team coverage. They coexist — Promptfoo for exploration and attack
generation, DeepEval for the gate.

## Sources

- DeepEval metrics & CLI: https://deepeval.com/docs/metrics-introduction ,
  https://deepeval.com/docs/evaluation-flags-and-configs
- Promptfoo assertions & red team: https://www.promptfoo.dev/docs/configuration/expected-outputs/ ,
  https://www.promptfoo.dev/docs/red-team/quickstart/
- LLM-as-judge biases: Zheng et al., "Judging LLM-as-a-Judge with MT-Bench and
  Chatbot Arena" (NeurIPS 2023), https://arxiv.org/abs/2306.05685
- OWASP Top 10 for LLM Applications: https://genai.owasp.org/llm-top-10/
