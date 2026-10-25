import type { Content } from './content.ts';

export type StyleRules = {
	/** Judgment words per locale (whole word, case-insensitive). */
	forbiddenTerms: Record<string, string[]>;
	/** Names of forbidden characters: `em_dash`, `en_dash`. */
	forbiddenCharacters: readonly string[];
	/** Spanish voseo forms (whole word, case-insensitive). */
	voseoWords: readonly string[];
	/** Spanish informal second person forms (whole word, case-insensitive). */
	informalWords: readonly string[];
};

export type Rule =
	'forbidden-character' | 'emoji' | 'emoticon' | 'forbidden-term' | 'voseo' | 'informal';
export type Match = { rule: Rule; match: string };
export type Violation = Match & { file: string; path: string };
export type MessageViolation = Match & { locale: string; key: string };

// Built from code points so this source file contains no dash characters.
const CHARACTERS: Record<string, string> = {
	em_dash: String.fromCharCode(0x2014),
	en_dash: String.fromCharCode(0x2013)
};

// U+00A9 (copyright) and U+00AE (registered) are Extended_Pictographic but are ordinary text
// symbols, so they are exempt. A pair of regional indicators is a flag emoji.
const EMOJI = /(?![\u00A9\u00AE])\p{Extended_Pictographic}|\p{Regional_Indicator}{2}/gu;
const EMOTICON = /(?<![\p{L}\p{N}])(?::-?[)(D]|;-?\))(?![\p{L}\p{N}])/gu;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function wholeWords(words: readonly string[]): RegExp | undefined {
	if (words.length === 0) return undefined;
	const alternatives = words.map((word) => escapeRegExp(word.normalize('NFC'))).join('|');
	return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternatives})(?![\\p{L}\\p{N}_])`, 'giu');
}

type Found = Match & { index: number };

function collect(text: string, pattern: RegExp | undefined, rule: Rule, into: Found[]): void {
	if (!pattern) return;
	for (const found of text.matchAll(pattern)) {
		into.push({ rule, match: found[0], index: found.index });
	}
}

/**
 * Lints one string. `locale` is null for strings that are not localized (names, URLs),
 * which get the locale independent rules only. Matches are returned in order of appearance.
 */
export function lintText(input: string, locale: string | null, rules: StyleRules): Match[] {
	// NFC, so a decomposed "u" plus combining acute matches the precomposed word lists.
	const text = input.normalize('NFC');
	const found: Found[] = [];

	const characters = rules.forbiddenCharacters
		.map((name) => CHARACTERS[name])
		.filter((character): character is string => character !== undefined);
	collect(text, wholeSet(characters), 'forbidden-character', found);
	collect(text, EMOJI, 'emoji', found);
	collect(text, EMOTICON, 'emoticon', found);

	if (locale !== null) {
		collect(text, wholeWords(rules.forbiddenTerms[locale] ?? []), 'forbidden-term', found);
		if (locale === 'es') {
			collect(text, wholeWords(rules.voseoWords), 'voseo', found);
			collect(text, wholeWords(rules.informalWords), 'informal', found);
		}
	}

	return found.sort((a, b) => a.index - b.index).map(({ rule, match }) => ({ rule, match }));
}

function wholeSet(characters: string[]): RegExp | undefined {
	if (characters.length === 0) return undefined;
	return new RegExp(characters.map(escapeRegExp).join('|'), 'gu');
}

type Walker = (path: string, text: string, locale: string | null) => void;

function walk(value: unknown, path: string[], locales: readonly string[], visit: Walker): void {
	if (typeof value === 'string') {
		const last = path[path.length - 1];
		const locale = last !== undefined && locales.includes(last) ? last : null;
		visit(path.join('.'), value, locale);
	} else if (Array.isArray(value)) {
		value.forEach((item, index) => walk(item, [...path, String(index)], locales, visit));
	} else if (value !== null && typeof value === 'object') {
		for (const [key, item] of Object.entries(value)) walk(item, [...path, key], locales, visit);
	}
}

/**
 * Lints every string in the content with the rules from `site.yaml`. The `style` block of
 * `site.yaml` is skipped, since it lists the forbidden words themselves.
 */
export function lintContent(content: Content): Violation[] {
	const rules = content.site.style;
	const locales = content.site.locales;
	const violations: Violation[] = [];

	const lintFile = (file: string, value: unknown) => {
		walk(value, [], locales, (path, text, locale) => {
			for (const match of lintText(text, locale, rules)) violations.push({ file, path, ...match });
		});
	};

	const site = Object.fromEntries(Object.entries(content.site).filter(([key]) => key !== 'style'));
	lintFile('content/site.yaml', site);
	lintFile('content/taxonomy.yaml', content.taxonomy);
	lintFile('content/sections.yaml', content.sections);
	lintFile('content/finder.yaml', content.finder);
	lintFile('content/caveats.yaml', content.caveats);
	for (const tool of content.tools) lintFile(`content/tools/${tool.id}.yaml`, tool);
	return violations;
}

/** Lints UI message catalogues, `{ locale: { key: text } }`. Non-string values are skipped. */
export function lintMessages(
	catalogue: Record<string, Record<string, unknown>>,
	rules: StyleRules
): MessageViolation[] {
	const violations: MessageViolation[] = [];
	for (const [locale, messages] of Object.entries(catalogue)) {
		for (const [key, value] of Object.entries(messages)) {
			if (typeof value !== 'string') continue;
			for (const match of lintText(value, locale, rules))
				violations.push({ locale, key, ...match });
		}
	}
	return violations;
}
