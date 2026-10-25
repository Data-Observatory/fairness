import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { generateToolSchema, serializeToolSchema } from './json-schema';

const committed = fileURLToPath(new URL('../../../content/tool.schema.json', import.meta.url));

type Json = Record<string, any>;
const schema = () => generateToolSchema() as Json;

describe('generated tool JSON schema', () => {
	it('matches the committed content/tool.schema.json (run npm run schema when this fails)', () => {
		expect(serializeToolSchema(generateToolSchema())).toBe(readFileSync(committed, 'utf8'));
	});

	it('is deterministic', () => {
		expect(serializeToolSchema(generateToolSchema())).toBe(
			serializeToolSchema(generateToolSchema())
		);
	});

	it('requires targets, mode, inputs and output when kind is tool (allOf if/then)', () => {
		const rules: Json[] = schema().allOf;
		expect(Array.isArray(rules)).toBe(true);
		const rule = rules.find((entry) => entry.if?.properties?.kind?.const === 'tool');
		expect(rule).toBeDefined();
		expect(rule!.if.required).toContain('kind');
		expect([...rule!.then.required].sort()).toEqual(['inputs', 'mode', 'output', 'targets']);
	});

	it('keeps targets, mode, inputs and output out of the unconditional required list', () => {
		const required: string[] = schema().required;
		for (const key of ['targets', 'mode', 'inputs', 'output']) expect(required).not.toContain(key);
	});

	it('url fields carry the ^https:// pattern', () => {
		const properties = schema().properties;
		expect(properties.url.pattern).toBe('^https://');
		expect(properties.operator.properties.url.pattern).toBe('^https://');
		expect(properties.api.properties.url.pattern).toBe('^https://');
		expect(properties.source_code.pattern).toBe('^https://');
		expect(properties.references.items.properties.url.pattern).toBe('^https://');
	});

	it('last_verified carries an ISO date pattern', () => {
		const pattern = schema().properties.last_verified.pattern as string;
		expect(typeof pattern).toBe('string');
		const regex = new RegExp(pattern);
		expect(regex.test('2026-10-25')).toBe(true);
		expect(regex.test('2026-1-5')).toBe(false);
		expect(regex.test('15/01/2026')).toBe(false);
		expect(regex.test('2026-10-25T00:00')).toBe(false);
	});
});
