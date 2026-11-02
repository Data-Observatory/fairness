import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';

const workflowsDir = path.join(__dirname, '../../.github/workflows');
const names = fs.readdirSync(workflowsDir).filter((f) => /\.ya?ml$/.test(f));

type Step = { name?: string; uses?: string; run?: string; with?: Record<string, unknown> };
type Workflow = {
	name?: string;
	on: Record<string, any>;
	permissions?: Record<string, string>;
	jobs: Record<
		string,
		{ if?: string; environment?: unknown; permissions?: Record<string, string>; steps: Step[] }
	>;
};

function load(name: string): { text: string; wf: Workflow } {
	const text = fs.readFileSync(path.join(workflowsDir, name), 'utf8');
	return { text, wf: parseYaml(text) as Workflow };
}

describe('all workflows', () => {
	it('finds the workflow files', () => {
		expect(names).toEqual(expect.arrayContaining(['ci.yml', 'links.yml', 'deploy.yml']));
	});

	it.each(names)('%s has no 12-digit number', (name) => {
		const { text } = load(name);
		expect(text.match(/\b[0-9]{12}\b/g)).toBeNull();
	});

	it.each(names)('%s has no arn:aws string', (name) => {
		expect(load(name).text).not.toMatch(/arn:aws/i);
	});

	it.each(names)('%s names no AWS profile', (name) => {
		expect(load(name).text).not.toMatch(/profile/i);
	});
});

describe('deploy.yml', () => {
	const { text, wf } = load('deploy.yml');
	const job = Object.values(wf.jobs)[0];
	const steps = job.steps;

	it('has a single job', () => {
		expect(Object.keys(wf.jobs)).toHaveLength(1);
	});

	it('is triggered only by workflow_run (Link check, main) and workflow_dispatch, never push', () => {
		expect(Object.keys(wf.on).sort()).toEqual(['workflow_dispatch', 'workflow_run']);
		expect(wf.on.workflow_run).toEqual({
			workflows: ['Link check'],
			types: ['completed'],
			branches: ['main']
		});
	});

	it('waits for a workflow that exists, by its real name', () => {
		const links = load('links.yml').wf;
		expect(links.name).toBe('Link check');
	});

	it('is inert unless the DEPLOY_ENABLED variable is true', () => {
		expect(job.if).toContain("vars.DEPLOY_ENABLED == 'true'");
		expect(job.if).toContain("github.event_name == 'workflow_dispatch'");
		expect(job.if).toContain("github.event.workflow_run.conclusion == 'success'");
	});

	it('uses the production environment', () => {
		expect(job.environment).toBe('production');
	});

	it('asks for the OIDC token and read-only contents, nothing else', () => {
		expect(job.permissions ?? wf.permissions).toEqual({ 'id-token': 'write', contents: 'read' });
	});

	it('assumes the role from a secret and takes the region from a variable', () => {
		const step = steps.find((s) => s.uses?.startsWith('aws-actions/configure-aws-credentials@'));
		expect(step).toBeDefined();
		expect(step!.with).toEqual({
			'role-to-assume': '${{ secrets.AWS_DEPLOY_ROLE_ARN }}',
			'aws-region': '${{ vars.AWS_REGION }}'
		});
	});

	it('runs the checks and the build before it touches AWS', () => {
		const runs = steps.map((s) => s.run?.trim());
		const uses = steps.map((s) => s.uses ?? '');
		const order = [
			'npm ci',
			'npm run check',
			'npm run lint',
			'npm run validate',
			'npx vitest run',
			'npm run build'
		].map((cmd) => runs.indexOf(cmd));
		expect(order.every((i) => i >= 0)).toBe(true);
		expect(order).toEqual([...order].sort((a, b) => a - b));
		const aws = uses.findIndex((u) => u.startsWith('aws-actions/configure-aws-credentials@'));
		expect(aws).toBeGreaterThan(order[order.length - 1]);
	});

	it('uses Node 22', () => {
		const node = steps.find((s) => s.uses?.startsWith('actions/setup-node@'));
		expect(String(node?.with?.['node-version'])).toMatch(/^22/);
	});

	it('runs cdk diff, then cdk deploy without a prompt, both with the domain from a variable', () => {
		const infra = steps.filter((s) => s.run?.includes('cdk '));
		const script = infra.map((s) => s.run).join('\n');
		expect(script).toContain('npm ci');
		const diff = script.indexOf('cdk diff -c domainName=${{ vars.SITE_DOMAIN }}');
		const deploy = script.indexOf(
			'cdk deploy --require-approval never -c domainName=${{ vars.SITE_DOMAIN }}'
		);
		expect(diff).toBeGreaterThanOrEqual(0);
		expect(deploy).toBeGreaterThan(diff);
		expect(script).toContain('./node_modules/.bin/cdk');
	});

	it('does not run an action pinned to nothing: every uses has a version', () => {
		for (const s of steps.filter((x) => x.uses)) expect(s.uses).toMatch(/@[0-9a-zA-Z._-]+$/);
	});

	it('pins third-party actions by 40-character commit SHA', () => {
		for (const s of steps.filter((x) => x.uses)) expect(s.uses).toMatch(/@[0-9a-f]{40}(\s|$)/);
	});

	it('does not echo secrets or print credentials', () => {
		expect(text).not.toMatch(/echo .*secrets\./);
		expect(text).not.toMatch(/AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID/);
	});
});

describe('ci.yml', () => {
	const { text, wf } = load('ci.yml');
	const runs = Object.values(wf.jobs)
		.flatMap((j) => j.steps)
		.map((s) => `${s.run ?? ''} ${s.uses ?? ''}`);

	it('has no deploy step', () => {
		expect(runs.join('\n')).not.toMatch(/cdk\s+(deploy|diff|bootstrap)/);
		expect(runs.join('\n')).not.toMatch(/configure-aws-credentials/);
	});

	it('does not request an OIDC token', () => {
		expect(text).not.toMatch(/id-token/);
	});
});
