# FAIR Resources Finder

Static SvelteKit site listing external FAIR assessment resources and redirecting to them. Full spec: `specs.md`. Work plan: `plan.md`. Reference project for style and stack: https://github.com/Data-Observatory/repository-crisis-scorecards-assesment (clone it to a scratch directory to copy configs; do not copy account IDs, ARNs or profile names).

## Rules

- Tests first. Per milestone in `plan.md`: write tests, run them, confirm they fail for the right reason, then implement. Never weaken or delete a test to make it pass. If a test is wrong, say so in the report and fix it in a separate, explained step.
- Content lives in `content/**/*.yaml`, never hard-coded in components. UI chrome strings live in `messages/{en,es}.json` (Paraglide). "Best for", caveats, sections, filters and site name must stay editable in YAML only.
- Logic lives in `src/lib/core/` with no Svelte imports. Components are thin.
- Every localized field needs `en` and `es`.
- Deploy only at milestone M6 and only by the lead session, never by a sub-agent. Allowed: the AWS profile of the reference RCS site's app account (name kept in the lead's private notes, not here), region us-east-1, after `cdk diff` is reviewed. Writes to the separate DNS account (Route 53 for dataobservatory.net) are NOT authorized: ask the owner first. Before M6, `cdk synth` with dummy values only. Never put account IDs, ARNs or profile names in tracked files; use context or environment.
- Git: local repo on `main`. Commit incrementally (one logical change per commit) with Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`), and NO Co-Authored-By or other attribution trailer. Tests and implementation may be separate commits. Do not push or create remote repositories unless the owner asks.
- No runtime requests to third parties (no CDN, fonts, analytics). Self-host everything.
- Verify any tool URL or DOI by fetching it before writing it into content. Unconfirmed facts get `status: unverified` and a `status_note`, or are left out.
- Svelte 5 runes mode only. Match reference code style (tabs, Prettier config copied from the reference).

## Writing style (applies to code comments, docs, content, UI strings, commit messages)

- Factual and neutral. No judgment words (best, better, recommended, leading, ideal, and similar). No ranking.
- No emoji, no emoticons, no em dashes, no en dashes. Use commas, colons, parentheses or hyphens.
- Spanish: neutral, formal register (usted), imperative in usted form. NEVER voseo (vos, tenés, podés, abrí) and avoid informal tuteo (tú, tienes, puedes) in site text. Check every Spanish sentence against voseo before saving.
- Product names and acronyms are not translated.

## Commands

```sh
npm install
npm run dev
npm run check        # svelte-check
npm run lint         # prettier + eslint
npm run test:unit    # vitest
npm run test:e2e     # playwright (needs a build)
npm run validate     # content schema, cross-checks, style lint
npm run schema       # regenerate content/tool.schema.json
npm run links        # link and freshness report
npm run build
(cd infra && npm ci && npx cdk synth -c domainName=fair.example.test)   # synth only
```

## Definition of done for a milestone

Tests written first and seen failing, then green. `check`, `lint`, `test:unit` pass; `build` and `test:e2e` pass when the milestone touches UI. Short report: files changed, tests added, anything skipped or uncertain.
