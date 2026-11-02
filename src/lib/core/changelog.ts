import type { Content } from './content.ts';
import type { Locale } from './labels.ts';

export type ChangelogEntryView = {
	text: string;
	/** Tools the entry refers to, in the order of the file. */
	tools: { id: string; name: string }[];
};

export type ChangelogDay = { date: string; entries: ChangelogEntryView[] };

export type ChangelogView = {
	/** One item per date, newest first. Entries of the same date keep the order of the file. */
	days: ChangelogDay[];
};

/** Groups the changelog by date for a locale. Tool names fall back to the id when unknown. */
export function buildChangelogView(content: Content, locale: Locale): ChangelogView {
	const names = new Map(content.tools.map((tool) => [tool.id, tool.name]));
	const days: ChangelogDay[] = [];
	for (const entry of content.changelog) {
		let day = days.find((item) => item.date === entry.date);
		if (!day) {
			day = { date: entry.date, entries: [] };
			days.push(day);
		}
		day.entries.push({
			text: entry.text[locale],
			tools: (entry.tools ?? []).map((id) => ({ id, name: names.get(id) ?? id }))
		});
	}
	days.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
	return { days };
}

/** The date (YYYY-MM-DD) of the newest changelog entry. */
export function lastUpdated(content: Content): string {
	return content.changelog.reduce(
		(newest, entry) => (entry.date > newest ? entry.date : newest),
		''
	);
}
