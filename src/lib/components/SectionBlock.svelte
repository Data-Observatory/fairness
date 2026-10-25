<script lang="ts">
	import type { HomeView } from '$lib/core/view';
	import * as m from '$lib/paraglide/messages';
	import ToolCard from './ToolCard.svelte';

	type Section = HomeView['sections'][number];

	let { section, visible }: { section: Section; visible: readonly string[] } = $props();

	const shown = $derived(section.tools.filter((tool) => visible.includes(tool.id)).length);
</script>

{#snippet body()}
	{#if section.intro}
		<p class="mt-2 max-w-3xl text-sm text-zinc-700">{section.intro}</p>
	{/if}
	<p data-testid="section-empty" class="mt-4 text-sm text-zinc-700" hidden={shown > 0}>
		{m.section_empty()}
	</p>
	<ul class="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
		{#each section.tools as tool (tool.id)}
			<li hidden={!visible.includes(tool.id)}>
				<ToolCard {tool} />
			</li>
		{/each}
	</ul>
{/snippet}

<section data-section-id={section.id} class="mt-12">
	{#if section.collapsed}
		<details class="group">
			<summary
				class="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-1 py-1 [&::-webkit-details-marker]:hidden"
			>
				<h2 class="font-heading text-2xl font-semibold tracking-tight text-zinc-900">
					{section.title}
				</h2>
				<svg
					aria-hidden="true"
					viewBox="0 0 20 20"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="size-5 shrink-0 text-zinc-600 transition-transform group-open:rotate-180"
				>
					<path d="M5 8l5 5 5-5" />
				</svg>
			</summary>
			{@render body()}
		</details>
	{:else}
		<h2 class="font-heading text-2xl font-semibold tracking-tight text-zinc-900">
			{section.title}
		</h2>
		{@render body()}
	{/if}
</section>
