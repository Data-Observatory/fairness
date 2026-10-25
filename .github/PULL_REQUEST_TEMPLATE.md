## Summary

<!-- What does this change add or update? -->

## Checklist

- [ ] I opened every URL in the entry by hand, and the resource responded as described.
- [ ] I did not submit data to any third-party tool while verifying.
- [ ] `last_verified` is set to the date I checked the resource.
- [ ] `status` reflects what I observed, and `status_note` gives the evidence when the status is not `available`.
- [ ] Both `en` and `es` are present. If I provide English only, `es` is marked `TODO` and a maintainer translates it before merge.
- [ ] Wording is neutral: no ranking, no judgment words, no comparison with other tools. `best_for` is one neutral sentence.
- [ ] No emoji, no em dashes and no en dashes.
- [ ] `npm run validate` passes.
- [ ] `npm run links -- --only <tool-id>` shows no unexpected problem for the new or changed file.
