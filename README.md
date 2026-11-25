# FAIR Resources Finder

A static SvelteKit site that lists external FAIR assessment resources and links
to them. Content is plain YAML under `content/`; UI strings are in
`messages/{en,es}.json`. English and Spanish. The site is fully prerendered and
makes no runtime requests to third parties except the Google tag (analytics), which loads by default; a notice on each page lets the visitor turn it off. See `specs.md` and `plan.md`.

## Run locally

Requires Node 22.6 or later and network access for the first install (see below).

```sh
npm install
npm run dev
```

Open the address that `npm run dev` prints (Vite defaults to `http://localhost:5173`). The
root redirects to `/en` or `/es`; the guided finder is at `/en/wizard`.

To see the static build that is deployed, run `npm run build` and then `npm run preview`.

## Commands

```sh
npm install
npm run dev
npm run check        # svelte-check
npm run lint         # prettier + eslint
npm run format       # prettier --write
npm run test:unit    # vitest (watch mode; use `npx vitest run` for a single run)
npm run test:e2e     # playwright (installs browsers, builds, then serves the build)
npm run build        # runs `npm run validate` first (prebuild), then static output in build/
npm run validate     # content schema, cross-checks, style lint over content and messages
npm run schema       # regenerate content/tool.schema.json
npm run links        # link and freshness report (see below)
npm run metrics      # citation, GitHub and download numbers: dry run (see Metrics)
npm run check:base-path  # build with BASE_PATH=/fair and check internal links
                         # (it regenerates src/lib/paraglide: run `npm run build` afterwards)
npm run preview
```

Node 22.6 or later is required: the `validate`, `schema`, `links` and `metrics` scripts use
`--experimental-strip-types`.

`npm run build` runs `npm run validate` first (the `prebuild` script) and fails when the
content or `messages/*.json` break a schema, cross-check or style rule. A `TODO` in an
`es` field also fails validation.

`npm install` and `npm run build` run `paraglide-js compile`, which loads
plugins from jsdelivr, so these steps need network access.

To deploy under a sub-path, set `BASE_PATH` at build time:

```sh
BASE_PATH=/fair npm run build
```

## Link check

`npm run links` requests every URL in the content (HEAD, with GET as fallback; 15 s
timeout, 2 retries, concurrency 4) and lists tools not verified within
`verification.staleAfterDays`. It prints a Markdown report and writes `link-report.md`
(ignored by git). The exit code is 0 whether or not there are findings.
`npm run links -- --only <tool-id>` checks only the URLs of one tool file.

A weekly GitHub Actions workflow (`.github/workflows/links.yml`, Mondays 06:00 UTC, also
runnable by hand) runs the same script. When the report has findings it creates or updates
a single open issue labelled `link-check`. When there are none and an issue is open, it
adds a comment and leaves the issue open. A 200 response does not confirm that a tool
works, so `last_verified` is updated by hand.

## Guided finder

The page `/wizard` is driven by `content/wizard.yaml`: the questions, their help texts and the
two levels (simple and advanced). The options of a question come from `content/taxonomy.yaml`;
`api` and `self_hostable` carry their own single option label. `npm run validate` and the unit
tests cross-check the file: every id in `levels` has a question, there are no duplicate ids, the
simple level is a subset of the advanced one, and only `api` and `self_hostable` carry `option`.
`features.wizard` in `content/site.yaml` shows or hides the navigation item and the link from the
home page; the route stays prerendered either way. See `specs.md`, section 5.7.

## Comparison

The page `/compare` shows two or three tools (entries of kind `tool`) side by side. It reads the
facts recorded in `content/tools/*.yaml`; there is no extra content file. The selection is kept in
the query string (`?tools=a,b,c`). `features.compare` in `content/site.yaml` shows or hides the
links from the home page and from the tool pages. See `specs.md`, section 6.

## Metrics

An entry may record citation, GitHub and download numbers in an optional `metrics` block of its
YAML file (`specs.md`, section 5.4, "Metrics"). The detail page and the comparison show them as
recorded facts with their source and the date they were checked. They are not ranked, scored or
used to sort or filter anything.

`npm run metrics` prints, for every recorded value, the number on record and the current number
from OpenAlex, GitHub, Zenodo and PyPI, and writes nothing. `npm run metrics -- --write` applies
the changes (`--all` lists unchanged values too, `--only <tool-id>` limits it to one entry). A
value that cannot be fetched or looks wrong (a citation count or a total below half of the
recorded one, an archived or missing repository) is kept and reported. A GitHub token in
`GITHUB_TOKEN` or `GH_TOKEN` is used when set, to avoid the unauthenticated rate limit.

A weekly workflow (`.github/workflows/metrics.yml`, Mondays 07:00 UTC, also runnable by hand)
runs `npm run metrics -- --write`, then `npm run validate` and the unit tests, and commits the
changed content files to `main` as `github-actions[bot]`. These numbers are objective data, not
content under review, so the job commits them itself (owner decision of 2026-11-24). Failures go
into an issue labelled `metrics-check`, which a run with no findings closes. A push made with
`GITHUB_TOKEN` does not trigger CI or the deploy workflow: refreshed numbers reach the live site
at the next deploy.

## Contributing

See `CONTRIBUTING.md` for how to add or update a tool.

## Deployment

The target domain is `fair.dataobservatory.net`. The CDK stack and the deployment
notes are in `infra/README.md`.

## Status

Implemented, deployed to AWS (S3 + CloudFront) and public at https://fair.dataobservatory.net. See `specs.md` sections 18 and 19 and `infra/README.md` ("Current deployment state") for open items and deviations.

## Licenses

- Code: MIT, see `LICENSE`.
- Content (`content/`): CC-BY-4.0, see `LICENSE-CONTENT.md`.
