import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EM_DASH, loadFixtureFiles, mutate, without } from './__fixtures__/helpers';
import { validateProject } from './validate';

const valid = loadFixtureFiles();
const FUJI = 'content/tools/f-uji.yaml';
const SITE = 'content/site.yaml';
const cleanMessages = { en: { a: 'Hello' }, es: { a: 'Hola' } };

describe('package.json scripts', () => {
	const pkg = JSON.parse(
		readFileSync(fileURLToPath(new URL('../../../package.json', import.meta.url)), 'utf8')
	);

	it('prebuild runs the validation, so a build cannot skip the style lint', () => {
		expect(pkg.scripts.prebuild).toBe('npm run validate');
	});

	it('no longer depends on zod-to-json-schema', () => {
		expect(pkg.dependencies?.['zod-to-json-schema']).toBeUndefined();
		expect(pkg.devDependencies?.['zod-to-json-schema']).toBeUndefined();
	});
});

describe('validateProject', () => {
	it('is clean for valid content and messages', () => {
		const result = validateProject(valid, cleanMessages);
		expect(result.problems).toEqual([]);
		expect(result.toolCount).toBe(4);
	});

	it('reports content style violations', () => {
		const files = mutate(valid, FUJI, (tool) => (tool.summary.en = 'The best checker.'));
		expect(validateProject(files, cleanMessages).problems).toContainEqual(
			expect.objectContaining({
				file: FUJI,
				path: 'summary.en',
				message: expect.stringContaining('best')
			})
		);
	});

	it('lints messages with the site rules when content loads', () => {
		const result = validateProject(valid, { en: { a: 'The best start' }, es: {} });
		expect(result.problems).toContainEqual(
			expect.objectContaining({ file: 'messages/en.json', path: 'a' })
		);
	});

	it('still lints messages when content fails to load, and reports both groups', () => {
		const broken = mutate(valid, FUJI, (tool) => delete tool.url);
		const result = validateProject(broken, {
			en: { a: `x ${EM_DASH} y` },
			es: { b: 'Si tenés dudas' }
		});
		expect(result.toolCount).toBeUndefined();
		expect(result.problems).toContainEqual(expect.objectContaining({ file: FUJI, path: 'url' }));
		expect(result.problems).toContainEqual(
			expect.objectContaining({ file: 'messages/en.json', path: 'a' })
		);
		// The word lists still come from site.yaml when only another file is broken.
		expect(result.problems).toContainEqual(
			expect.objectContaining({ file: 'messages/es.json', path: 'b' })
		);
	});

	it('falls back to the dash rules when site.yaml itself is unusable', () => {
		const result = validateProject(without(valid, SITE), { en: { a: `x ${EM_DASH} y` }, es: {} });
		expect(result.problems).toContainEqual(expect.objectContaining({ file: SITE }));
		expect(result.problems).toContainEqual(
			expect.objectContaining({ file: 'messages/en.json', path: 'a' })
		);
	});

	it('lints messages even when there is no content at all', () => {
		const result = validateProject({}, { en: { a: `x ${EM_DASH} y` }, es: {} });
		expect(result.problems.some((p) => p.file === 'content/site.yaml')).toBe(true);
		expect(result.problems.some((p) => p.file === 'messages/en.json')).toBe(true);
	});
});
