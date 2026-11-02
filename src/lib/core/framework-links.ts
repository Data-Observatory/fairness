import type { Content } from './content.ts';
import type { Tool } from './schema.ts';

/** Framework ids that name no specific framework, so they never link two entries. */
const GENERIC_FRAMEWORK_IDS: readonly string[] = ['custom', 'other'];

const specificIds = (tool: Tool): string[] =>
	(tool.frameworks ?? []).filter((id) => !GENERIC_FRAMEWORK_IDS.includes(id));

/** Entries in home order: sections in order, entries of a section in content order. */
function homeOrder(content: Content): Tool[] {
	return content.sections.flatMap((section) =>
		content.tools.filter((tool) => tool.section === section.id)
	);
}

function sharing(content: Content, kind: Tool['kind'], ids: string[]): Tool[] {
	if (ids.length === 0) return [];
	return homeOrder(content).filter(
		(tool) => tool.kind === kind && specificIds(tool).some((id) => ids.includes(id))
	);
}

/**
 * Entries of kind `tool` that share a framework id with the framework entry `frameworkEntryId`.
 * Empty for an unknown id or an id that is not of kind `framework`. The ids `custom` and `other`
 * are ignored.
 */
export function implementedBy(content: Content, frameworkEntryId: string): Tool[] {
	const entry = content.tools.find((tool) => tool.id === frameworkEntryId);
	if (entry === undefined || entry.kind !== 'framework') return [];
	return sharing(content, 'tool', specificIds(entry));
}

/**
 * Entries of kind `framework` that share a framework id with the tool `toolId`. Empty for an
 * unknown id or an id that is not of kind `tool`. The ids `custom` and `other` are ignored.
 */
export function implementsFrameworks(content: Content, toolId: string): Tool[] {
	const tool = content.tools.find((item) => item.id === toolId);
	if (tool === undefined || tool.kind !== 'tool') return [];
	return sharing(content, 'framework', specificIds(tool));
}
