<script lang="ts">
	import '$lib/live/retro.css';

	let { children } = $props();
</script>

<svelte:head>
	<link
		href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;800&family=Press+Start+2P&display=swap"
		rel="stylesheet"
	/>
	<meta name="robots" content="noindex, nofollow" />
	<meta name="theme-color" content="#ffd0e4" />
</svelte:head>

<div class="retro">
	{@render children()}
</div>
