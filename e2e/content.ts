import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

// Reads the real content/ directory straight from disk with the yaml package. App code is not
// imported because it relies on Vite globs, which do not exist inside Playwright.

const root = join(process.cwd(), 'content');
const read = (...parts: string[]) => parse(readFileSync(join(root, ...parts), 'utf8'));

export type Tool = {
	id: string;
	kind: 'tool' | 'framework' | 'directory';
	section: string;
	name: string;
	url: string;
	best_for?: { en: string; es: string };
	operator: { name: string; url?: string };
	summary: { en: string; es: string };
	targets?: string[];
	mode?: string;
	inputs?: string[];
	frameworks?: string[];
	output?: { en: string; es: string };
	api?: { available: boolean; url?: string };
	source_code?: string;
	self_hostable?: boolean;
	license?: string;
	status: string;
	last_verified: string | Date;
};

export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];

/** Every tool file except the template (file names starting with an underscore). */
export function loadTools(): Tool[] {
	return readdirSync(join(root, 'tools'))
		.filter((name) => name.endsWith('.yaml') && !name.startsWith('_'))
		.sort()
		.map((name) => {
			const tool = read('tools', name) as Tool;
			if (`${tool.id}.yaml` !== name) throw new Error(`${name}: id does not match file name`);
			// The yaml package keeps ISO dates as strings (core schema), but be explicit.
			if (tool.last_verified instanceof Date) {
				tool.last_verified = tool.last_verified.toISOString().slice(0, 10);
			}
			return tool;
		});
}

export const loadSite = () =>
	read('site.yaml') as {
		name: { en: string; es: string };
		shortName?: { en: string; es: string };
		repository: string;
		contributeUrl: string;
		features: { bestFor: boolean; finderTable: boolean; statusFilter: boolean; wizard: boolean };
	};

export const loadSections = () => read('sections.yaml') as { id: string; collapsed?: boolean }[];

export const loadTaxonomy = () =>
	read('taxonomy.yaml') as { filters: string[] } & Record<string, { id: string }[] | string[]>;

export const loadFinder = () =>
	read('finder.yaml') as { rows: { input: string; tools: string[] }[] };

// Guided finder (content/wizard.yaml). It is read lazily, inside tests, so that collecting the
// specs does not depend on the file.

export type Localized = { en: string; es: string };

export type WizardQuestion = {
	id: string;
	question: Localized;
	help?: Localized;
	option?: Localized;
};

export type Wizard = {
	questions: WizardQuestion[];
	levels: { simple: string[]; advanced: string[] };
};

export const loadWizard = () => read('wizard.yaml') as Wizard;

/** Questions that are not taxonomy groups: a tool fact with the single option "yes". */
export const BOOLEAN_QUESTIONS = ['api', 'self_hostable'];

/** Option id of the single option of a boolean question. */
export const YES = 'yes';

/** Option ids of a question in display order: taxonomy ids, or the single "yes" option. */
export function optionIds(questionId: string): string[] {
	if (BOOLEAN_QUESTIONS.includes(questionId)) return [YES];
	const group = loadTaxonomy()[questionId] as { id: string }[] | undefined;
	if (!group) throw new Error(`wizard question ${questionId} is not a taxonomy group`);
	return group.map((option) => option.id);
}

/** Taxonomy label of an option in a locale (the boolean questions use their own `option`). */
export function optionLabel(questionId: string, optionId: string, locale: Locale): string {
	if (BOOLEAN_QUESTIONS.includes(questionId)) {
		return loadWizard().questions.find((item) => item.id === questionId)!.option![locale];
	}
	const group = loadTaxonomy()[questionId] as unknown as { id: string; label: Localized }[];
	return group.find((option) => option.id === optionId)!.label[locale];
}

/** Values a tool records for a wizard question (nothing recorded gives an empty list). */
export function toolValues(tool: Tool, questionId: string): string[] {
	switch (questionId) {
		case 'target':
			return tool.targets ?? [];
		case 'mode':
			return tool.mode === undefined ? [] : [tool.mode];
		case 'input':
			return tool.inputs ?? [];
		case 'framework':
			return tool.frameworks ?? [];
		case 'status':
			return [tool.status];
		case 'api':
			return tool.api?.available === true ? [YES] : [];
		case 'self_hostable':
			return tool.self_hostable === true ? [YES] : [];
		default:
			throw new Error(`unknown wizard question ${questionId}`);
	}
}

export type Answers = Record<string, string[]>;

/** Tools in home order: sections order, then tool id order within a section. */
export function homeOrder(tools: Tool[] = loadTools()): Tool[] {
	const order = loadSections().map((item) => item.id);
	return [...tools].sort(
		(a, b) =>
			order.indexOf(a.section) - order.indexOf(b.section) ||
			(a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
	);
}

/**
 * Matching rule of the spec: OR within a question, AND across questions. A tool with no recorded
 * value for an answered question never matches.
 */
export function wizardMatches(answers: Answers): Tool[] {
	return homeOrder().filter((tool) =>
		Object.entries(answers).every(([id, wanted]) => {
			if (wanted.length === 0) return true;
			return toolValues(tool, id).some((value) => wanted.includes(value));
		})
	);
}

/** Number of tools an option would match given the other answers (its own question ignored). */
export const optionCount = (answers: Answers, questionId: string, optionId: string): number =>
	wizardMatches({ ...answers, [questionId]: [optionId] }).length;
