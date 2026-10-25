// No imports: the browser can load these labels without the content pipeline.

export type Locale = 'en' | 'es';

/**
 * UI chrome words that are not part of the content files. Kept in one small object so they can
 * move to Paraglide messages later.
 */
export const FILTER_GROUP_LABELS: Record<Locale, Record<string, string>> = {
	en: {
		target: 'Assessed object',
		mode: 'Mode',
		input: 'Input',
		framework: 'Framework',
		status: 'Status'
	},
	es: {
		target: 'Objeto evaluado',
		mode: 'Modo',
		input: 'Entrada',
		framework: 'Marco',
		status: 'Estado'
	}
};

/** Labels of the definition list on the detail page, keyed by locale then fact key. */
export const FACT_LABELS: Record<Locale, Record<string, string>> = {
	en: {
		operator: 'Operator',
		targets: 'Assessed objects',
		mode: 'Mode',
		inputs: 'Inputs',
		frameworks: 'Frameworks',
		output: 'Output',
		api: 'API',
		source_code: 'Source code',
		self_hostable: 'Self-hostable',
		license: 'License',
		status: 'Status'
	},
	es: {
		operator: 'Operador',
		targets: 'Objetos evaluados',
		mode: 'Modo',
		inputs: 'Entradas',
		frameworks: 'Marcos',
		output: 'Resultado',
		api: 'API',
		source_code: 'Código fuente',
		self_hostable: 'Autoalojable',
		license: 'Licencia',
		status: 'Estado'
	}
};
