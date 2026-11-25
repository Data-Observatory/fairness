// Writes refreshed numbers back into the text of a tool file. Only the scalar values named by the
// changes are replaced (or, for a new release, a short block is inserted): every other byte of
// the file, comments and quoting included, stays as it was. The result is parsed again and compared
// with the old data plus the changes, so a wrong edit throws instead of being written.
import { isDeepStrictEqual } from 'node:util';
import { isMap, isScalar, parse, parseDocument, stringify } from 'yaml';
import type { Change } from './metrics-refresh.ts';

type Edit = { start: number; end: number; text: string };

const label = (path: (string | number)[]) => path.join('.');

/** A value as it is written in the file, in the style of the scalar it replaces. */
function render(value: string | number, style: string | undefined): string {
	if (typeof value === 'number') return String(value);
	if (style === 'QUOTE_DOUBLE') return JSON.stringify(value);
	if (style === 'QUOTE_SINGLE') return `'${value.replace(/'/g, "''")}'`;
	// Plain, unless the plain form would be read back as something other than this string.
	return stringify(value).trimEnd();
}

function setIn(root: unknown, path: (string | number)[], value: unknown): void {
	let node = root as Record<string | number, unknown>;
	for (const key of path.slice(0, -1)) node = node[key] as Record<string | number, unknown>;
	node[path[path.length - 1]] = value;
}

export function applyMetricChanges(text: string, changes: Change[]): string {
	if (changes.length === 0) return text;
	const document = parseDocument(text);
	const newline = text.includes('\r\n') ? '\r\n' : '\n';
	const edits: Edit[] = [];

	for (const change of changes) {
		if (typeof change.current === 'object') {
			const { tag, date } = change.current;
			const parentPath = change.path.slice(0, -1);
			const parent = document.getIn(parentPath, true);
			if (!isMap(parent)) throw new Error(`${label(parentPath)} is not in the file`);
			if (parent.has(change.path[change.path.length - 1])) {
				throw new Error(`${label(change.path)} is already in the file`);
			}
			const pair = parent.items.find(
				(item) => isScalar(item.key) && item.key.value === 'last_push'
			);
			const key = pair?.key;
			const value = pair?.value;
			if (!isScalar(key) || !key.range || !isScalar(value) || !value.range) {
				throw new Error(`${label(parentPath)}.last_push is not in the file`);
			}
			const lineStart = text.lastIndexOf('\n', key.range[0] - 1) + 1;
			const indent = text.slice(lineStart, key.range[0]);
			let end = text.indexOf('\n', value.range[1]);
			if (end === -1) end = text.length;
			else if (text[end - 1] === '\r') end -= 1;
			edits.push({
				start: end,
				end,
				text:
					`${newline}${indent}last_release:` +
					`${newline}${indent}  tag: ${render(tag, undefined)}` +
					`${newline}${indent}  date: ${render(date, undefined)}`
			});
			continue;
		}
		const node = document.getIn(change.path, true);
		if (!isScalar(node) || !node.range) throw new Error(`${label(change.path)} is not in the file`);
		edits.push({
			start: node.range[0],
			end: node.range[1],
			text: render(change.current, node.type)
		});
	}

	let result = text;
	for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
		result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
	}

	const expected = parse(text);
	for (const change of changes) setIn(expected, change.path, change.current);
	if (!isDeepStrictEqual(parse(result), expected)) {
		throw new Error('the edited file does not match the expected data, nothing was changed');
	}
	return result;
}
