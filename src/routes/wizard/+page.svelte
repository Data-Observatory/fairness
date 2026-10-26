<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import CaveatBox from '$lib/components/CaveatBox.svelte';
	import WizardQuestion from '$lib/components/WizardQuestion.svelte';
	import WizardResults from '$lib/components/WizardResults.svelte';
	import { urlWithQuery } from '$lib/core/home-state';
	import {
		matchingToolIds,
		optionCounts,
		parseWizardQuery,
		setAnswer,
		switchLevel,
		wizardConfigOf,
		wizardStateToQuery,
		type WizardLevel,
		type WizardState
	} from '$lib/core/wizard';
	import { localized } from '$lib/i18n';
	import { currentQuery } from '$lib/query-state.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();
	const view = $derived(data.view);
	const config = $derived(wizardConfigOf(view));

	// The prerendered page carries no state and no controls: the state is read from the query
	// string after mount, and without JavaScript only the explanation below is shown.
	let enhanced = $state(false);
	let wizard = $state<WizardState>({ level: 'simple', answers: {}, step: 1 });
	let root = $state<HTMLElement>();

	const questions = $derived(
		config.levels[wizard.level].flatMap((id) => view.questions.filter((item) => item.id === id))
	);
	const matching = $derived(new Set(matchingToolIds(view.tools, wizard.answers)));
	const cards = $derived(view.tools.filter((tool) => matching.has(tool.id)));
	const summary = $derived(
		questions.map((item) => ({
			id: item.id,
			question: item.question,
			answers: item.options
				.filter((option) => wizard.answers[item.id]?.includes(option.id))
				.map((option) => option.label)
		}))
	);
	const finderHref = $derived(`${localized(resolve('/'))}#finder` as ResolvedPathname);

	onMount(() => {
		wizard = parseWizardQuery(new URLSearchParams(window.location.search), config);
		enhanced = true;
	});

	function update(next: WizardState) {
		wizard = next;
		const params = wizardStateToQuery(next, config);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same page, only the query changes
		replaceState(urlWithQuery(page.url, params.toString()), page.state);
		currentQuery.search = window.location.search;
	}

	// After a step change the focused control may be gone or its meaning changed: move focus to
	// the new question or to the results heading so keyboard and screen reader users keep their place.
	// `target` defaults to the element marked data-wizard-focus; a level switch from the results
	// removes the pressed button, so it passes the level switch button instead.
	async function moveTo(next: WizardState, target = '[data-wizard-focus]') {
		update(next);
		await tick();
		root?.querySelector<HTMLElement>(target)?.focus();
	}

	function answer(question: string, option: string, checked: boolean) {
		update(setAnswer(wizard, question, option, checked));
	}

	function clearAnswer(question: string) {
		const current = wizard.answers[question] ?? [];
		update(current.reduce((next, option) => setAnswer(next, question, option, false), wizard));
	}

	function choose(level: WizardLevel) {
		update(switchLevel(wizard, level, config));
	}

	function chooseFromResults(level: WizardLevel) {
		void moveTo(switchLevel(wizard, level, config), `[data-testid=wizard-level-${level}]`);
	}

	const total = $derived(config.levels.simple.length);
	const step = $derived(typeof wizard.step === 'number' ? wizard.step : 0);
	const current = $derived(step > 0 ? questions[step - 1] : undefined);
	const last = $derived(step === total);

	const levelClass = (active: boolean) => [
		'rounded-full px-4 py-2 text-sm font-medium transition-colors',
		active ? 'bg-blue-600 text-white' : 'text-zinc-700 hover:bg-zinc-100'
	];
	const buttonClass =
		'rounded-full px-4 py-2 text-sm font-medium text-zinc-700 ring-1 ring-zinc-300 hover:bg-zinc-50';
</script>

<svelte:head>
	<title>{m.wizard_title()} - {data.site.name}</title>
</svelte:head>

<div bind:this={root} class="mx-auto max-w-4xl px-6 pt-4 pb-8">
	<h1 class="font-heading text-3xl font-semibold tracking-tight text-zinc-900">
		{m.wizard_title()}
	</h1>
	<p class="mt-3 max-w-2xl text-sm text-zinc-700">{m.wizard_intro()}</p>

	{#if !enhanced}
		<div
			data-testid="wizard-noscript"
			class="mt-8 rounded-2xl bg-zinc-50 p-5 text-sm text-zinc-800 ring-1 ring-zinc-200"
		>
			<p class="font-semibold text-zinc-900">{m.wizard_noscript_title()}</p>
			<p class="mt-2">{m.wizard_noscript_body()}</p>
			<p class="mt-3">
				<a
					href={finderHref}
					class="text-blue-700 underline decoration-blue-700/40 underline-offset-2 hover:text-blue-900"
				>
					{m.wizard_noscript_link()}
				</a>
			</p>
		</div>
	{:else}
		<div class="mt-8 print:hidden">
			<div
				role="group"
				aria-label={m.wizard_level_label()}
				class="inline-flex items-center gap-1 rounded-full bg-white p-1 ring-1 ring-zinc-200"
			>
				<button
					type="button"
					data-testid="wizard-level-simple"
					aria-pressed={wizard.level === 'simple'}
					onclick={() => choose('simple')}
					class={levelClass(wizard.level === 'simple')}
				>
					{m.wizard_level_simple()}
				</button>
				<button
					type="button"
					data-testid="wizard-level-advanced"
					aria-pressed={wizard.level === 'advanced'}
					onclick={() => choose('advanced')}
					class={levelClass(wizard.level === 'advanced')}
				>
					{m.wizard_level_advanced()}
				</button>
			</div>
			<p class="mt-2 max-w-2xl text-sm text-zinc-700">{m.wizard_level_help()}</p>
		</div>

		{#if wizard.level === 'advanced'}
			<div class="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
				{#each questions as item (item.id)}
					<WizardQuestion
						question={item}
						kind="checkbox"
						selected={wizard.answers[item.id] ?? []}
						counts={optionCounts(
							view.tools,
							wizard.answers,
							item.id,
							item.options.map((option) => option.id)
						)}
						onchange={(option, checked) => answer(item.id, option, checked)}
						onclear={() => clearAnswer(item.id)}
					/>
				{/each}
			</div>
			<div class="mt-4 print:hidden">
				<button
					type="button"
					data-testid="wizard-clear"
					hidden={Object.keys(wizard.answers).length === 0}
					onclick={() => update({ ...wizard, answers: {} })}
					class={buttonClass}
				>
					{m.wizard_clear()}
				</button>
			</div>
			<WizardResults {cards} {summary} showSummary={false} />
		{:else if current}
			<p data-testid="wizard-progress" class="mt-6 text-sm font-medium text-zinc-900 print:hidden">
				{m.wizard_progress({ step, total })}
			</p>
			<div class="mt-3">
				{#key current.id}
					<WizardQuestion
						question={current}
						kind="radio"
						selected={wizard.answers[current.id] ?? []}
						counts={optionCounts(
							view.tools,
							wizard.answers,
							current.id,
							current.options.map((option) => option.id)
						)}
						focusTarget
						onchange={(option, checked) => answer(current.id, option, checked)}
						onclear={() => clearAnswer(current.id)}
					/>
				{/key}
			</div>
			<div class="mt-4 flex flex-wrap gap-3 print:hidden">
				{#if step > 1}
					<button
						type="button"
						data-testid="wizard-back"
						onclick={() => moveTo({ ...wizard, step: step - 1 })}
						class={buttonClass}
					>
						{m.wizard_back()}
					</button>
				{/if}
				<button
					type="button"
					data-testid="wizard-next"
					onclick={() => moveTo({ ...wizard, step: last ? 'results' : step + 1 })}
					class="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
				>
					{last ? m.wizard_show_results() : m.wizard_next()}
				</button>
			</div>
		{:else}
			<WizardResults {cards} {summary} focusTarget>
				{#snippet actions()}
					<button
						type="button"
						data-testid="wizard-edit"
						onclick={() => moveTo({ ...wizard, step: 1 })}
						class={buttonClass}
					>
						{m.wizard_edit()}
					</button>
					<button
						type="button"
						data-testid="wizard-change-level"
						onclick={() => chooseFromResults('advanced')}
						class={buttonClass}
					>
						{m.wizard_use_advanced()}
					</button>
					<button
						type="button"
						data-testid="wizard-restart"
						onclick={() => moveTo({ level: 'simple', answers: {}, step: 1 })}
						class={buttonClass}
					>
						{m.wizard_restart()}
					</button>
				{/snippet}
			</WizardResults>
		{/if}
	{/if}

	<div class="mt-12">
		<CaveatBox caveats={view.caveats} headingLevel={2} />
	</div>
</div>
