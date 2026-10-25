<script lang="ts">
	import * as m from '$lib/paraglide/messages';
</script>

<svelte:head>
	<title>{m.about_title()} - {m.site_name()}</title>
</svelte:head>

<div class="mx-auto max-w-2xl px-6 py-12">
	<h1 class="font-heading text-2xl font-semibold text-zinc-900">{m.about_title()}</h1>
</div>
