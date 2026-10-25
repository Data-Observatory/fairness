import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import es from '../../../messages/es.json';

// UI strings live in messages/{en,es}.json. Site name and home title come from content/site.yaml,
// so they must not be duplicated here, and no message may sit unused.

const keysOf = (messages: Record<string, unknown>) =>
	Object.keys(messages)
		.filter((key) => !key.startsWith('$'))
		.sort();

const SRC = join(process.cwd(), 'src');

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) return name === 'paraglide' ? [] : sourceFiles(full);
		return /\.(svelte|ts|js)$/.test(name) && !/\.test\.(ts|js)$/.test(name) ? [full] : [];
	});
}

describe('messages: keys', () => {
	it('en and es have identical key sets', () => {
		expect(keysOf(es)).toEqual(keysOf(en));
	});

	it.each(['site_name', 'home_title'])('%s does not exist in en or es', (key) => {
		expect(keysOf(en)).not.toContain(key);
		expect(keysOf(es)).not.toContain(key);
	});

	it('every key in messages/en.json is used as m.<key>( somewhere under src/', () => {
		const sources = sourceFiles(SRC).map((file) => readFileSync(file, 'utf8'));
		const unused = keysOf(en).filter(
			(key) => !sources.some((text) => new RegExp(`\\bm\\.${key}\\(`).test(text))
		);
		expect(unused).toEqual([]);
	});
});
