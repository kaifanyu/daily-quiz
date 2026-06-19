<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import Nav from '$lib/components/Nav.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Daily Quiz</title>
</svelte:head>

<div class="min-h-screen bg-background">
	<Nav />
	<main class="mx-auto max-w-6xl px-4 py-8 sm:px-6">
		{@render children()}
	</main>
</div>
