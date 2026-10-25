import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import { ContentError, loadContent } from '../content';

const here = dirname(fileURLToPath(import.meta.url));

// Dash characters are built at runtime so no test or fixture file contains them.
export const EM_DASH = String.fromCharCode(0x2014);
export const EN_DASH = String.fromCharCode(0x2013);

export type Files = Record<string, string>;
export type Issue = { file: string; path: string; message: string };

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const full = join(dir, name);
		return statSync(full).isDirectory() ? walk(full) : [full];
	});
}

/** The minimal valid content set, keyed like `content/site.yaml`, `content/tools/f-uji.yaml`. */
export function loadFixtureFiles(): Files {
	const root = join(here, 'valid');
	const files: Files = {};
	for (const full of walk(root)) {
		files[relative(root, full).split(sep).join('/')] = readFileSync(full, 'utf8');
	}
	return files;
}

/** Returns a copy of `files` where the YAML document at `path` was edited by `edit`. */
export function mutate(files: Files, path: string, edit: (doc: any) => void): Files {
	if (!(path in files)) throw new Error(`fixture has no file ${path}`);
	const doc = parse(files[path]);
	edit(doc);
	return { ...files, [path]: stringify(doc) };
}

/** Returns a copy of `files` without `path`. */
export function without(files: Files, path: string): Files {
	const copy = { ...files };
	delete copy[path];
	return copy;
}

/** Runs loadContent and returns the issues of the ContentError it must throw. */
export function issuesOf(files: Files): Issue[] {
	try {
		loadContent(files);
	} catch (error) {
		if (error instanceof ContentError) return error.issues;
		throw error;
	}
	throw new Error('expected loadContent to throw a ContentError');
}
