<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import Nav from '$lib/components/Nav.svelte';

	let { children } = $props();

	// `/live` is a separate little site with its own retro chrome — it opts out
	// of the quiz app's navigation and container entirely.
	let standalone = $derived(page.url.pathname.startsWith('/live'));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Daily Quiz</title>
</svelte:head>

{#if standalone}
	{@render children()}
{:else}
	<div class="min-h-screen bg-background">
		<Nav />
		<main class="mx-auto max-w-6xl px-4 py-8 sm:px-6">
			{@render children()}
		</main>
	</div>
{/if}
