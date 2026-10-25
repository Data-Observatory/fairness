import { z } from 'zod';

/** Returns true when `value` is an ISO calendar date (YYYY-MM-DD) that exists. */
export function isIsoDate(value: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return false;
	const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
	const date = new Date(Date.UTC(year, month - 1, day));
	return (
		date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
	);
}

/** A non-empty string with at least one non-whitespace character (whitespace-only is rejected). */
const text = z.string().regex(/\S/, { message: 'must not be empty or whitespace only' });

/**
 * A localized string. v1 hardcodes the locales `en` and `es` here: both are always required by
 * the schemas. The locales declared in `site.yaml` are checked in `content.ts` (undeclared
 * locales rejected, declared ones required), so a third locale needs a change in this file too.
 */
export const localized = z.object({ en: text, es: text }).catchall(text);
export type Localized = z.infer<typeof localized>;

// `https://` followed by a host. `https:foo` and `https:/foo` parse as valid URLs, so they are
// rejected by the pattern, not by the URL parser.
const HTTPS_WITH_HOST = /^https:\/\/[^\s/?#]+/;

const httpsUrl = z.string().refine(
	(value) => {
		if (!HTTPS_WITH_HOST.test(value)) return false;
		try {
			const url = new URL(value);
			return url.protocol === 'https:' && url.hostname !== '';
		} catch {
			return false;
		}
	},
	{ message: 'URL must be absolute and use https:// followed by a host' }
);

const kebabId = z
	.string()
	.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'id must be kebab-case (a-z, 0-9, hyphens)' });

const taxonomyId = z
	.string()
	.regex(/^[a-z0-9][a-z0-9_-]*$/, { message: 'id must use a-z, 0-9, underscores or hyphens' });

const isoDate = z.string().refine(isIsoDate, { message: 'must be an ISO date (YYYY-MM-DD)' });

export const FORBIDDEN_CHARACTER_NAMES = ['em_dash', 'en_dash'] as const;

/* site.yaml */

export const siteSchema = z.strictObject({
	name: localized,
	shortName: localized.optional(),
	tagline: localized,
	domain: text,
	repository: httpsUrl,
	contributeUrl: httpsUrl,
	contactEmail: text.optional(),
	locales: z.array(text).min(1),
	defaultLocale: text,
	features: z.strictObject({
		bestFor: z.boolean(),
		finderTable: z.boolean(),
		statusFilter: z.boolean()
	}),
	verification: z.strictObject({
		staleAfterDays: z.number().int().positive()
	}),
	style: z.strictObject({
		forbiddenTerms: z.record(z.string(), z.array(text)),
		voseoWords: z.array(text),
		informalWords: z.array(text),
		forbiddenCharacters: z.array(z.enum(FORBIDDEN_CHARACTER_NAMES))
	})
});
export type Site = z.infer<typeof siteSchema>;

/* taxonomy.yaml */

export const TAXONOMY_GROUPS = ['target', 'mode', 'input', 'framework', 'status'] as const;
export type TaxonomyGroup = (typeof TAXONOMY_GROUPS)[number];

const taxonomyValue = z.strictObject({
	id: taxonomyId,
	label: localized,
	description: localized.optional()
});
export type TaxonomyValue = z.infer<typeof taxonomyValue>;

export const taxonomySchema = z.strictObject({
	filters: z.array(text),
	target: z.array(taxonomyValue),
	mode: z.array(taxonomyValue),
	input: z.array(taxonomyValue),
	framework: z.array(taxonomyValue),
	status: z.array(taxonomyValue)
});
export type Taxonomy = z.infer<typeof taxonomySchema>;

/* sections.yaml */

export const sectionsSchema = z.array(
	z.strictObject({
		id: kebabId,
		title: localized,
		intro: localized.optional(),
		collapsed: z.boolean().optional()
	})
);
export type Sections = z.infer<typeof sectionsSchema>;
export type Section = Sections[number];

/* finder.yaml */

export const finderSchema = z.strictObject({
	rows: z.array(
		z.strictObject({
			input: text,
			note: localized.optional(),
			tools: z.array(text).min(1)
		})
	)
});
export type Finder = z.infer<typeof finderSchema>;

/* caveats.yaml */

export const caveatsSchema = z.array(z.strictObject({ id: text, text: localized }));
export type Caveats = z.infer<typeof caveatsSchema>;

/* tools/<id>.yaml */

export const TOOL_KINDS = ['tool', 'framework', 'directory'] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];

const TOOL_ONLY_FIELDS = ['targets', 'mode', 'inputs', 'output'] as const;

export const toolSchema = z
	.strictObject({
		id: kebabId,
		kind: z.enum(TOOL_KINDS),
		section: text,
		name: text,
		url: httpsUrl,
		operator: z.strictObject({ name: text, url: httpsUrl.optional() }),
		summary: localized,
		best_for: localized.optional(),
		targets: z.array(text).optional(),
		mode: text.optional(),
		inputs: z.array(text).optional(),
		frameworks: z.array(text).optional(),
		output: localized.optional(),
		api: z.strictObject({ available: z.boolean(), url: httpsUrl.optional() }).optional(),
		source_code: httpsUrl.optional(),
		self_hostable: z.boolean().optional(),
		license: text.optional(),
		status: text,
		status_note: localized.optional(),
		last_verified: isoDate,
		references: z.array(z.strictObject({ title: text, url: httpsUrl })).optional()
	})
	.superRefine((tool, ctx) => {
		if (tool.kind === 'tool') {
			for (const key of TOOL_ONLY_FIELDS) {
				if (tool[key] === undefined) {
					ctx.addIssue({
						code: 'custom',
						path: [key],
						message: `Required when kind is "tool"`
					});
				}
			}
		}

		// Specs 7.2: a status other than available must carry its evidence.
		const needsNote = tool.status === 'limited' || tool.status === 'unverified';
		const discontinued = tool.status === 'discontinued';
		if ((needsNote || discontinued) && tool.status_note === undefined) {
			ctx.addIssue({
				code: 'custom',
				path: ['status_note'],
				message: `Required when status is "${tool.status}"`
			});
		}
		if (discontinued && (tool.references === undefined || tool.references.length === 0)) {
			ctx.addIssue({
				code: 'custom',
				path: ['references'],
				message: 'At least one reference is required when status is "discontinued"'
			});
		}
	});
export type Tool = z.infer<typeof toolSchema>;
