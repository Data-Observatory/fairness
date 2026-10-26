# Contributing

This directory lists external FAIR assessment resources. Contributions that add a
tool, correct an entry or update its status are welcome. All content lives in YAML
files under `content/`; no code changes are needed to add a tool.

## Add or update a tool

1. Copy `content/tools/_template.yaml` to `content/tools/<id>.yaml`. The id is
   kebab-case and equals the file name without `.yaml`.
2. Fill the fields. The field guide is `specs.md`, section 5.4, and the machine-readable
   description is `content/tool.schema.json` (editors that support the YAML language
   server use it through the `$schema` comment on the first line of the template).
3. Run `npm run validate`. It checks the schema, the cross-references and the style rules.
4. Run `npm run links -- --only <id>`. It requests the URLs of that file only (HEAD, with
   GET as fallback) and prints a Markdown report.
5. Open a pull request. The pull request template lists the checklist.

To update an existing tool, edit its file and follow steps 3 to 5.

## Guided finder questions

The questions of the guided finder (`/wizard`) are in `content/wizard.yaml`: the question and help
texts (each with `en` and `es`) and the lists of question ids asked at the simple and advanced
levels. The options come from `content/taxonomy.yaml`, so a new taxonomy value appears in its
question without a change to `wizard.yaml`. `npm run validate` runs the cross-checks (see
`specs.md`, section 5.7). `features.wizard` in `content/site.yaml` turns the navigation item and
the home link on or off.

## Content rules

See `specs.md`, section 7.

- Wording is factual and neutral. No ranking, no judgment words (for example best,
  better, recommended, leading, ideal), no comparison with other tools.
- No emoji, no emoticons, no em dashes and no en dashes. Use commas, colons,
  parentheses or hyphens.
- `status` is based on evidence. `status_note` records what was observed and when
  whenever the status is not `available`. `discontinued` is used only when the
  operator says so, with the source in `references`.
- `best_for` is optional and is one neutral sentence describing a situation, for
  example "Assessing a published dataset that has a DOI."
- Product names, acronyms and proper nouns are not translated.
- Spanish text uses the formal register (usted) and never voseo.

## Languages

Every localized field needs `en` and `es`. Contributors may submit English only and
write `TODO` in the `es` field. A `TODO` in `es` makes `npm run validate` fail (and so the
build and CI), so a maintainer translates the Spanish in the pull request before it is
merged.

## Verifying a tool

Open the resource and its linked pages by hand. Never submit non-public or personal
data to a third-party tool, including unpublished datasets, DOIs of unpublished work or
personal information. Reading pages and viewing the public form is usually sufficient. When
checking that a tool works requires running one assessment, use a clearly public example
DOI or URL and record it in the pull request. Record only what you observed.

Checklist:

- Every URL in the entry was opened and responded.
- The description in `summary` and `output` matches what the resource states.
- `targets`, `mode` and `inputs` match what the resource accepts.
- `status` and `status_note` reflect what was observed.
- `last_verified` is the date of the check.
- `npm run validate` passes and `npm run links -- --only <id>` shows no unexpected problem.

A 200 response does not confirm that a tool works. The link report says so, and
`last_verified` is only updated after a person has confirmed the entry.

## Maintenance

A weekly workflow runs `npm run links` and opens or updates one issue labelled
`link-check` when the report has findings. Maintainers re-verify every entry each
quarter: open each resource, confirm or correct the entry, and bump `last_verified` by
hand. Tools not verified within `verification.staleAfterDays` in `content/site.yaml`
appear in the report and are shown as not re-verified on the site.
