# Validation report — 2026-10-06

## Scope and outcome

All 12 shipped skill packs and their agents were updated with evidence-based decision guides and 60 scenario classes. These matrices describe coverage to select for a consumer project; they are **not 60 executed agent evaluations**. The review considered developer maintainability, SDET fault detection, and QA release decisions.

Local regression and runtime checks passed after repairs. The checks below establish package integrity and specific executable patterns; they do not prove every natural-language agent will perform correctly on every application.

## Executed checks

| Check | Result | What it establishes |
|---|---|---|
| Node 24.16.0 regression suite | 62 passed, 0 failed/skipped | Metadata, references, all four install adapters, idempotency, no-write dry runs, MCP preservation/error handling, resource copying, protocol failures, target validation |
| Node 18 regression suite | 62 passed, 0 failed/skipped | Same selected tests on the minimum supported major; explicit discovery avoids unrelated local worktrees |
| Skill quick validator | All 12 shipped skills valid | Frontmatter/name/scaffold structure only |
| Claude plugin strict validator | Marketplace and all 12 plugins passed | Plugin manifest validity |
| Generated plugin manifest test | Passed | Committed manifests match objective/MCP sources |
| Seeded installer faults | Healthy control passed; all 4 faults killed | Suite detects overwriting custom MCP, binary corruption, lost nested links, and dry-run writes |
| Browser MCP | Initialize + discovery + local navigation + snapshot + close passed | Pinned @playwright/mcp 0.0.83 works with isolated profile; 25 advertised tools |
| Project runner MCP | Initialize + discovery passed | Project-installed Playwright 1.63.0 starts; 89 advertised tools; individual runner tools were not all exercised |
| Playwright browser fixtures | 12 expected outcomes across 4 workers, retries 0 | Six cases repeated twice: async UI, response registration, axe negative/positive, keyboard focus, visual defect/restoration, failure cleanup. Includes two deliberately expected assertion failures |
| BDD fixtures | 8 passed across 4 workers, retries 0 | Four lower/upper/adjacent quantity boundaries repeated twice with scenario-local state |
| BDD undefined step | Expected generation exit 1 | Missing step cannot silently disappear into a green result |
| Five complete k6 reference scripts | `k6 inspect` passed for all five | Examples load with the shipped target helper; no load generated |
| k6 2.3.0 loopback probes | Healthy exit 0; bad response/redirect exit 99; ambiguous URL setup exit 107 | Real threshold gates reject bad responses; redirects were not followed; credentials-in-authority bypass rejected |
| npm pack inspection | Passed | All 12 verification guides and executable target guard included; maintainer fixtures and local tool installations excluded |
| git diff whitespace check | Passed | No whitespace errors |

Runtime fixture dependencies are locked: @playwright/test 1.63.0, @axe-core/playwright 4.13.0, playwright-bdd 9.2.1. Local browser execution used installed Chrome on macOS arm64, not the Linux CI image. MCP browser server reported Playwright 1.64.0-alpha-1790635538000; the separate test runner reported 1.63.0. These are different server packages, and their versions were recorded separately.

## Faults found and corrected

- Existing installer tests could write Windsurf MCP configuration in the real home directory. All adapter tests now use isolated home/project directories and clean up owned temporary files.
- Same-name MCP installation could replace custom arguments/environment settings. Existing definitions are preserved and conflicts logged.
- Non-Markdown top-level resources could be corrupted by UTF-8 decoding; nested resource links could point at the wrong location. Binary copying and nested-link regression cases now cover both.
- Generic AGENTS section detection could confuse a longer heading with the requested skill name. Exact heading comparison fixes the collision.
- Performance examples split URLs on colons, allowing a credentials/authority confusion. A shipped, dependency-free guard rejects that form, and examples disable redirects. DNS/IPv4 only; this is not a DNS sandbox.
- Flake guidance conflated product races with test defects and overstated green streaks. It now requires classification, bounded reproduction, sample counts, and uncertainty.
- Agent repair loops could continue indefinitely or imply that skips/threshold changes were valid fixes. Repairs are bounded or budgeted and retain unresolved coverage.
- Skills overgeneralized API compatibility, accessibility coverage, mandatory Page Objects, and pacing. Guidance now distinguishes the cases and states the evidence needed.
- Initial browser validation exposed a mismatched visual-bootstrap layout. The fixture was corrected to use the same markup and rendering context; the visible-change negative control then failed as intended and restoration passed.
- Node's automatic test discovery differed between supported versions and picked up runtime fixtures/local worktrees. The test launcher now selects only this repository's regression files.

## Not established by these checks

- No fresh-model, with-skill/without-skill agent benchmark was run. The 12 agent instructions were critically reviewed, not scored as model behavior.
- No live Pact Broker/provider compatibility run, Stryker campaign on an application, paid LLM judge evaluation, or production-like capacity/soak measurement was run. Installer seeded-fault checks are not a replacement for a Stryker score.
- No manual screen-reader review or WCAG conformance claim; the axe probe deliberately tests the button-name rule and the keyboard probe tests a native dialog.
- Linux/Windows and Node 20/22 are configured in the new CI matrix but were not executed locally. Branch-protection enforcement was not changed.
- Screenshot evidence is host-specific. No Linux baseline approval or cross-browser/device certification is claimed.

## Reproduction

From a source checkout:

```bash
npm test
npm run test:mutations
QA_BROWSER_CHANNEL=chrome npm run test:runtime
npm run test:performance  # requires an existing k6 executable
npm pack --dry-run
```

Runtime scripts print their temporary directories and retain an `evidence.json` with commands, outputs, and statuses for diagnosis. The browser CI job uploads those reports and retained traces. Offline unit tests remove their temporary directories. Source research and adoption decisions are in [research-2026-10-06.md](research-2026-10-06.md).
