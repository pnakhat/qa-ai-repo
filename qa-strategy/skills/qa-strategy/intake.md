# QA Strategy — Intake Questionnaire

Collect these before writing the strategy. Ask by section, pre-fill anything
already known, and mark unknowns `TBD` with a stated assumption. Bold items are
the minimum needed to produce a useful first draft.

## 1. Product & scope
- **What is the product?** (web app, mobile app, API/backend service, desktop, CLI, embedded, data/ML pipeline)
- **What platforms must you support?** (browsers, iOS/Android versions, OS)
- Who are the users and what's the scale? (internal tool vs. public; approx. traffic/DAU)
- What are the most critical user journeys / revenue-bearing flows?

## 2. Tech stack
- **Languages & frameworks** (frontend, backend, mobile)
- Data stores, queues, and major third-party integrations
- **Existing test frameworks/tools** (e.g. Jest, Pytest, Playwright, Cypress, Selenium, JUnit, k6)
- Repo layout: monorepo vs. polyrepo; number of services

## 3. Team & process
- **Team size and roles** (# engineers, # dedicated QA/SDET, PM, designers)
- Who owns quality today? (devs test their own work? separate QA? none?)
- **Release cadence & deployment** (per-commit / daily / weekly / monthly; CI/CD maturity)
- Branching & review model (trunk-based, PR reviews, feature branches)
- Ways of working (Scrum/Kanban, sprint length)

## 4. Current quality state
- **What testing exists today?** (unit / integration / E2E / manual / none) and rough coverage
- How is testing run — locally, in CI, both? Which CI system?
- Known pain points (flaky tests, slow suites, prod escapes, long release cycles)
- Bug/defect tracking tool and current escape/severity trends if known

## 5. Non-functional & risk requirements
- **Compliance/regulatory needs** (HIPAA, PCI-DSS, SOC 2, GDPR, accessibility/WCAG, none)
- Performance/load expectations and SLAs/SLOs
- Security testing needs (SAST/DAST, pentest cadence)
- Accessibility, i18n/l10n, offline, or device-specific requirements
- Areas where a failure would be most damaging (safety, money, data loss, reputation)

## 6. Goals & constraints
- **Primary goal for the next quarter** (ship faster, reduce escapes, cut flake, hit coverage/compliance)
- Success metrics you care about (escape rate, MTTR, lead time, coverage, flake rate)
- Constraints: budget for tooling/headcount, timeline, hard deadlines
- Appetite for change (incremental improvements vs. willing to invest in a bigger shift)
