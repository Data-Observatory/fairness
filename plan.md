# Implementation Plan

Spec: `specs.md`. Rules: `CLAUDE.md`. Decisions confirmed 2026-10-25: Option D, scope all, en+es, formal neutral Spanish, factual plus "best for", CDK authored but not deployed, DO maintains, PRs welcome, tests first, agents implement, Opus reviews.

## Working method

- Lead session orchestrates, runs no long waits, does not park agents. Each agent does one bounded milestone step and exits with a short report (agent cost discipline).
- Per milestone: (1) test agent writes tests and fixtures only, proves they fail; (2) implementation agent makes them pass without editing tests; (3) lead runs the checks itself; (4) Opus review agent reads the result and reports findings; (5) fix agent addresses confirmed findings; lead re-runs checks.
- Opus review is mandatory after M2 (content engine), after M4 (UI), and at the end (M6). Other milestones get a lead-run check only.
- Agents get a short brief: goal, files to read (`specs.md` sections, `CLAUDE.md`), explicit scope, what not to touch. No agent waits on another.

## Milestones

### M1 Scaffold (no tests-first needed, nothing to test yet)

Copy from the reference clone: `package.json` (rename, add `yaml`, `zod`), `vite.config.ts`, `svelte.config` equivalent (it is inside vite.config), `tsconfig.json`, `eslint.config.js`, `prettier.config.js`, `.prettierignore`, `.npmrc`, `.gitignore`, `playwright.config.ts`, `src/app.html`, `src/app.d.ts`, `src/hooks.ts`, `src/hooks.server.ts`, `src/lib/i18n.ts`, `src/routes/layout.css`, fonts, favicon, `project.inlang/settings.json`, `scripts/remove-unlocalized-pages.mjs` (adapt to this site's routes), `static/robots.txt`, `static/404.html`, license files. Placeholder home page. Strip all RCS-specific code, names and content. `npm install`, `npm run check`, `npm run build` succeed.
Exit: empty site builds in `/en` and `/es`.

### M2 Content engine (framework-free)

Tests first (`src/lib/core/*.test.ts`, fixtures in `src/lib/core/__fixtures__/`): schema, cross-checks, style lint (each rule with failing and passing fixture), filter logic, finder consistency, freshness, query-string round trip. Then `schema.ts`, `content.ts`, `filter.ts`, `style-lint.ts`, `freshness.ts`, `scripts/generate-schema.mjs`, `npm run validate`, `npm run schema`.
Taxonomy seed ids fixed here: target (dataset, ontology, software, repository, any_digital_object, person_knowledge), mode (automated, manual, hybrid), input (doi, landing_page_url, metadata_url, metadata_file, ontology_uri, none), framework (fairsfair_metrics, fair_maturity_indicators, wilkinson_maturity_indicators, rda_fdmm, custom, other), status (available, limited, discontinued, unverified).
Exit: unit tests green on fixtures. Opus review.

### M3 Content authoring

Tests first: the "real content" test from specs section 16 (initially failing because `content/` is empty). Then author `content/site.yaml`, `taxonomy.yaml`, `sections.yaml`, `finder.yaml`, `caveats.yaml`, `tools/_template.yaml` and one file per seed entry in specs section 8, after verifying each URL and reading the tool's own page. Spanish written in formal neutral register. Run `npm run validate` and the style lint. Report every entry set to `unverified` or left out, and why.
Exit: real content test green, style lint clean. Owner reviews Spanish later.

### M4 UI

Tests first: Playwright specs (home, filters, detail pages, locale switch, root redirect, no third-party requests, axe, JS-disabled) and any component-level Vitest tests. Then layout, nav, footer, home (hero, caveat box, filter bar, sections, cards, finder table), `/tools/[id]` with `entries()`, `/about`, `messages/{en,es}.json`, print styles, status chips, query-string-mirrored filters, `features.*` flags honoured. Update `vite.config.ts` prerender entries from content.
Exit: `check`, `lint`, `test:unit`, `build`, `test:e2e` green. Opus review (including a look at the built pages in a browser via chrome-devtools screenshots at 375 px and 1280 px).

### M5 Maintenance tooling and contribution flow

Tests first: unit tests for the link-report formatter and staleness section (network mocked). Then `scripts/check-links.mjs`, `.github/workflows/ci.yml`, `.github/workflows/links.yml`, `CONTRIBUTING.md`, PR template, issue template for "suggest a tool", `npm run validate` hooked into CI, README.
Exit: unit tests green, workflows lint (actionlint if available, otherwise manual YAML check).

### M6 Infra (authored, not deployed) and final review

Adapt `infra/` from the reference with placeholders, stack `FairSiteStack`, default domain from `site.yaml`/context. `cdk synth` with dummy env must pass. Deploy authorized by the owner on 2026-10-25 to the reference RCS app account, run by the lead session after `cdk diff` review; DNS: the owner authorized exactly two Route 53 records for `fair.dataobservatory.net` in the DNS account (ACM validation CNAME, CloudFront alias A); nothing else. Sub-agents make no AWS call. Then full Opus review of the whole repository against `specs.md` (scope: conformance, a11y, style rules including Spanish and dashes, content accuracy against live pages, test quality, leftover RCS references). Fix agent addresses confirmed findings.
Exit: everything green, review report presented to the owner with open items.

## Risks and mitigations

- Third-party tools change or disappear: `status`, `last_verified`, weekly link report issue.
- Spanish quality: lint catches voseo and informal forms only; the owner reviews text.
- Paraglide compile needs network (jsdelivr plugins): note in README; CI has network.
- Content facts drift from research notes: agents must verify against live pages, Opus re-checks sample entries.
- A 200 response hides a dead backend: the report states this, and `last_verified` is bumped by hand.

## Status (2026-10-25)

M1 to M6 are done and reviewed (Opus reviews after M2, M4 and at the end; findings fixed). Verification at the last commit: 559 unit tests, 494 end-to-end tests (Chromium and Firefox), 50 infra tests, `check`, `lint`, `validate`, `check:base-path` and `cdk synth` all clean.

Deployment: `FairSiteStack` is deployed to the reference RCS app account (us-east-1). The ACM validation CNAME exists in the DNS account. The CloudFront alias A record for the domain is NOT created yet, so the site is not public at the domain. It was held back because the repository links in `content/site.yaml` still point to a repository that does not exist. See `infra/README.md`, "Current deployment state".

## Owner decisions still open

See `specs.md` section 18 (repository URL, publishing the alias record, Spanish review, wizard, deploy workflow) and section 19 (deviations and deferred items).
