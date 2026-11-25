import { z } from 'zod';
import { METRICS_PARTS, toolSchema } from './schema.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

const URL_FIELDS = new Set(['url', 'source_code']);
const ISO_DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';

// zod's JSON schema export drops refinements, so these rules are added by hand.
function addUrlPatterns(node: unknown): void {
	if (Array.isArray(node)) {
		node.forEach(addUrlPatterns);
	} else if (node !== null && typeof node === 'object') {
		for (const [key, value] of Object.entries(node)) {
			if (URL_FIELDS.has(key) && value !== null && typeof value === 'object') {
				const field = value as Json;
				if (field.type === 'string') field.pattern = '^https://';
			}
			addUrlPatterns(value);
		}
	}
}

/**
 * The JSON schema for `content/tools/<id>.yaml`, used by editors. Built from the zod
 * `toolSchema` (zod's own `z.toJSONSchema`), then extended with what zod cannot express:
 * the tool-only fields required when `kind` is `tool` and not allowed when it is `guide`, an `https://` pattern on URL fields,
 * an ISO date pattern on `last_verified` and on the dates of `metrics`, and the rule that
 * `metrics` has at least one of its parts.
 */
export function generateToolSchema(): Json {
	const schema = z.toJSONSchema(toolSchema, { target: 'draft-7', io: 'input' }) as Json;

	addUrlPatterns(schema.properties);
	schema.properties.last_verified.pattern = ISO_DATE_PATTERN;

	// The metrics dates and the "at least one part" rule are refinements, which zod drops.
	const metrics = schema.properties.metrics;
	metrics.properties.checked.pattern = ISO_DATE_PATTERN;
	metrics.properties.github.properties.last_push.pattern = ISO_DATE_PATTERN;
	metrics.properties.github.properties.last_release.properties.date.pattern = ISO_DATE_PATTERN;
	metrics.anyOf = METRICS_PARTS.map((part) => ({ required: [part] }));

	schema.allOf = [
		{
			if: { properties: { kind: { const: 'tool' } }, required: ['kind'] },
			then: { required: ['targets', 'mode', 'inputs', 'output'] }
		},
		{
			if: { properties: { kind: { const: 'guide' } }, required: ['kind'] },
			then: {
				not: { anyOf: ['targets', 'mode', 'inputs', 'output'].map((key) => ({ required: [key] })) }
			}
		}
	];
	return schema;
}

/** The exact text committed to `content/tool.schema.json`. */
export function serializeToolSchema(schema: Json): string {
	return `${JSON.stringify(schema, null, '\t')}\n`;
}
