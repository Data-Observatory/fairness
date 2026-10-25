import { expect, test } from '@playwright/test';
import { LOCALES, loadTools, type Tool } from './content';

// Review defects: the detail page showed only the host of the destination, and the facts list
// must show every non-empty YAML field.

const tools = loadTools();

const LABELS = {
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

const present = (value: unknown) =>
	value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0);

function expectedKeys(tool: Tool): (keyof typeof LABELS.en)[] {
	const keys = Object.keys(LABELS.en) as (keyof typeof LABELS.en)[];
	return keys.filter((key) => present((tool as unknown as Record<string, unknown>)[key]));
}

for (const locale of LOCALES) {
	test.describe(`detail page /${locale}`, () => {
		for (const tool of tools) {
			test(`${tool.id} shows the complete destination URL as text next to the open button`, async ({
				page
			}) => {
				await page.goto(`/${locale}/tools/${tool.id}`);
				const container = page
					.locator('[data-testid=open-tool]')
					.locator('xpath=ancestor::*[self::p or self::div][1]');
				await expect(container.getByText(tool.url, { exact: true })).toBeVisible();
			});

			test(`${tool.id} lists every non-empty field in the facts list`, async ({ page }) => {
				await page.goto(`/${locale}/tools/${tool.id}`);
				const labels = await page
					.locator('dl[data-testid=tool-facts] dt')
					.evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? ''));
				const expected = expectedKeys(tool).map((key) => LABELS[locale][key]);
				expect(labels.sort()).toEqual([...expected].sort());
			});
		}

		test('f-uji lists operator, mode, inputs, output and license', async ({ page }) => {
			await page.goto(`/${locale}/tools/f-uji`);
			const labels = page.locator('dl[data-testid=tool-facts] dt');
			for (const key of ['operator', 'mode', 'inputs', 'output', 'license'] as const) {
				await expect(labels.filter({ hasText: LABELS[locale][key] }).first()).toBeVisible();
			}
		});
	});
}
