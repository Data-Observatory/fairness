<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { browser } from '$app/environment';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import CaveatBox from '$lib/components/CaveatBox.svelte';
	import FilterBar from '$lib/components/FilterBar.svelte';
	import FinderTable from '$lib/components/FinderTable.svelte';
	import SectionBlock from '$lib/components/SectionBlock.svelte';
	import {
		hasActiveSelection,
		selectionFromQuery,
		selectionToQuery,
		type Selection
	} from '$lib/core/filter';
	import { allowedValuesOf, expandForPrint, matchingIds, urlWithQuery } from '$lib/core/home-state';
	import { localized } from '$lib/i18n';
	import { currentQuery } from '$lib/query-state.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();
	const view = $derived(data.view);

	// Bare "/" (no locale prefix) is never a real content page: /en and /es are the
	// two real, symmetric routes. This branch only renders for the literal bare path;
	// `reroute` still maps /en and /es to this same file, where page.url.pathname
	// reflects the actual (prefixed) URL the visitor is on.
	const trimSlash = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path);
	const isBareRoot = $derived(trimSlash(page.url.pathname) === trimSlash(resolve('/')));

	$effect(() => {
		if (!browser || !isBareRoot) return;
		const preferred = navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en';
		// A full navigation, not goto(): the target locale's <html lang>/dir are baked
		// into its own prerendered document at build time, and only apply on a real
		// page load.
		// Let the declared fonts and the icon finish loading first: leaving earlier aborts those
		// downloads, which Firefox reports as console errors and failed requests.
		const target = localized(resolve('/'), { locale: preferred });
		const icons = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')].map((link) =>
			fetch(link.href).catch(() => undefined)
		);
		const fonts = [...document.fonts].map((face) => face.load().catch(() => face));
		// The browser's own icon request is not observable, so allow it a short moment as well.
		const settle = new Promise((done) => setTimeout(done, 300));
		void Promise.all([...icons, ...fonts, settle]).then(() => window.location.replace(target));
	});

	// Filters are progressive enhancement: the prerendered page shows every resource, and the
	// selection is read from the query string on the client only, after mount.
	const cards = $derived(view.sections.flatMap((section) => section.tools));
	let selection = $state<Selection>({});
	const filterActive = $derived(hasActiveSelection(selection));
	const visible = $derived(matchingIds(cards, selection));

	onMount(() => {
		selection = selectionFromQuery(
			new URLSearchParams(window.location.search),
			view.filterGroups.map((group) => group.id),
			allowedValuesOf(view.filterGroups)
		);

		// Printing shows every card: open all sections, then put each one back as it was.
		let restore: (() => void) | undefined;
		const beforePrint = () => {
			restore?.();
			restore = expandForPrint(document.querySelectorAll('details'));
		};
		const afterPrint = () => {
			restore?.();
			restore = undefined;
		};
		window.addEventListener('beforeprint', beforePrint);
		window.addEventListener('afterprint', afterPrint);
		return () => {
			window.removeEventListener('beforeprint', beforePrint);
			window.removeEventListener('afterprint', afterPrint);
		};
	});

	function syncUrl() {
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- same page, only the query changes
		replaceState(urlWithQuery(page.url, selectionToQuery(selection).toString()), page.state);
		currentQuery.search = window.location.search;
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

		<CaveatBox caveats={view.caveats} headingLevel={2} />

		<FilterBar
			groups={view.filterGroups}
			{selection}
			shown={visible.length}
			ontoggle={toggle}
			onclear={clear}
		/>

		{#each view.sections as section (section.id)}
			<SectionBlock {section} {visible} {filterActive} />
		{/each}

		{#if view.finder}
			<FinderTable rows={view.finder} wizard={data.wizard} />
		{/if}
	</div>
{/if}
