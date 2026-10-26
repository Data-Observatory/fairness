import { describe, expect, it } from 'vitest';
import { loadContent } from './content';
import { siteSchema, wizardSchema } from './schema';
import { issuesOf, loadFixtureFiles, mutate, without, type Files } from './__fixtures__/helpers';
import { parse } from 'yaml';

// content/wizard.yaml: schema and cross-checks (specs 5.7).

const WIZARD = 'content/wizard.yaml';
const valid = loadFixtureFiles();
const wizardDoc = () => parse(valid[WIZARD]);
const edit = (change: (doc: any) => void): Files => mutate(valid, WIZARD, change);
const messages = (files: Files) =>
	issuesOf(files).map((issue) => `${issue.path}: ${issue.message}`);

describe('wizard.yaml: schema', () => {
	it('the fixture parses', () => {
		expect(wizardSchema.safeParse(wizardDoc()).success).toBe(true);
	});

	it('loadContent exposes it as content.wizard', () => {
		const content = loadContent(valid, { today: new Date(2025, 5, 1) });
		expect(content.wizard.levels.simple).toEqual(['target', 'input']);
		expect(content.wizard.questions.map((question) => question.id)).toEqual([
			'target',
			'input',
			'mode',
			'framework',
			'api',
			'self_hostable'
		]);
	});

	it('rejects unknown keys', () => {
		const doc = wizardDoc();
		doc.extra = true;
		expect(wizardSchema.safeParse(doc).success).toBe(false);
	});

	it('rejects a question id that is not a taxonomy group, api or self_hostable', () => {
		const doc = wizardDoc();
		doc.questions[0].id = 'color';
		expect(wizardSchema.safeParse(doc).success).toBe(false);
	});

	it('requires en and es on the question text', () => {
		const doc = wizardDoc();
		delete doc.questions[0].question.es;
		expect(wizardSchema.safeParse(doc).success).toBe(false);
	});

	it('requires at least one question in each level', () => {
		const doc = wizardDoc();
		doc.levels.simple = [];
		expect(wizardSchema.safeParse(doc).success).toBe(false);
	});
});

describe('site.yaml: features.wizard', () => {
	it('is a required boolean', () => {
		const site = parse(valid['content/site.yaml']);
		expect(siteSchema.safeParse(site).success).toBe(true);
		delete site.features.wizard;
		expect(siteSchema.safeParse(site).success).toBe(false);
		site.features.wizard = 'yes';
		expect(siteSchema.safeParse(site).success).toBe(false);
	});
});

describe('wizard.yaml: cross-checks', () => {
	it('a missing file is reported', () => {
		expect(issuesOf(without(valid, WIZARD))).toContainEqual(
			expect.objectContaining({ file: WIZARD, message: expect.stringMatching(/missing/i) })
		);
	});

	it('a level may only list ids that have a question', () => {
		const files = edit((doc) => doc.levels.advanced.push('status'));
		expect(messages(files).join('\n')).toMatch(/levels\.advanced\.\d+: .*"status"/);
	});

	it('a level may not list an id twice', () => {
		const files = edit((doc) => doc.levels.simple.push('target'));
		expect(messages(files).join('\n')).toMatch(/levels\.simple\.\d+: Duplicate/);
	});

	it('question ids are unique', () => {
		const files = edit((doc) => doc.questions.push({ ...doc.questions[0] }));
		expect(messages(files).join('\n')).toMatch(/questions\.\d+\.id: Duplicate/);
	});

	it('simple must be a subset of advanced', () => {
		const files = edit((doc) => {
			doc.levels.advanced = doc.levels.advanced.filter((id: string) => id !== 'input');
		});
		expect(messages(files).join('\n')).toMatch(/levels\.simple\.\d+: .*"input".*advanced/);
	});

	it('api and self_hostable need an option label', () => {
		const files = edit((doc) => delete doc.questions.find((q: any) => q.id === 'api').option);
		expect(messages(files).join('\n')).toMatch(/questions\.\d+\.option: Required/);
	});

	it('taxonomy questions must not carry an option label', () => {
		const files = edit((doc) => {
			doc.questions[0].option = { en: 'x', es: 'x' };
		});
		expect(messages(files).join('\n')).toMatch(/questions\.0\.option: Not allowed/);
	});

	it('a missing translation is reported with its path', () => {
		const files = edit((doc) => delete doc.questions[1].help);
		// help is optional: still valid
		expect(() => loadContent(files, { today: new Date(2025, 5, 1) })).not.toThrow();
		const broken = edit((doc) => delete doc.questions[0].help.es);
		expect(issuesOf(broken)).toContainEqual(
			expect.objectContaining({ file: WIZARD, path: 'questions.0.help.es' })
		);
	});

	it('a TODO in es is reported', () => {
		const files = edit((doc) => (doc.questions[0].question.es = 'TODO'));
		expect(issuesOf(files)).toContainEqual(
			expect.objectContaining({ file: WIZARD, path: 'questions.0.question.es' })
		);
	});
});
