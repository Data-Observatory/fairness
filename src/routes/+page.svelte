<script lang="ts">
	import { resolve } from '$app/paths';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { localized } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';

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
</script>

<svelte:head>
	<title>{m.home_title()}</title>
</svelte:head>

{#if isBareRoot}
	<div class="mx-auto max-w-md px-6 py-24 text-center">
		<p class="text-sm text-zinc-500">{m.home_redirecting()}</p>
		<p class="mt-4 text-sm text-zinc-500">{m.home_redirecting_choose()}</p>
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
	<section class="mx-auto max-w-3xl px-6 pt-20 pb-16 text-center">
		<h1 class="font-heading text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
			{m.home_title()}
		</h1>
		<p class="mx-auto mt-5 max-w-xl text-lg font-light text-zinc-600">
			{m.home_placeholder()}
		</p>
	</section>
{/if}
