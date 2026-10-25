<script lang="ts">
	import './layout.css';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import { locales, getLocale } from '$lib/paraglide/runtime';
	import { withSearch } from '$lib/core/home-state';
	import { localized } from '$lib/i18n';
	import { currentQuery } from '$lib/query-state.svelte';
	import * as m from '$lib/paraglide/messages';
	import ExternalLink from '$lib/components/ExternalLink.svelte';

	let { children, data } = $props();

	const navLinks = $derived([
		{ href: localized(resolve('/')), label: m.nav_home(), routeId: '/' },
		{ href: localized(resolve('/about')), label: m.nav_about(), routeId: '/about' }
	]);

	// Compares against the route pattern rather than the URL, so it is correct regardless
	// of `paths.base`/`paths.relative`.
	function isActive(routeId: string): boolean {
		return page.route.id === routeId;
	}

	// The query string is only known in the browser (prerendering has none), so the locale links
	// gain it after mount, on every navigation, and when the filters change it (see the home page).
	afterNavigate(() => {
		currentQuery.search = window.location.search;
	});

	// Same page in another locale, with the current query string.
	const localeHref = (locale: (typeof locales)[number]): ResolvedPathname =>
		withSearch(
			localized(page.url.pathname as ResolvedPathname, { locale }),
			currentQuery.search
		) as ResolvedPathname;

	function skipToContent(event: MouseEvent) {
		const main = document.getElementById('main-content');
		if (!main) return;
		event.preventDefault();
		main.focus();
		main.scrollIntoView();
	}

	const localeLabels: Record<string, string> = { en: 'EN', es: 'ES' };
</script>

<a
	href="#main-content"
	onclick={skipToContent}
	class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
>
	{m.skip_to_content()}
</a>

<div class="flex min-h-screen flex-col bg-white">
	<header class="sticky top-0 z-40 flex w-full justify-center py-6 print:hidden">
		<nav
			class="flex h-14 items-center gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-zinc-200"
		>
			<a
				href={localized(resolve('/'))}
				class="mr-2 pl-3 font-heading text-sm font-semibold tracking-tight text-zinc-800"
			>
				{data.site.shortName}
			</a>
			{#each navLinks as link (link.href)}
				<a
					href={link.href}
					class={[
						'rounded-full px-4 py-2 text-sm font-medium transition-colors',
						isActive(link.routeId) ? 'bg-blue-600 text-white' : 'text-zinc-700 hover:bg-zinc-100'
					]}
				>
					{link.label}
				</a>
			{/each}

			<div
				class="ml-1 flex items-center gap-0.5 border-l border-zinc-200 pl-2"
				role="group"
				aria-label={m.language_switcher_label()}
			>
				{#each locales as locale (locale)}
					<a
						href={localeHref(locale)}
						data-testid={`locale-switch-${locale}`}
						hreflang={locale}
						lang={locale}
						data-sveltekit-reload
						aria-current={getLocale() === locale ? 'true' : undefined}
						class={[
							'rounded-full px-2.5 py-1.5 text-xs font-semibold transition-colors',
							getLocale() === locale
								? 'bg-zinc-900 text-white'
								: 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-800'
						]}
					>
						{localeLabels[locale] ?? locale}
					</a>
				{/each}
			</div>
		</nav>
	</header>

	<main id="main-content" tabindex="-1" class="flex-1 focus:outline-none">
		{@render children()}
	</main>

	<footer class="mt-16 bg-zinc-900 py-10 text-zinc-300 print:hidden">
		<div class="mx-auto max-w-5xl px-6">
			<ul class="flex flex-wrap gap-x-6 gap-y-2 text-sm">
				<li>
					<ExternalLink
						href={data.site.repository}
						class="text-blue-300 underline decoration-blue-300/40 underline-offset-2 hover:text-blue-200"
					>
						{m.footer_repository()}
					</ExternalLink>
				</li>
				<li>
					<ExternalLink
						href={data.site.contributeUrl}
						class="text-blue-300 underline decoration-blue-300/40 underline-offset-2 hover:text-blue-200"
					>
						{m.footer_contribute()}
					</ExternalLink>
				</li>
			</ul>
			<p class="mt-4 text-sm">{m.privacy_statement()}</p>
			<p class="mt-2 text-xs text-zinc-300">
				{m.footer_license({ codeLicense: 'MIT', contentLicense: 'CC-BY-4.0' })}
			</p>
		</div>
	</footer>
</div>
