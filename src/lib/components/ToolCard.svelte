<script lang="ts">
	import { resolve } from '$app/paths';
	import { localized } from '$lib/i18n';
	import type { ToolCard } from '$lib/core/view';
	import * as m from '$lib/paraglide/messages';
	import ExternalLink from './ExternalLink.svelte';
	import StatusChip from './StatusChip.svelte';

	let { tool }: { tool: ToolCard } = $props();

	const statusChip = $derived(tool.chips.find((chip) => chip.kind === 'status'));
	const plainChips = $derived(tool.chips.filter((chip) => chip.kind !== 'status'));
</script>

<article
	data-testid="tool-card"
	data-tool-id={tool.id}
	class="flex h-full flex-col rounded-2xl bg-white p-5 ring-1 ring-zinc-200 transition-shadow hover:shadow-sm print:break-inside-avoid"
>
	<h3 class="font-heading text-lg font-semibold text-zinc-900">{tool.name}</h3>
	<ul class="mt-3 flex flex-wrap gap-1.5">
		{#each plainChips as chip (`${chip.kind}-${chip.id}`)}
			<li
				data-chip={chip.kind}
				class="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-800"
			>
				{chip.label}
			</li>
		{/each}
		{#if statusChip}
			<li><StatusChip chip={statusChip} /></li>
		{/if}
	</ul>
	<p class="mt-3 text-sm text-zinc-700">{tool.summary}</p>
	{#if tool.bestFor}
		<p data-testid="best-for" class="mt-3 text-sm text-zinc-700">
			<span class="font-medium text-zinc-900">{m.card_use_case()}</span>
			{tool.bestFor}
		</p>
	{/if}
	<div class="mt-auto flex flex-wrap items-center gap-3 pt-5">
		<ExternalLink
			href={tool.url}
			data-testid="open-tool"
			class="inline-flex items-center rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
		>
			{m.card_open()}<span class="sr-only">: {tool.name}</span>
		</ExternalLink>
		<a
			data-testid="tool-details"
			href={localized(resolve('/tools/[id]', { id: tool.id }))}
			class="rounded-full px-4 py-2 text-sm font-medium text-zinc-700 ring-1 ring-zinc-300 hover:bg-zinc-50"
		>
			{m.card_details()}<span class="sr-only">: {tool.name}</span>
		</a>
	</div>
</article>
