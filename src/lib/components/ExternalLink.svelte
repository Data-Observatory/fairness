<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as m from '$lib/paraglide/messages';

	let {
		href,
		children,
		class: className = '',
		icon = true,
		...rest
	}: {
		href: string;
		children: Snippet;
		class?: string;
		icon?: boolean;
		[key: string]: unknown;
	} = $props();
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL from content -->
<a {href} target="_blank" rel="noopener noreferrer" class={className} {...rest}>
	{@render children()}
	<span class="sr-only">{m.opens_in_new_tab()}</span>
	{#if icon}
		<svg
			aria-hidden="true"
			viewBox="0 0 20 20"
			fill="none"
			stroke="currentColor"
			stroke-width="1.8"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="ml-1 inline-block size-3.5 align-[-0.1em]"
		>
			<path d="M11 3h6v6M17 3l-8 8M8 5H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-3" />
		</svg>
	{/if}
</a>
