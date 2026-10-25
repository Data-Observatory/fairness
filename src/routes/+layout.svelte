<script lang="ts">
	import './layout.css';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import { locales, getLocale } from '$lib/paraglide/runtime';
	import { localized } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';

	let { children } = $props();

	const navLinks = $derived([
		{ href: localized(resolve('/')), label: m.nav_home(), routeId: '/' },
		{ href: localized(resolve('/about')), label: m.nav_about(), routeId: '/about' }
	]);

	// Compares against the route pattern rather than the URL, so it is correct regardless
	// of `paths.base`/`paths.relative`.
	function isActive(routeId: string): boolean {
		return page.route.id === routeId;
	}

	const localeLabels: Record<string, string> = { en: 'EN', es: 'ES' };
</script>

<a
	href="#main-content"
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
				FAIR
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
						href={localized(page.url.pathname as ResolvedPathname, { locale })}
						data-sveltekit-reload
						aria-current={getLocale() === locale ? 'true' : undefined}
						class={[
							'rounded-full px-2.5 py-1.5 text-xs font-semibold transition-colors',
							getLocale() === locale
								? 'bg-zinc-900 text-white'
								: 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'
						]}
					>
						{localeLabels[locale] ?? locale}
					</a>
				{/each}
			</div>
		</nav>
	</header>

	<main id="main-content" class="flex-1">
		{@render children()}
	</main>

	<footer class="mt-16 bg-zinc-900 py-10 text-zinc-300 print:hidden">
		<div class="mx-auto max-w-5xl px-6">
			<p class="text-xs text-zinc-400">
				{m.footer_license({ codeLicense: 'MIT', contentLicense: 'CC-BY-4.0' })}
			</p>
		</div>
	</footer>
</div>
