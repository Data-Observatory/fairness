<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ToolCard as ToolCardData } from '$lib/core/view';
	import * as m from '$lib/paraglide/messages';
	import ToolCard from './ToolCard.svelte';

	let {
		cards,
		summary,
		showSummary = true,
		focusTarget = false,
		actions
	}: {
		cards: ToolCardData[];
		/** One entry per question: its text and the labels of the chosen options (none: no preference). */
		summary: { id: string; question: string; answers: string[] }[];
		/** Hidden on screen when false (the advanced level shows its answers in the controls). */
		showSummary?: boolean;
		focusTarget?: boolean;
		/** Buttons shown between the summary and the cards, hidden when printing. */
		actions?: Snippet;
	} = $props();

	const count = $derived(
		cards.length === 1
			? m.wizard_results_count_one({ count: cards.length })
			: m.wizard_results_count_other({ count: cards.length })
	);
</script>

<section data-testid="wizard-results" aria-labelledby="wizard-results-title" class="mt-10">
	<h2
		id="wizard-results-title"
		data-wizard-focus={focusTarget ? '' : undefined}
		tabindex="-1"
		class="font-heading text-2xl font-semibold tracking-tight text-zinc-900 focus:outline-none"
	>
		{m.wizard_results_title()}
	</h2>

	<div
		data-testid="wizard-summary"
		class={[
			'mt-4 rounded-2xl bg-zinc-50 p-5 text-sm ring-1 ring-zinc-200',
			!showSummary && 'hidden print:block'
		]}
	>
		<h3 class="font-heading text-base font-semibold text-zinc-900">{m.wizard_summary_title()}</h3>
		<dl class="mt-3 space-y-2">
			{#each summary as item (item.id)}
				<div>
					<dt class="font-medium text-zinc-900">{item.question}</dt>
					<dd class="text-zinc-700">
						{item.answers.length > 0 ? item.answers.join(', ') : m.wizard_no_preference()}
					</dd>
				</div>
			{/each}
		</dl>
	</div>

	{#if actions}
		<div class="mt-4 flex flex-wrap gap-3 print:hidden">
			{@render actions()}
		</div>
	{/if}

	<p role="status" data-testid="wizard-result-count" class="mt-4 text-sm font-medium text-zinc-900">
		{count}
	</p>
	{#if cards.length === 0}
		<p data-testid="wizard-no-results" class="mt-3 text-sm text-zinc-700">
			{m.wizard_results_none()}
		</p>
	{/if}
	<ul class="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 print:grid-cols-1">
		{#each cards as tool (tool.id)}
			<li>
				<ToolCard {tool} />
			</li>
		{/each}
	</ul>
</section>
