<script lang="ts">
	import CaveatBox from '$lib/components/CaveatBox.svelte';
	import ExternalLink from '$lib/components/ExternalLink.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();

	const linkClass = 'text-blue-700 underline underline-offset-2 break-words hover:text-blue-800';
	const h2 = 'mt-10 font-heading text-xl font-semibold text-zinc-900';
</script>

<svelte:head>
	<title>{m.about_title()} - {data.site.name}</title>
</svelte:head>

<div class="mx-auto max-w-2xl px-6 pt-4 pb-8 text-zinc-700">
	<h1 class="font-heading text-3xl font-semibold tracking-tight text-zinc-900">
		{m.about_title()}
	</h1>

	<section aria-labelledby="about-what">
		<h2 id="about-what" class={h2}>{m.about_what_title()}</h2>
		<p class="mt-3">{m.about_what_body_1()}</p>
		<p class="mt-3">{m.about_what_body_2()}</p>
		<div class="mt-5"><CaveatBox caveats={data.caveats} /></div>
	</section>

	<section aria-labelledby="about-verified">
		<h2 id="about-verified" class={h2}>{m.about_verified_title()}</h2>
		<p class="mt-3">{m.about_verified_body_1()}</p>
		<p class="mt-3">{m.about_verified_status_intro()}</p>
		<dl class="mt-3 space-y-2">
			{#each data.statuses as status (status.id)}
				<div>
					<dt class="font-medium text-zinc-900">{status.label}</dt>
					{#if status.description}
						<dd>{status.description}</dd>
					{/if}
				</div>
			{/each}
		</dl>
		<p class="mt-3">{m.about_verified_body_2({ days: data.staleAfterDays })}</p>
		<p class="mt-3">{m.about_verified_body_3()}</p>
	</section>

	<section aria-labelledby="about-suggest">
		<h2 id="about-suggest" class={h2}>{m.about_suggest_title()}</h2>
		<p class="mt-3">{m.about_suggest_body()}</p>
		<p class="mt-3">
			<ExternalLink href={data.site.contributeUrl} class={linkClass}>
				{m.about_suggest_link()}
			</ExternalLink>
		</p>
	</section>

	<section aria-labelledby="about-licenses">
		<h2 id="about-licenses" class={h2}>{m.about_licenses_title()}</h2>
		<p class="mt-3">{m.about_licenses_code({ license: 'MIT' })}</p>
		<p class="mt-3">{m.about_licenses_content({ license: 'CC-BY-4.0' })}</p>
		<p class="mt-3">{m.about_licenses_names()}</p>
	</section>

	<section aria-labelledby="about-cite">
		<h2 id="about-cite" class={h2}>{m.about_cite_title()}</h2>
		<p class="mt-3 break-words">{m.about_cite_body({ url: data.siteUrl })}</p>
	</section>

	<section aria-labelledby="about-privacy">
		<h2 id="about-privacy" class={h2}>{m.about_privacy_title()}</h2>
		<p class="mt-3">{m.privacy_statement()}</p>
	</section>

	<section aria-labelledby="about-origin">
		<h2 id="about-origin" class={h2}>{m.about_origin_title()}</h2>
		<p class="mt-3">{m.about_origin_body()}</p>
		<p class="mt-3">
			<ExternalLink href="https://rcs.dataobservatory.net/" class={linkClass}>
				{m.about_origin_link()}
			</ExternalLink>
		</p>
	</section>
</div>
