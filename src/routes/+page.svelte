<script lang="ts">
	import type { PageData } from './$types';
	import { resolve } from '$app/paths';
	import Labbook from '$lib/components/labbook/Labbook.svelte';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Labbook — Papers and ideas</title>
	<meta
		name="description"
		content="A collection of papers, research notes, and concepts. A workspace for understanding."
	/>
</svelte:head>

{#if data.library}
	<Labbook library={data.library} canEdit={data.canEdit} storageMode={data.storageMode} />
{:else}
	<main class="notebook-message">
		<p class="eyebrow">A workspace for understanding</p>
		<h1>Notebook unavailable</h1>
		<p>{data.problem}</p>
		<a href={resolve('/')} data-sveltekit-reload>Try again</a>
	</main>
{/if}

<style>
	.notebook-message {
		max-width: 700px;
		margin: 0 auto;
		padding: 100px 28px;
		color: #172332;
		font-family: 'Segoe UI', sans-serif;
	}
	.eyebrow {
		text-transform: uppercase;
		letter-spacing: 1.5px;
		font-size: 10px;
		color: #75808e;
	}
	h1 {
		font-size: 34px;
		letter-spacing: -1px;
		margin: 12px 0;
		font-weight: 600;
	}
	p {
		color: #75808e;
		line-height: 1.8;
	}
	a {
		display: inline-block;
		margin-top: 22px;
		background: #245ad6;
		color: white;
		border-radius: 5px;
		padding: 11px 18px;
		font-size: 13px;
		text-decoration: none;
	}
</style>
