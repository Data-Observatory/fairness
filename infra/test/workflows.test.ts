import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';

const workflowsDir = path.join(__dirname, '../../.github/workflows');
// The dummy account ci.yml passes to cdk synth (same exception as no-account-ids.test.ts).
const DUMMY_ACCOUNT = '111111111111';
const names = fs.readdirSync(workflowsDir).filter((f) => /\.ya?ml$/.test(f));

type Step = {
	name?: string;
	uses?: string;
	run?: string;
	with?: Record<string, unknown>;
	env?: Record<string, string>;
	'working-directory'?: string;
};
type Workflow = {
	name?: string;
	on: Record<string, any>;
	permissions?: Record<string, string>;
	concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
	jobs: Record<
		string,
		{
			if?: string;
			needs?: string | string[];
			environment?: unknown;
			permissions?: Record<string, string>;
			steps: Step[];
		}
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

	it.each(names)('%s has no 12-digit number other than the dummy synth account', (name) => {
		const { text } = load(name);
		const found = (text.match(/\b[0-9]{12}\b/g) ?? []).filter((n) => n !== DUMMY_ACCOUNT);
		expect(found).toEqual([]);
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
	const diff = wf.jobs.diff;
	const deploy = wf.jobs.deploy;
	const AWS_ACTION = 'aws-actions/configure-aws-credentials@';
	const runIndex = (steps: Step[], cmd: string, dir?: string) =>
		steps.findIndex((s) => s.run?.trim() === cmd && s['working-directory'] === dir);
	const awsIndex = (steps: Step[]) => steps.findIndex((s) => s.uses?.startsWith(AWS_ACTION));
	const allSteps = [...(diff?.steps ?? []), ...(deploy?.steps ?? [])];

	it('has two jobs: diff, then deploy', () => {
		expect(Object.keys(wf.jobs).sort()).toEqual(['deploy', 'diff']);
		expect(deploy.needs).toBe('diff');
		expect(diff.needs).toBeUndefined();
	});

	it('is triggered only by workflow_run (CI, main) and workflow_dispatch, never push', () => {
		expect(Object.keys(wf.on).sort()).toEqual(['workflow_dispatch', 'workflow_run']);
		expect(wf.on.workflow_run).toEqual({
			workflows: ['CI'],
			types: ['completed'],
			branches: ['main']
		});
	});

	it('waits for a workflow that exists, by its real name', () => {
		expect(load('ci.yml').wf.name).toBe('CI');
	});

	it('does not overlap with itself and never cancels a running deploy', () => {
		expect(wf.concurrency?.group).toBeTruthy();
		expect(wf.concurrency?.['cancel-in-progress']).toBe(false);
	});

	it.each(['diff', 'deploy'])('%s is inert unless DEPLOY_ENABLED is true', (name) => {
		const job = wf.jobs[name];
		expect(job.if).toContain("vars.DEPLOY_ENABLED == 'true'");
		expect(job.if).toContain("github.event_name == 'workflow_dispatch'");
		expect(job.if).toContain("github.event.workflow_run.conclusion == 'success'");
	});

	it('runs the diff in an environment without approval and the deploy in production', () => {
		expect(diff.environment).toBe('production-diff');
		expect(deploy.environment).toBe('production');
	});

	it.each(['diff', 'deploy'])(
		'%s asks for the OIDC token and read-only contents, nothing else',
		(name) => {
			const job = wf.jobs[name];
			expect(job.permissions ?? wf.permissions).toEqual({
				'id-token': 'write',
				contents: 'read'
			});
		}
	);

	it.each(['diff', 'deploy'])(
		'%s checks out the commit that passed CI (default ref for a manual run)',
		(name) => {
			const checkout = wf.jobs[name].steps.find((s) => s.uses?.startsWith('actions/checkout@'));
			expect(checkout).toBeDefined();
			expect(checkout!.with?.ref).toBe('${{ github.event.workflow_run.head_sha }}');
		}
	);

	it.each(['diff', 'deploy'])(
		'%s assumes the role from a secret and takes the region from a variable',
		(name) => {
			const step = wf.jobs[name].steps.find((s) => s.uses?.startsWith(AWS_ACTION));
			expect(step).toBeDefined();
			expect(step!.with).toEqual({
				'role-to-assume': '${{ secrets.AWS_DEPLOY_ROLE_ARN }}',
				'aws-region': '${{ vars.AWS_REGION }}'
			});
		}
	);

	it('diff runs the checks, the build and the infra gates before it touches AWS', () => {
		const order = [
			runIndex(diff.steps, 'npm ci'),
			runIndex(diff.steps, 'npm run check'),
			runIndex(diff.steps, 'npm run lint'),
			runIndex(diff.steps, 'npm run validate'),
			runIndex(diff.steps, 'npx vitest run'),
			runIndex(diff.steps, 'npm run build'),
			runIndex(diff.steps, 'npm run check:base-path'),
			runIndex(diff.steps, 'npm ci', 'infra'),
			runIndex(diff.steps, 'npx tsc --noEmit', 'infra'),
			runIndex(diff.steps, 'npx vitest run', 'infra')
		];
		expect(order.every((i) => i >= 0)).toBe(true);
		expect(order).toEqual([...order].sort((a, b) => a - b));
		expect(awsIndex(diff.steps)).toBeGreaterThan(order[order.length - 1]);
	});

	it.each(['diff', 'deploy'])(
		'%s installs the infra packages before the AWS credentials exist',
		(name) => {
			const steps = wf.jobs[name].steps;
			const install = runIndex(steps, 'npm ci', 'infra');
			expect(install).toBeGreaterThanOrEqual(0);
			expect(awsIndex(steps)).toBeGreaterThan(install);
		}
	);

	it('uses Node 22 in both jobs', () => {
		for (const job of [diff, deploy]) {
			const node = job.steps.find((s) => s.uses?.startsWith('actions/setup-node@'));
			expect(String(node?.with?.['node-version'])).toMatch(/^22/);
		}
	});

	it('diff runs cdk diff with the domain and logging options and never deploys', () => {
		const script = diff.steps.map((s) => s.run ?? '').join('\n');
		expect(script).toMatch(/\.\/node_modules\/\.bin\/cdk diff /);
		expect(script).not.toMatch(/cdk\s+deploy/);
		expect(script).toContain('-c domainName="$SITE_DOMAIN"');
		expect(script).toContain('-c accessLogs="$ACCESS_LOGS"');
		expect(script).toContain('-c accessLogRetentionDays="$ACCESS_LOG_RETENTION_DAYS"');
	});

	it('diff publishes the cdk diff output in the job summary', () => {
		const step = diff.steps.find((s) => s.run?.includes('cdk diff'));
		expect(step?.run).toContain('$GITHUB_STEP_SUMMARY');
		expect(step?.run).toContain('--no-color');
	});

	it('diff uploads the reviewed build as an artifact and deploy downloads that artifact', () => {
		const upload = diff.steps.find((s) => s.uses?.startsWith('actions/upload-artifact@'));
		const download = deploy.steps.find((s) => s.uses?.startsWith('actions/download-artifact@'));
		expect(upload?.with?.path).toBe('build');
		expect(download?.with?.path).toBe('build');
		expect(upload?.with?.name).toBeTruthy();
		expect(download?.with?.name).toBe(upload?.with?.name);
		const deployIndex = deploy.steps.findIndex((s) => s.run?.includes('cdk deploy'));
		expect(deploy.steps.indexOf(download!)).toBeLessThan(deployIndex);
	});

	it('deploy does not rebuild the site and runs cdk deploy without a prompt', () => {
		const script = deploy.steps.map((s) => s.run ?? '').join('\n');
		expect(script).not.toContain('npm run build');
		expect(script).not.toMatch(/cdk\s+diff/);
		expect(script).toContain('./node_modules/.bin/cdk deploy --require-approval never');
		expect(script).toContain('-c domainName="$SITE_DOMAIN"');
		expect(script).toContain('-c accessLogs="$ACCESS_LOGS"');
		expect(script).toContain('-c accessLogRetentionDays="$ACCESS_LOG_RETENTION_DAYS"');
	});

	it('passes the variables to run steps through env, never by inline interpolation', () => {
		for (const step of allSteps.filter((s) => s.run)) {
			expect(step.run, step.name ?? step.run).not.toContain('${{');
		}
		for (const job of [diff, deploy]) {
			const step = job.steps.find((s) => s.run?.includes('cdk '));
			expect(step?.env).toEqual({
				SITE_DOMAIN: '${{ vars.SITE_DOMAIN }}',
				ACCESS_LOGS: '${{ vars.ACCESS_LOGS }}',
				ACCESS_LOG_RETENTION_DAYS: '${{ vars.ACCESS_LOG_RETENTION_DAYS }}'
			});
		}
	});

	it('does not run an action pinned to nothing: every uses has a version', () => {
		for (const s of allSteps.filter((x) => x.uses)) expect(s.uses).toMatch(/@[0-9a-zA-Z._-]+$/);
	});

	it('pins third-party actions by 40-character commit SHA', () => {
		for (const s of allSteps.filter((x) => x.uses)) expect(s.uses).toMatch(/@[0-9a-f]{40}(\s|$)/);
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
