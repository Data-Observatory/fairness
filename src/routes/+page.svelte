<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import FinderTable from '$lib/components/FinderTable.svelte';
	import SectionBlock from '$lib/components/SectionBlock.svelte';
	import { getContent } from '$lib/core/content';
	import {
		filterTools,
		selectionFromQuery,
		selectionToQuery,
		type Selection
	} from '$lib/core/filter';
	import { localized } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();
	const view = $derived(data.view);

	// Bare "/" (no locale prefix) is never a real content page: /en and /es are the
	// two real, symmetric routes. This branch only renders for the literal bare path;
	// `reroute` still maps /en and /es to this same file, where page.url.pathname
	// reflects the actual (prefixed) URL the visitor is on.
	const isBareRoot = $derived(page.url.pathname === '/');

	$effect(() => {
		if (!browser || !isBareRoot) return;
		const preferred = navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en';
		// A full navigation, not goto(): the target locale's <html lang>/dir are baked
		// into its own prerendered document at build time, and only apply on a real
		// page load.
		window.location.replace(localized(resolve('/'), { locale: preferred }));
	});

	// Filters are progressive enhancement: the prerendered page shows every resource, and the
	// selection is read from the query string on the client only, after mount.
	const tools = getContent().tools;
	let selection = $state<Selection>({});
	const visible = $derived(filterTools(tools, selection).map((tool) => tool.id));

	onMount(() => {
		const groups = view.filterGroups.map((group) => group.id);
		selection = selectionFromQuery(new URLSearchParams(window.location.search), groups);
	});

	function syncUrl() {
		const query = selectionToQuery(selection).toString();
		const { pathname, hash } = window.location;
		window.history.replaceState(
			window.history.state,
			'',
			`${pathname}${query ? `?${query}` : ''}${hash}`
		);
	}

	function toggle(group: string, id: string, checked: boolean) {
		const others = (selection[group] ?? []).filter((value) => value !== id);
		selection = { ...selection, [group]: checked ? [...others, id] : others };
		syncUrl();
	}

	function clear() {
		selection = {};
		syncUrl();
	}
</script>

<svelte:head>
	<title>{view.siteName}</title>
</svelte:head>

{#if isBareRoot}
	<div class="mx-auto max-w-md px-6 py-24 text-center">
		<p class="text-sm text-zinc-700">{m.home_redirecting()}</p>
		<p class="mt-4 text-sm text-zinc-700">{m.home_redirecting_choose()}</p>
		<div class="mt-3 flex justify-center gap-3">
			<a
				href={localized(resolve('/'), { locale: 'en' })}
				class="rounded-full px-4 py-2 text-sm font-medium text-zinc-700 ring-1 ring-zinc-300 hover:bg-zinc-50"
			>
				English
			</a>
			<a
				href={localized(resolve('/'), { locale: 'es' })}
				class="rounded-full px-4 py-2 text-sm font-medium text-zinc-700 ring-1 ring-zinc-300 hover:bg-zinc-50"
			>
				Español
			</a>
		</div>
	</div>
{:else}
	<div class="mx-auto max-w-6xl px-6 pb-8">
		<section class="mx-auto max-w-3xl pt-12 pb-10 text-center sm:pt-16">
			<h1 class="font-heading text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
				{view.siteName}
			</h1>
			<p class="mx-auto mt-5 max-w-xl text-lg font-light text-zinc-700">{view.tagline}</p>
		</section>

		<div
			data-testid="caveats"
			class="mx-auto max-w-3xl rounded-2xl bg-zinc-50 p-5 text-sm text-zinc-800 ring-1 ring-zinc-200"
		>
			<h2 class="font-heading text-base font-semibold text-zinc-900">{m.caveats_title()}</h2>
			<ul class="mt-3 list-disc space-y-2 pl-5">
				{#each view.caveats as caveat (caveat)}
					<li class="break-words">{caveat}</li>
				{/each}
			</ul>
		</div>

		<FilterBar
			groups={view.filterGroups}
			{selection}
			shown={visible.length}
			ontoggle={toggle}
			onclear={clear}
		/>

		{#each view.sections as section (section.id)}
			<SectionBlock {section} {visible} />
		{/each}

		{#if view.finder}
			<FinderTable rows={view.finder} />
		{/if}
	</div>
{/if}
