<script lang="ts">
	import { onMount } from 'svelte';
	import type { Selection } from '$lib/core/filter';
	import type { HomeView } from '$lib/core/view';
	import * as m from '$lib/paraglide/messages';

	let {
		groups,
		selection,
		shown,
		ontoggle,
		onclear
	}: {
		groups: HomeView['filterGroups'];
		selection: Selection;
		shown: number;
		ontoggle: (group: string, id: string, checked: boolean) => void;
		onclear: () => void;
	} = $props();

	// The controls only exist once JavaScript runs: without it they could not do anything, and
	// the prerendered page lists every resource. The result count is always present.
	let enhanced = $state(false);
	let open = $state(false);

	const active = $derived(Object.values(selection).some((values) => (values?.length ?? 0) > 0));
	const count = $derived(
		shown === 1 ? m.results_shown_one({ count: shown }) : m.results_shown_other({ count: shown })
	);

	// The selection is read from the URL after mount, so a shared filtered link opens the panel
	// here rather than in onMount.
	$effect(() => {
		if (active) open = true;
	});

	onMount(() => {
		// Below the md breakpoint the controls start collapsed unless a filter is active, from md
		// up they are always open.
		const wide = window.matchMedia('(min-width: 768px)');
		open = wide.matches || active;
		enhanced = true;
		const update = (event: MediaQueryListEvent) => (open = event.matches || active);
		wide.addEventListener('change', update);
		return () => wide.removeEventListener('change', update);
	});
</script>

<div data-testid="filter-bar" class="mt-10 rounded-2xl p-4 ring-1 ring-zinc-200 print:hidden">
	{#if enhanced}
		<details bind:open>
			<summary
				class="flex cursor-pointer list-none items-center justify-between rounded-full px-1 py-1 text-sm font-semibold text-zinc-900 md:hidden [&::-webkit-details-marker]:hidden"
			>
				{m.filters_title()}
				<svg
					aria-hidden="true"
					viewBox="0 0 20 20"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class={['size-5 transition-transform', open && 'rotate-180']}
				>
					<path d="M5 8l5 5 5-5" />
				</svg>
			</summary>
			<div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:mt-0 lg:grid-cols-3 xl:grid-cols-5">
				{#each groups as group (group.id)}
					<fieldset data-filter-group={group.id} class="min-w-0">
						<legend class="text-sm font-semibold text-zinc-900">{group.label}</legend>
						<div class="mt-2 flex flex-col gap-1.5">
							{#each group.options as option (option.id)}
								<label class="flex items-start gap-2 text-sm text-zinc-800">
									<input
										type="checkbox"
										value={option.id}
										checked={selection[group.id]?.includes(option.id) ?? false}
										onchange={(event) => ontoggle(group.id, option.id, event.currentTarget.checked)}
										class="mt-0.5 size-4 shrink-0 accent-blue-600"
									/>
									<span>
										{option.label}
										<span class="text-zinc-700">({option.count})</span>
									</span>
								</label>
							{/each}
						</div>
					</fieldset>
				{/each}
			</div>
		</details>
	{/if}

	<div class={['flex flex-wrap items-center justify-between gap-3', enhanced && 'mt-4']}>
		<p role="status" data-testid="result-count" class="text-sm font-medium text-zinc-900">
			{count}
		</p>
		<button
			type="button"
			data-testid="clear-filters"
			hidden={!active}
			onclick={onclear}
			class="rounded-full px-4 py-2 text-sm font-medium text-zinc-700 ring-1 ring-zinc-300 hover:bg-zinc-50"
		>
			{m.filters_clear()}
		</button>
	</div>
	<p data-testid="no-results" class="mt-3 text-sm text-zinc-700" hidden={shown > 0}>
		{m.results_none()}
	</p>
</div>
