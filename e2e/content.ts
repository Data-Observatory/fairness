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
	targets?: string[];
	mode?: string;
	inputs?: string[];
	frameworks?: string[];
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
		contributeUrl: string;
		features: { bestFor: boolean; finderTable: boolean; statusFilter: boolean };
	};

export const loadSections = () => read('sections.yaml') as { id: string; collapsed?: boolean }[];

export const loadTaxonomy = () =>
	read('taxonomy.yaml') as { filters: string[] } & Record<string, { id: string }[] | string[]>;

export const loadFinder = () =>
	read('finder.yaml') as { rows: { input: string; tools: string[] }[] };
