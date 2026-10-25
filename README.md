# FAIR Resources Finder

A static SvelteKit site that lists external FAIR assessment resources and links
to them. Content is plain YAML under `content/`; UI strings are in
`messages/{en,es}.json`. English and Spanish. The site is fully prerendered and
makes no runtime requests to third parties. See `specs.md` and `plan.md`.

## Commands

```sh
npm install
npm run dev
npm run check        # svelte-check
npm run lint         # prettier + eslint
npm run format       # prettier --write
npm run build        # runs `npm run validate` first (prebuild), then static output in build/
npm run validate     # content schema, cross-checks, style lint over content and messages
npm run schema       # regenerate content/tool.schema.json
npm run preview
```

`npm run build` fails until `content/` exists: the `prebuild` script runs
`npm run validate`, which reports the missing content files (and still lints
`messages/*.json`). This is expected until milestone M3 authors the content.

`npm install` and `npm run build` run `paraglide-js compile`, which loads
plugins from jsdelivr, so these steps need network access.

To deploy under a sub-path, set `BASE_PATH` at build time:

```sh
BASE_PATH=/fair npm run build
```

## Licenses

- Code: MIT, see `LICENSE`.
- Content (`content/`): CC-BY-4.0, see `LICENSE-CONTENT.md`.
