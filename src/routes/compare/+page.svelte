<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import CaveatBox from '$lib/components/CaveatBox.svelte';
	import ComparePicker from '$lib/components/ComparePicker.svelte';
	import CompareTable from '$lib/components/CompareTable.svelte';
	import {
		compareQuery,
		parseCompareQuery,
		selectCompareView,
		toggleCompareId
	} from '$lib/core/compare-state';
	import { urlWithQuery } from '$lib/core/home-state';
	import { wizardFallback } from '$lib/core/wizard';
	import { localized } from '$lib/i18n';
	import { currentQuery } from '$lib/query-state.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();
	const compare = $derived(data.compare);

	// The prerendered page carries no selection and no controls: the selection is read from the
	// query string after mount, and without JavaScript only the explanation below is shown.
	let enhanced = $state(false);
	let selected = $state<string[]>([]);

	const knownIds = $derived(compare?.view.columns.map((column) => column.id) ?? []);
	const shown = $derived(compare ? selectCompareView(compare.view, selected) : undefined);
	const max = $derived(compare?.max ?? 0);
	const fallback = $derived(wizardFallback(data.features.finderTable));
	const finderHref = $derived(`${localized(resolve('/'))}${fallback.fragment}` as ResolvedPathname);
	const statusText = $derived(
		selected.length >= max
			? m.compare_status_full({ count: selected.length, max })
			: selected.length < 2
				? m.compare_status_few({ count: selected.length, max })
				: m.compare_status_some({ count: selected.length, max })
	);

	onMount(() => {
		selected = parseCompareQuery(window.location.search, knownIds, max);
		enhanced = true;
	});

	function toggle(id: string, checked: boolean) {
		selected = toggleCompareId(selected, id, checked, max);
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same page, only the query changes
		replaceState(urlWithQuery(page.url, compareQuery(selected)), page.state);
		currentQuery.search = window.location.search;
	}
</script>

<svelte:head>
	<title>{compare ? m.compare_title() : m.not_found_title()} - {data.site.name}</title>
</svelte:head>

<div class="mx-auto max-w-5xl px-6 pt-4 pb-8">
	{#if !compare}
		<h1 class="font-heading text-3xl font-semibold tracking-tight text-zinc-900">
			{m.not_found_title()}
		</h1>
		<p class="mt-3 max-w-2xl text-sm text-zinc-700">{m.not_found_body()}</p>
		<p class="mt-4 text-sm">
			<a href={localized(resolve('/'))} class="text-blue-700 underline underline-offset-2">
				{m.not_found_back()}
			</a>
		</p>
	{:else}
		<h1 class="font-heading text-3xl font-semibold tracking-tight text-zinc-900">
			{m.compare_title()}
		</h1>
		<p class="mt-3 max-w-2xl text-sm text-zinc-700">{m.compare_intro()}</p>

		{#if !enhanced}
			<div
				data-testid="compare-noscript"
				class="mt-8 rounded-2xl bg-zinc-50 p-5 text-sm text-zinc-800 ring-1 ring-zinc-200"
			>
				<p class="font-semibold text-zinc-900">{m.compare_noscript_title()}</p>
				<p class="mt-2">
					{fallback.variant === 'table'
						? m.compare_noscript_body()
						: m.compare_noscript_body_home()}
				</p>
				<p class="mt-3">
					<a
						href={finderHref}
						class="text-blue-700 underline decoration-blue-700/40 underline-offset-2 hover:text-blue-900"
					>
						{fallback.variant === 'table'
							? m.compare_noscript_link()
							: m.compare_noscript_link_home()}
					</a>
				</p>
				<p class="mt-3 font-medium text-zinc-900">{m.compare_noscript_tools()}</p>
				<ul class="mt-1 flex flex-wrap gap-x-4 gap-y-1">
					{#each compare.sections.flatMap((section) => section.tools) as tool (tool.id)}
						<li>
							<a
								href={localized(resolve('/tools/[id]', { id: tool.id }))}
								data-tool-id={tool.id}
								class="break-words text-blue-700 underline decoration-blue-700/40 underline-offset-2 hover:text-blue-900"
							>
								{tool.name}
							</a>
						</li>
					{/each}
				</ul>
			</div>
		{:else}
			<h2 class="mt-8 font-heading text-xl font-semibold text-zinc-900">
				{m.compare_pick_title()}
			</h2>
			<p data-testid="compare-status" role="status" class="mt-2 text-sm text-zinc-700">
				{statusText}
			</p>
			<div class="mt-4">
				<ComparePicker sections={compare.sections} {selected} {max} onchange={toggle} />
			</div>

			{#if shown && shown.columns.length >= 2}
				<h2 class="mt-10 font-heading text-xl font-semibold text-zinc-900">
					{m.compare_result_title()}
				</h2>
				<CompareTable view={shown} />
			{/if}
		{/if}

		<div class="mt-12">
			<CaveatBox caveats={compare.caveats} headingLevel={2} />
		</div>
	{/if}
</div>
