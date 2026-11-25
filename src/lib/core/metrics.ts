import type { Locale } from './labels.ts';
import type { Metrics } from './schema.ts';

// Recorded numbers (citations, GitHub activity, downloads) turned into the plain facts of the
// detail page and the comparison. Type imports only, so the browser can load this file without
// the content pipeline. Nothing here ranks, scores or sorts: items keep the order of the YAML.

/** Fact keys of the metrics, in display order (after `license`, before `status`). */
export const METRIC_FACT_KEYS = ['citations', 'github', 'downloads'] as const;

export type MetricFactItem = { text: string; href?: string };
export type MetricFact = { key: (typeof METRIC_FACT_KEYS)[number]; items: MetricFactItem[] };

const SOURCE_NAMES = { zenodo: 'Zenodo', pypi: 'PyPI' } as const;

type Words = {
	star: [string, string];
	fork: [string, string];
	contributor: [string, string];
	download: [string, string];
	lastPush: string;
	latestRelease: string;
	on: string;
	periods: { total: string; last_30_days: string };
};

const WORDS: Record<Locale, Words> = {
	en: {
		star: ['star', 'stars'],
		fork: ['fork', 'forks'],
		contributor: ['contributor', 'contributors'],
		download: ['download', 'downloads'],
		lastPush: 'last push',
		latestRelease: 'latest release',
		on: 'on',
		periods: { total: 'total', last_30_days: 'last 30 days' }
	},
	es: {
		star: ['estrella', 'estrellas'],
		fork: ['fork', 'forks'],
		contributor: ['colaborador', 'colaboradores'],
		download: ['descarga', 'descargas'],
		lastPush: 'último push',
		latestRelease: 'última versión',
		on: 'en',
		periods: { total: 'total', last_30_days: 'últimos 30 días' }
	}
};

const formatter = (locale: Locale) => new Intl.NumberFormat(locale, { useGrouping: 'always' });

function counted(locale: Locale, value: number, forms: [string, string]): string {
	return `${formatter(locale).format(value)} ${value === 1 ? forms[0] : forms[1]}`;
}

/** The metric facts of an entry, only for the parts it records. Empty when there are no metrics. */
export function metricFacts(metrics: Metrics | undefined, locale: Locale): MetricFact[] {
	if (metrics === undefined) return [];
	const words = WORDS[locale];
	const number = formatter(locale);
	const facts: MetricFact[] = [];
	if (metrics.citations !== undefined) {
		facts.push({
			key: 'citations',
			items: metrics.citations.map((citation) => ({
				text: `${number.format(citation.count)} (${citation.label})`,
				href: `https://doi.org/${citation.doi}`
			}))
		});
	}
	if (metrics.github !== undefined) {
		const github = metrics.github;
		const items: MetricFactItem[] = [
			{ text: counted(locale, github.stars, words.star) },
			{ text: counted(locale, github.forks, words.fork) },
			{ text: counted(locale, github.contributors, words.contributor) },
			{ text: `${words.lastPush} ${github.last_push}` }
		];
		if (github.last_release !== undefined) {
			items.push({
				text: `${words.latestRelease} ${github.last_release.tag} (${github.last_release.date})`
			});
		}
		facts.push({ key: 'github', items });
	}
	if (metrics.downloads !== undefined) {
		facts.push({
			key: 'downloads',
			items: metrics.downloads.map((download) => ({
				text: `${counted(locale, download.count, words.download)} ${words.on} ${SOURCE_NAMES[download.source]} (${words.periods[download.period]})`
			}))
		});
	}
	return facts;
}

/** Names of the sources behind the recorded numbers, distinct, in a fixed order. */
export function metricsSources(metrics: Metrics): string[] {
	const names: string[] = [];
	if (metrics.citations !== undefined) names.push('OpenAlex');
	if (metrics.github !== undefined) names.push('GitHub');
	for (const download of metrics.downloads ?? []) names.push(SOURCE_NAMES[download.source]);
	return [...new Set(names)];
}

/** True when a comparison has a row for citations, GitHub activity or downloads. */
export function hasMetricRows(rows: readonly { key: string }[]): boolean {
	const keys: readonly string[] = METRIC_FACT_KEYS;
	return rows.some((row) => keys.includes(row.key));
}
