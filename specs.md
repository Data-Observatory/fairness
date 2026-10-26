# FAIR Resources Finder: Static Site Specification

Status: v1 implemented and deployed (see sections 18 and 19 for open items and deviations). Decisions confirmed by the owner on 2026-10-25.

Deviations from this draft in the implementation: filter and grouping logic lives in `src/lib/core/view.ts` and `home-state.ts` (there is no `filter.ts`); every page head also emits canonical and hreflang links built by `src/lib/core/seo.ts` from the domain in `content/site.yaml`; `scripts/validate.mjs` and `scripts/check-base-path.mjs` were added; `status_note` may accompany any status (see 5 and 7); deployment is authorized as described in sections 2 and 15.

A small static website, published by Data Observatory, that lists external resources used to evaluate how FAIR (Findable, Accessible, Interoperable, Reusable) a dataset is, usually from its metadata alone, and redirects visitors to them. Style, stack and quality bar follow the reference repository `Data-Observatory/repository-crisis-scorecards-assesment` (live at https://rcs.dataobservatory.net/), referred to below as "the reference".

---

## 1. Goals

- Help a visitor find the right FAIR assessment resource for what they have in hand (a DOI, a landing page URL, a metadata file, an ontology, nothing yet).
- Describe each resource factually: what it checks, what input it needs, what it returns, who runs it, when it was last verified.
- Redirect to the resource (external link). The site never runs an assessment itself.
- Make nearly everything editable without touching code: tools, filters, sections, "best for" text, caveats, site name, domain, verification policy. All of it lives in YAML files under `content/`.
- Accept community contributions by pull request (one YAML file per tool).
- Look and behave like the reference: same shell, fonts, accent colour, accessibility bar, test discipline.

## 2. Non-Goals (v1)

- No backend, no accounts, no analytics, no cookies.
- No assessment logic, scoring, or aggregation of results from third-party tools.
- No ranking of tools and no "recommended" label. "Best for" is a short, neutral description of a use case, not a ranking (see 7.3).
- No prefilled deep links into third-party tools, no wizard. A static "Which tool fits?" table replaces both.
- No compare page (the filtered grid does the comparing).
- No deployment by sub-agents and none before the final milestone. Infrastructure code must pass `cdk synth` with dummy values. Deployment is authorized only to the app account designated by the owner, and is run by the lead session after the `cdk diff` is reviewed (no account ids, ARNs or profile names in tracked files).
- No CMS UI. Content changes are pull requests.

## 3. Decisions (confirmed)

| Topic          | Decision                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Design         | "Option D": filterable directory on the reference stack, factual detail pages, static finder table, no compare page                                                       |
| Scope          | Datasets, plus other digital objects (ontologies, software, repositories), plus directories, plus frameworks, each in its own section                                     |
| Languages      | English and Spanish at launch, URL-prefixed `/en`, `/es`, as in the reference                                                                                             |
| Spanish style  | Neutral, formal register (usted), no voseo, no emoji or emoticons, no em dashes. Owner reviews all Spanish text later                                                     |
| Tone           | Factual, no judgment. A small optional "best for" line per tool                                                                                                           |
| Hosting        | S3 + CloudFront via CDK like the reference, reusing its patterns. Default domain `fair.dataobservatory.net`, configurable. Deployed only by the lead session (section 15) |
| Ownership      | Data Observatory maintains. Outsiders may submit tools by pull request                                                                                                    |
| Build approach | Agents implement, tests are written first, an Opus agent reviews                                                                                                          |

## 4. Tech Stack and Project Structure

Same as the reference unless noted: SvelteKit 2, Svelte 5 runes (forced), Tailwind v4, `@sveltejs/adapter-static` (fully prerendered, no server routes), Paraglide JS for UI strings, TypeScript, Vitest (unit), Playwright + `@axe-core/playwright` (e2e and accessibility), ESLint, Prettier (with svelte and tailwind plugins), svelte-check. Node 22 in CI.

Added: `yaml` (parse), `zod` (validate), zod 4 built-in `z.toJSONSchema` (generate editor schema), `lychee`-free link checker written in Node (`scripts/check-links.mjs`, no new service).

Rule carried over from the reference: all logic lives in a framework-free TypeScript tree with no Svelte imports, unit-testable without a DOM.

```
content/                     all editable content, YAML only (section 5)
  site.yaml
  taxonomy.yaml
  sections.yaml
  finder.yaml
  caveats.yaml
  tools/<tool-id>.yaml
  tool.schema.json           generated, for editor validation (do not edit by hand)
messages/en.json, es.json    UI chrome strings (Paraglide), not content
src/lib/core/                framework-free logic
  schema.ts                  zod schemas for every content file
  content.ts                 loads + parses + validates + cross-checks content
  filter.ts                  filter and group logic
  style-lint.ts              content style rules (section 9)
  freshness.ts               last_verified staleness
src/lib/components/          thin Svelte components
src/routes/                  thin views, prerendered
scripts/                     check-links.mjs, generate-schema.mjs, remove-unlocalized-pages.mjs
infra/                       CDK, adapted from the reference (synth only)
e2e/                         Playwright specs
.github/workflows/ci.yml, links.yml
CONTRIBUTING.md, plan.md, specs.md, CLAUDE.md, README.md
LICENSE (MIT, code), LICENSE-CONTENT.md (CC-BY-4.0, content)
```

Content is loaded with `import.meta.glob('/content/**/*.yaml', { query: '?raw', eager: true })` so it works identically under Vite, Vitest and prerender. Validation runs at build and in tests: an invalid content file fails the build with the file path and field.

Locale handling, root redirect by `navigator.language`, `reroute` hook, `localized()` helper, `remove-unlocalized-pages.mjs` and `BASE_PATH` support are copied from the reference and adapted to this site's routes. Note: the reference's `project.inlang/settings.json` loads plugins from jsdelivr at compile time, so `npm run paraglide:compile` needs network access.

## 5. Content Model (YAML)

Every human-readable string is a localized map `{ en: "...", es: "..." }`. The validator requires both locales on every localized field (an optional field may be omitted entirely, but not half-filled). Adding a third locale later means adding it to `site.yaml` `locales` and to the Paraglide project; the validator then demands it everywhere.

### 5.1 `content/site.yaml`

```yaml
name: { en: FAIR Resources Finder, es: Buscador de recursos FAIR }
tagline: { en: ..., es: ... }
domain: fair.dataobservatory.net # used by infra default and canonical URLs
repository: https://github.com/Data-Observatory/<repo> # placeholder until created
contributeUrl: https://github.com/Data-Observatory/<repo>/blob/main/CONTRIBUTING.md
contactEmail: ... # optional
locales: [en, es]
defaultLocale: en
features:
  bestFor: true # show "best for" lines (cards and detail pages)
  finderTable: true
  statusFilter: true
verification:
  staleAfterDays: 180 # tools older than this show a neutral "not re-verified recently" note
style:
  forbiddenTerms: # judgment words, matched case-insensitively per locale, outside best_for
    en: [best, better, worst, superior, inferior, excellent, poor, recommended, leading, ideal]
    es: [mejor, peor, superior, inferior, excelente, deficiente, recomendado, líder, ideal]
  voseoWords:
    [vos, tenés, podés, querés, sabés, sos, hacé, mirá, abrí, elegí, seleccioná, usá, fijate]
  informalWords: [tú, tienes, puedes, puedas, quieres, necesitas] # es only
  forbiddenCharacters: [em_dash, en_dash] # the names `em_dash` and `en_dash` (not the characters themselves), mapped to U+2014 and U+2013 by the style lint
```

The rules apply to every text field, including `best_for`. See 9.

### 5.2 `content/taxonomy.yaml`

Defines the enumerations used for filters and tool fields. Each value has an id and localized label, optional localized description. Adding a value here makes it available in tool files and filters with no code change.

```yaml
filters:                      # order and visibility of filter groups on the home page
  - target
  - mode
  - input
  - framework
  - status
target:        # what the resource assesses
  - { id: dataset, label: {en: Dataset, es: Conjunto de datos} }
  - { id: ontology, ... }  - { id: software, ... }  - { id: repository, ... }
  - { id: any_digital_object, ... }  - { id: person_knowledge, ... }
mode:          # automated | manual | hybrid
input:         # doi | landing_page_url | metadata_url | metadata_file | ontology_uri | none
framework:     # fairsfair_metrics | fair_maturity_indicators | wilkinson_maturity_indicators | rda_fdmm | custom | other
status:        # available | limited | discontinued | unverified
```

Seed values for each group are listed in `plan.md` M2; the exact ids are fixed by the tests written there.

### 5.3 `content/sections.yaml`

Ordered list of home page sections. Each tool belongs to exactly one section through its `section` field.

```yaml
- id: datasets
  title: { en: Dataset assessment tools, es: ... }
  intro: { en: ..., es: ... }
  collapsed: false
- id: other-objects # ontologies, software, repositories
  collapsed: true
- id: frameworks # metric sets and maturity models, not runnable tools
  collapsed: false
- id: directories # other catalogues of FAIR tools
  collapsed: false
```

### 5.4 `content/tools/<tool-id>.yaml`

File name equals `id`. Fields:

| Field           | Required  | Notes                                                                                                                              |
| --------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | yes       | kebab-case, equals file name                                                                                                       |
| `kind`          | yes       | `tool`, `framework`, `directory`                                                                                                   |
| `section`       | yes       | id from `sections.yaml`                                                                                                            |
| `name`          | yes       | plain string (product names are not translated)                                                                                    |
| `url`           | yes       | `https://` link opened by the "Open" button                                                                                        |
| `operator`      | yes       | `{ name, url? }`                                                                                                                   |
| `summary`       | yes       | localized, 1 to 2 sentences, factual                                                                                               |
| `best_for`      | no        | localized, one sentence, neutral use case. Shown only if `features.bestFor`                                                        |
| `targets`       | tool: yes | list of `target` ids                                                                                                               |
| `mode`          | tool: yes | `mode` id                                                                                                                          |
| `inputs`        | tool: yes | list of `input` ids                                                                                                                |
| `frameworks`    | no        | list of `framework` ids the resource implements                                                                                    |
| `output`        | tool: yes | localized: what the visitor gets back (score, report, JSON, ...)                                                                   |
| `api`           | no        | `{ available: bool, url? }`                                                                                                        |
| `source_code`   | no        | URL                                                                                                                                |
| `self_hostable` | no        | bool                                                                                                                               |
| `license`       | no        | SPDX id or free text                                                                                                               |
| `status`        | yes       | `status` id                                                                                                                        |
| `status_note`   | no        | localized, factual evidence for the status shown, allowed on any status (for example "Backend host did not respond on 2026-10-25") |
| `last_verified` | yes       | ISO date the maintainer last opened the resource and confirmed the entries                                                         |
| `references`    | no        | list of `{ title, url }` (papers, docs)                                                                                            |

`kind: framework` and `kind: directory` may omit `targets`, `mode`, `inputs`, `output`.

### 5.5 `content/finder.yaml` ("Which tool fits?")

A static table, no logic. One row per input a visitor may have.

```yaml
rows:
  - input: doi # taxonomy input id
    note: { en: ..., es: ... } # optional
    tools: [f-uji, fair-enough, fair-champion]
```

Cross-check: every tool id must exist; rows may only list tools whose `inputs` include the row's input (tests enforce this). Row order is display order.

### 5.6 `content/caveats.yaml`

Short localized paragraphs for the "What automated FAIR checks can and cannot tell you" box on the home page and the About page. Must include: tools implement different metric sets and can return different results for the same resource; a result describes what the tool could detect from public metadata, not the quality of the data; the site does not endorse any tool. Cites the 2024 Data Science Journal paper "The FAIR Assessment Conundrum: Reflections on Tools and Metrics" as a reference (DOI to be verified by the implementing agent before use).

## 6. Pages and Navigation

Pill nav as in the reference. Items: Home, About. Locale switch EN / ES. Skip-to-content link. Footer with licenses, repository link, contribute link, privacy statement.

| Route (prefixed by `/en` or `/es`) | Content                                                                                                                                                                                                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                | Hero (name, tagline). Caveat box. Filter bar. Sections in `sections.yaml` order, each a grid of tool cards (name, summary, chips for mode / targets / status, "best for" line if enabled, "Open" external button, "Details" link). Collapsed sections use native `<details>`. "Which tool fits?" table. |
| `/tools/[id]`                      | Prerendered for every tool. Name, summary, best for, definition list of all factual fields (operator, targets, mode, inputs, frameworks, output, API, source code, self-hostable, license, status and note, last verified with staleness note), references, "Open" button, back link.                   |
| `/about`                           | What FAIR assessment is (short), caveats, how entries are verified, how to suggest a tool (link to CONTRIBUTING), licenses, citation of this site, attribution to the reference project style (neutral).                                                                                                |

Filters are client-side progressive enhancement: with JavaScript disabled, all tools are visible and the page remains fully usable. Filter state is mirrored in the URL query string (`?mode=automated&target=dataset`) so a filtered view can be shared; it is read on the client only (pages stay prerendered). Within one filter group the selection is OR, across groups AND. An empty result shows a neutral message and a "clear filters" control.

External links: `rel="noopener noreferrer"`, `target="_blank"`, with a visually hidden "(opens in a new tab)" text and an external-link icon. The whole external destination is shown as visible host text on the detail page.

## 7. Content Rules

1. All site content is factual and neutral. No ranking, no "recommended", no superlatives. Enforced partially by the style lint (section 9) and by review.
2. Status values are evidence-based. `unverified` means the maintainer could not confirm it works on `last_verified`. `limited` means partly working, with `status_note` giving the evidence. `status_note` may be added to any status, as evidence for the status shown. `discontinued` only when the operator says so, with the source in `references`.
3. "Best for" is one neutral sentence describing a situation, for example "Assessing a published dataset that has a DOI." It must not compare with other tools. It can be disabled globally with `features.bestFor: false`, or per tool by omitting the field.
4. No emoji, no emoticons, no em dash or en dash anywhere in content or in UI strings. Use commas, colons, parentheses or hyphens.
5. Spanish: neutral Latin American-compatible register, formal (usted) when addressing the reader, imperative in usted form ("Abra", "Seleccione"), never voseo (no "vos", "tenés", "podés", "abrí"), no regionalisms. The owner reviews the Spanish before release.
6. Product names, acronyms and proper nouns stay untranslated.

## 8. Seed Content (verified by the implementing agent before inclusion)

The agent must confirm each URL responds and read the tool's own page before writing any field. Facts below come from research on 2026-10-25 and are starting points, not truth. Anything unconfirmed gets `status: unverified` and a `status_note`, or is left out.

Datasets section: F-UJI (https://www.f-uji.net/), FAIR enough (https://fair-enough.semanticscience.org/), FAIR Champion (https://tools.ostrails.eu/champion), FAIR-Checker (https://fair-checker.france-bioinformatique.fr/), FAIR Evaluator (front-end https://fairsharing.github.io/FAIR-Evaluator-FrontEnd/ , backend host did not respond, `limited` or `unverified`), FAIRshake (https://fairshake.cloud/), ARDC FAIR Data Self-Assessment Tool (https://ardc.edu.au/resource/fair-data-self-assessment-tool/), FAIR-Aware (https://fairaware.dans.knaw.nl , assesses the person's knowledge, target `person_knowledge`).

Other objects section: FAIR EVA (source https://github.com/EOSC-synergy/FAIR_eva , example instance https://fair.csic.es is repository-specific), O'FAIRe (https://github.com/agroportal/fairness , ontologies), FOOPS! (https://w3id.org/foops , ontologies, liveness unconfirmed).

Frameworks section: FAIRsFAIR Data Object Assessment Metrics, RDA FAIR Data Maturity Model, FAIR-IMPACT metrics. The agent finds and verifies canonical URLs or DOIs.

Directories section: FAIRassist (https://fairassist.org/), FAIR-IMPACT FAIR Implementation Catalogue (https://catalogue.fair-impact.eu/), FAIR-IMPACT assessment tools page (https://fair-impact.eu/fair-assessment-tools).

Not listed: SATIFYD (reported discontinued by the operator; unverified by us). May be mentioned in `references` of a related entry only if verified.

## 9. Validation and Style Lint

`content.ts` returns a typed, validated content object or throws with file and path. Checks:

1. Schema (zod) for every file, strict (unknown keys fail).
2. Localized fields have every locale in `site.yaml` `locales`.
3. `id` equals file name; ids unique; `section`, taxonomy references, finder tool ids all resolve.
4. Finder rows only list tools that accept that input.
5. URLs are `https://`; DOIs are normalized to `https://doi.org/...`.
6. `last_verified` is a valid past or present ISO date.
7. Style lint (`style-lint.ts`), run over every string in content and in `messages/*.json`: no character in `forbiddenCharacters`; no emoji (Unicode Extended_Pictographic) and no ASCII emoticons (`:)`, `:-)`, `;)`, `:D`, `:(`); no forbidden term from `style.forbiddenTerms` for that locale (whole word match); Spanish text has no voseo and no informal second person. Voseo: `\bvos\b` plus a whole-word list in `site.yaml` (`style.voseoWords`, seeded with tenés, podés, querés, sabés, sos, hacé, mirá, abrí, elegí, seleccioná, usá, fijate). Informal tuteo: `style.informalWords` (tú, tienes, puedes, puedas, quieres, necesitas; imperative forms such as abre or selecciona are not listed because they equal the third person and would flag neutral descriptions) also fails the build, because the register must be formal (usted).

Style lint failures fail the build and CI. The lists are in `site.yaml`, so maintainers can adjust them in one place.

JSON Schema for editors is generated by `npm run schema` into `content/tool.schema.json` and each YAML file carries `# yaml-language-server: $schema=../tool.schema.json` at the top.

## 10. Freshness and Link Checking

- `freshness.ts`: `isStale(tool, today, staleAfterDays)`. UI shows "Last verified: 2026-10-25" and, when stale, a neutral line "Not re-verified in the last N days."
- `scripts/check-links.mjs`: reads content, requests every `url`, `operator.url`, `api.url`, `source_code` and `references[].url` (HEAD, falling back to GET, 15 s timeout, 2 retries, polite concurrency 4, identifying User-Agent). Output: Markdown report to stdout and `link-report.md`, exit code 0 always. Reports non-2xx, redirects to a different host, TLS failures, timeouts, and stale tools. A 200 does not prove the backend works, so the report says: "A 200 response does not confirm the tool works. Confirm by hand and update `last_verified`."
- `.github/workflows/links.yml`: weekly cron and manual trigger; if the report has findings, create or update a single GitHub issue labelled `link-check`. Never fails the build.

## 11. Visual and Interaction Design

Follow the reference tokens: white background, `text-zinc-800`, `blue-600` accent, `rounded-full` pill nav with `ring-1 ring-zinc-200`, Inter (body, 300 to 600) and Space Grotesk (headings, 500 to 700), both self-hosted variable woff2 copied from the reference `src/lib/assets/fonts/`. No external requests at runtime (no CDN fonts, no analytics, no embeds).

- Cards: `rounded-2xl`, `ring-1 ring-zinc-200`, hover `shadow-sm`. Chips: small rounded-full with zinc background; status chip uses text plus icon, never colour alone.
- Status colours (always with text label): available zinc/blue, limited amber, unverified zinc, discontinued red-tinted.
- Responsive: single column below 640 px, two columns at `md`, three at `xl`. Filter bar collapses into a `<details>` on small screens.
- Print styles as in the reference (cards in one column, nav hidden).
- `prefers-reduced-motion` honoured. Dark mode is out of scope (the reference has none).

## 12. Accessibility

WCAG 2.2 AA target. Semantic landmarks, skip link, visible focus ring, filter controls as real checkboxes in `fieldset`/`legend`, live region announcing result counts ("12 resources shown"), external-link text, adequate contrast (checked by axe), no information by colour alone, `lang` attribute per locale document. Playwright runs axe on every page in both locales and fails on any violation (as in the reference).

## 13. Privacy Statement

Wording (en): "This site collects no data and sets no cookies. Links lead to third-party tools, which have their own privacy policies." The Spanish version is written by the agent in formal register and reviewed by the owner. The reference's "nothing leaves your browser" sentence is not reused because it stops being relevant once a visitor follows a link.

## 14. Licensing

Code: MIT. Content (YAML, texts): CC-BY-4.0, as in the reference (`LICENSE`, `LICENSE-CONTENT.md`). Third-party product names belong to their owners. About page states this.

## 15. Deployment

`infra/` adapted from the reference: S3 + CloudFront (OAC), ACM certificate in us-east-1, CloudFront Function URI rewrite, default domain `fair.dataobservatory.net` overridable by `-c domainName=...`, stack `FairSiteStack`. The reference's account IDs, role ARNs and profile names must not be copied: use placeholders (`<ACCOUNT_ID>`) and document the cross-account DNS step as in the reference. Requirement: `cd infra && npm ci && npx cdk synth` succeeds with a dummy account and region. Deployment is authorized only to the app account designated by the owner (kept outside tracked files), and is run by the lead session after the `cdk diff` is reviewed, never by a sub-agent. DNS records for the final domain are created only as authorized by the owner. No deploy workflow in v1 (a deploy workflow is a later task). `BASE_PATH` supported for the app build.

## 16. Testing Strategy (tests first)

Order is mandatory (also in `CLAUDE.md`): for every milestone in `plan.md`, tests are written first, run, and shown failing for the right reason; only then is the implementation written; tests are not weakened to pass.

Unit (Vitest, no DOM):

- schema: valid fixtures pass, each missing or extra field fails with a useful path; localized field missing `es` fails.
- content cross-checks (section 9, items 2 to 6) with fixture directories.
- style lint: each rule has a failing and a passing fixture, including em dash, en dash, emoji, emoticon, voseo examples, forbidden terms per locale.
- filter logic: OR within group, AND across groups, empty groups, URL query round trip.
- finder: row/tool input consistency.
- freshness: boundary at `staleAfterDays`.
- real content test: the actual `content/` directory loads, passes all checks, every tool has both locales, and every seed tool URL is `https://`.

Component/e2e (Playwright, run against `vite preview` of the static build):

- home renders all sections in both locales; collapsed section toggles.
- filters change visible cards, update the URL, announce counts; JS-disabled run shows all tools.
- detail page exists for every tool id, has the external link with the right href and `rel`.
- locale switch keeps the path; root redirect by browser language.
- axe scan on `/en`, `/es`, `/about`, one detail page, each locale: zero violations.
- no network request leaves the origin (assert via request listener).
- `features.bestFor: false` hides "best for" (build-time fixture or unit-level rendering test).

Static checks in CI: `svelte-check`, `eslint`, `prettier --check`, `vitest run`, `npm run build`, Playwright, and `cdk synth`.

## 17. Contributing

`CONTRIBUTING.md` explains: copy `content/tools/_template.yaml`, fill it, run `npm run validate` (schema, cross-checks, style lint, link check for the new file), open a PR. A PR template lists the checklist (URL opened by hand, `last_verified` set, both languages present, neutral wording, no emoji or dashes). Outsiders may provide English only and mark Spanish as `TODO`; CI treats a `TODO` in `es` as a failure for merge to main, so maintainers translate in the PR before merging. In practice a `TODO` in `es` makes `npm run validate` fail (and therefore the build), so an English-only PR needs a maintainer to supply the Spanish text before it can merge.

## 18. Open Items (owner)

- Repository: `https://github.com/Data-Observatory/fairness` (public). The site links to it from the footer, About page and contribution links.
- Spanish review of all text. Wording chosen by the implementation that deserves a look: "Autoalojable" (self-hostable), "Caso de uso" (label of the `best_for` line), "Ficha técnica" (detail facts title), "Dato de partida" (finder input column).
- Whether to add the finder as a guided wizard in a later phase.
- First GitHub Actions runs: the CI and weekly link-check workflows had never run before the first push. Check that they pass (the WebKit e2e project only runs there) and fix anything environment specific.
- Re-verification: entries carry `last_verified` and are flagged after `verification.staleAfterDays` (180). A maintainer re-checks them; the weekly link check reports broken links.
- Hardening backlog (no known blocker): hash-based CSP, CloudFront and S3 access logging (see section 19).
- Deploy workflow (GitHub Actions) and the AWS account decisions for it: deferred. Deploys are manual for now.

## 19. Deviations from the original plan and deferred items

Deviations (decided during implementation):

- The on-page label of `best_for` is "Use case" (Spanish "Caso de uso"), not "Best for", because the style lint forbids the word "best" in UI text. To use the literal label, remove "best" from `style.forbiddenTerms` in `content/site.yaml` and change the message `card_use_case` in `messages/`.
- Locales are hardcoded to `en` and `es` in the schemas for v1 (a third locale needs a schema change).
- `zod-to-json-schema` was replaced by zod 4's built-in `z.toJSONSchema`; the validate and schema scripts use `node --experimental-strip-types` (Node 22.6 or later).
- Unknown filter ids in the URL query are ignored. Sections with matching tools open automatically while a filter is active, and all sections open for printing.
- Pages are prerendered with server loads (`+*.server.ts`), so the content loader (yaml, zod) is not in any client bundle.
- `/en/` maps to `/en.html` in the CloudFront Function because the build has no per-directory index files.
- A `portal_record` input type was added to the taxonomy for tools that work on records already registered in their own portal (O'FAIRe).
- Content CSP allows inline scripts and styles because SvelteKit's bootstrap needs them. A hash-based CSP (`kit.csp`) would tighten it.
- WebKit runs in CI or with `PW_WEBKIT=1`; it is off locally because some machines lack its system libraries.

Deferred (not implemented, no known blocker):

- Filter group and fact labels live in `src/lib/core/labels.ts`, not in Paraglide messages.
- Filter options with zero matching tools can still be selected.
- License names (MIT, CC-BY-4.0) and the link to the Repository Crisis Scorecards project are in messages, not in `site.yaml`.
- CloudFront and S3 access logging are not configured.
- The two verification runs of external tools described in the git history left public records on third-party services (FAIR Evaluator evaluation "Availability check 2026-10-25", plus one DOI assessment each on F-UJI and FAIR Champion).
