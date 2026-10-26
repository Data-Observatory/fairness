import { describe, expect, it } from 'vitest';
import { loadContent } from './content';
import { loadFixtureFiles, mutate } from './__fixtures__/helpers';
import { buildHomeView, buildWizardView } from './view';
import { matchingToolIds, wizardConfigOf } from './wizard';

// The wizard view model: localized questions and options, tool fields for matching, home order.

const FIXTURE_TODAY = new Date(2025, 5, 1);

const fixture = (edit: (files: Record<string, string>) => Record<string, string> = (f) => f) =>
	loadContent(edit(loadFixtureFiles()), { today: FIXTURE_TODAY });

const question = (view: ReturnType<typeof buildWizardView>, id: string) => {
	const found = view.questions.find((item) => item.id === id);
	if (!found) throw new Error(`no question ${id}`);
	return found;
};
const tool = (view: ReturnType<typeof buildWizardView>, id: string) => {
	const found = view.tools.find((item) => item.id === id);
	if (!found) throw new Error(`no tool ${id}`);
	return found;
};

describe('buildWizardView: texts', () => {
	it('takes site name and caveats in each locale', () => {
		const content = fixture();
		const en = buildWizardView(content, 'en', FIXTURE_TODAY);
		const es = buildWizardView(content, 'es', FIXTURE_TODAY);
		expect(en.siteName).toBe('FAIR Resources Finder');
		expect(es.siteName).toBe('Buscador de recursos FAIR');
		expect(en.caveats).toEqual(content.caveats.map((item) => item.text.en));
		expect(es.caveats).toEqual(content.caveats.map((item) => item.text.es));
	});

	it('keeps the questions in the order of the content, localized, with optional help', () => {
		const content = fixture();
		const en = buildWizardView(content, 'en', FIXTURE_TODAY);
		const es = buildWizardView(content, 'es', FIXTURE_TODAY);
		expect(en.questions.map((item) => item.id)).toEqual([
			'target',
			'input',
			'mode',
			'framework',
			'api',
			'self_hostable'
		]);
		expect(question(en, 'target').question).toBe('What do you want to assess?');
		expect(question(es, 'target').question).toBe('¿Qué desea evaluar?');
		expect(question(en, 'target').help).toBe('Choose the type of object.');
		expect(question(es, 'target').help).toBe('Elija el tipo de objeto.');
		expect(question(en, 'input').help).toBeUndefined();
	});

	it('exposes the levels as question ids', () => {
		const view = buildWizardView(fixture(), 'en', FIXTURE_TODAY);
		expect(view.levels).toEqual({
			simple: ['target', 'input'],
			advanced: ['target', 'input', 'mode', 'framework', 'api', 'self_hostable']
		});
	});
});

describe('buildWizardView: options', () => {
	it('lists every taxonomy option of the group, with localized label and description', () => {
		const content = fixture();
		const en = question(buildWizardView(content, 'en', FIXTURE_TODAY), 'mode');
		const es = question(buildWizardView(content, 'es', FIXTURE_TODAY), 'mode');
		expect(en.options.map((option) => option.id)).toEqual(['automated', 'manual', 'hybrid']);
		expect(en.options[0]).toMatchObject({ id: 'automated', label: 'Automated' });
		expect(es.options[0]).toMatchObject({ id: 'automated', label: 'Automático' });
		expect(en.options[0].description).toBeUndefined();
		expect(en.options[2].description).toBe('Automated checks plus manual answers');
		expect(es.options[2].description).toBe('Comprobaciones automáticas y respuestas manuales');
	});

	it('lists all options of a group even when no tool has them', () => {
		const view = buildWizardView(fixture(), 'en', FIXTURE_TODAY);
		expect(question(view, 'target').options.map((option) => option.id)).toEqual([
			'dataset',
			'ontology',
			'software',
			'repository',
			'any_digital_object',
			'person_knowledge'
		]);
	});

	it('gives api and self_hostable one "yes" option labelled with the option text', () => {
		const content = fixture();
		const en = buildWizardView(content, 'en', FIXTURE_TODAY);
		const es = buildWizardView(content, 'es', FIXTURE_TODAY);
		expect(question(en, 'api').options).toEqual([{ id: 'yes', label: 'Offers an API' }]);
		expect(question(es, 'api').options).toEqual([{ id: 'yes', label: 'Ofrece una API' }]);
		expect(question(en, 'self_hostable').options).toEqual([
			{ id: 'yes', label: 'Can be self-hosted' }
		]);
	});
});

describe('buildWizardView: tools', () => {
	it('lists every tool in the home order (sections order, then tool order)', () => {
		const content = fixture();
		const home = buildHomeView(content, 'en', FIXTURE_TODAY)
			.sections.flatMap((section) => section.tools)
			.map((card) => card.id);
		const view = buildWizardView(content, 'en', FIXTURE_TODAY);
		expect(view.tools.map((item) => item.id)).toEqual(home);
		expect(home).toHaveLength(content.tools.length);
	});

	it('keeps the card data of the home page', () => {
		const content = fixture();
		const card = buildHomeView(content, 'es', FIXTURE_TODAY)
			.sections.flatMap((section) => section.tools)
			.find((item) => item.id === 'f-uji');
		const { fields, ...rest } = tool(buildWizardView(content, 'es', FIXTURE_TODAY), 'f-uji');
		expect(rest).toEqual(card);
		expect(fields).toBeDefined();
	});

	it('holds the taxonomy ids of each tool per question id', () => {
		const view = buildWizardView(fixture(), 'en', FIXTURE_TODAY);
		expect(tool(view, 'f-uji').fields).toMatchObject({
			target: ['dataset'],
			input: ['doi', 'landing_page_url'],
			mode: ['automated'],
			framework: ['fairsfair_metrics']
		});
		expect(tool(view, 'fair-enough').fields).toMatchObject({
			target: ['dataset', 'software'],
			input: ['doi', 'metadata_url'],
			mode: ['automated'],
			framework: []
		});
	});

	it('gives empty lists for the fields a framework or directory does not have', () => {
		const view = buildWizardView(fixture(), 'en', FIXTURE_TODAY);
		expect(tool(view, 'fair-catalogue').fields).toMatchObject({
			target: [],
			input: [],
			mode: [],
			api: [],
			self_hostable: []
		});
	});

	it('writes yes for api and self_hostable only when the value is true', () => {
		const view = buildWizardView(fixture(), 'en', FIXTURE_TODAY);
		expect(tool(view, 'f-uji').fields.api).toEqual(['yes']);
		expect(tool(view, 'f-uji').fields.self_hostable).toEqual(['yes']);
		// unknown
		expect(tool(view, 'fair-enough').fields.api).toEqual([]);
		expect(tool(view, 'fair-enough').fields.self_hostable).toEqual([]);

		const content = fixture((files) =>
			mutate(files, 'content/tools/fair-enough.yaml', (doc) => {
				doc.api = { available: false };
				doc.self_hostable = false;
			})
		);
		const edited = buildWizardView(content, 'en', FIXTURE_TODAY);
		expect(tool(edited, 'fair-enough').fields.api).toEqual([]);
		expect(tool(edited, 'fair-enough').fields.self_hostable).toEqual([]);
	});
});

describe('wizardConfigOf', () => {
	it('builds the matching config from the view', () => {
		const view = buildWizardView(fixture(), 'en', FIXTURE_TODAY);
		const config = wizardConfigOf(view);
		expect(config.levels).toEqual(view.levels);
		expect(config.options.mode).toEqual(['automated', 'manual', 'hybrid']);
		expect(config.options.api).toEqual(['yes']);
	});

	it('works with the matching logic on the view tools', () => {
		const view = buildWizardView(fixture(), 'en', FIXTURE_TODAY);
		expect(matchingToolIds(view.tools, { target: ['dataset'] })).toEqual(['f-uji', 'fair-enough']);
		expect(matchingToolIds(view.tools, { target: ['dataset'], api: ['yes'] })).toEqual(['f-uji']);
		expect(matchingToolIds(view.tools, { input: ['doi'] })).toEqual(['f-uji', 'fair-enough']);
	});
});
