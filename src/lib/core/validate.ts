import { parse } from 'yaml';
import { ContentError, loadContent, type LoadOptions } from './content.ts';
import { siteSchema } from './schema.ts';
import { lintContent, lintMessages, type StyleRules } from './style-lint.ts';

export type Problem = { file: string; path: string; message: string };

export type ValidationResult = {
	problems: Problem[];
	/** Number of tools when the content loaded, otherwise undefined. */
	toolCount: number | undefined;
};

/** Used for messages when site.yaml has no usable `style` block: only the dash rules. */
const FALLBACK_RULES: StyleRules = {
	forbiddenTerms: {},
	forbiddenCharacters: ['em_dash', 'en_dash'],
	voseoWords: [],
	informalWords: []
};

/** Reads the style rules from site.yaml alone, so messages can be linted when other files fail. */
function rulesFromSite(files: Record<string, string>): StyleRules {
	const raw = files['content/site.yaml'];
	if (raw === undefined) return FALLBACK_RULES;
	try {
		const result = siteSchema.shape.style.safeParse((parse(raw) as { style?: unknown })?.style);
		return result.success ? result.data : FALLBACK_RULES;
	} catch {
		return FALLBACK_RULES;
	}
}

/**
 * Validates content (`files`, keyed like `content/site.yaml`) and lints the UI message
 * catalogues (`{ locale: { key: text } }`). The two groups are independent: a broken content
 * set does not stop the messages from being linted, and both groups are reported together.
 */
export function validateProject(
	files: Record<string, string>,
	messages: Record<string, Record<string, unknown>>,
	options: LoadOptions = {}
): ValidationResult {
	const problems: Problem[] = [];
	let toolCount: number | undefined;
	let rules: StyleRules | undefined;

	try {
		const content = loadContent(files, options);
		toolCount = content.tools.length;
		rules = content.site.style;
		for (const v of lintContent(content)) {
			problems.push({ file: v.file, path: v.path, message: `style (${v.rule}): "${v.match}"` });
		}
	} catch (error) {
		if (!(error instanceof ContentError)) throw error;
		problems.push(...error.issues);
	}

	for (const v of lintMessages(messages, rules ?? rulesFromSite(files))) {
		problems.push({
			file: `messages/${v.locale}.json`,
			path: v.key,
			message: `style (${v.rule}): "${v.match}"`
		});
	}

	return { problems, toolCount };
}
