<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	let { data, form }: PageProps = $props();
</script>

<svelte:head
	><title>Owner sign in — Labbook</title><meta name="robots" content="noindex" /></svelte:head
>
<main class="owner-login">
	<p class="eyebrow">Your personal research notebook</p>
	<h1>Welcome back.</h1>
	{#if data.loginConfigured}
		<p>Sign in to write and manage your notes.</p>
		<form method="POST" use:enhance>
			<label for="owner-password">Owner password</label>
			<input
				id="owner-password"
				name="password"
				type="password"
				autocomplete="current-password"
				required
				maxlength="4096"
			/>
			{#if form?.message}<p role="alert" class="error">{form.message}</p>{/if}
			<button type="submit">Open notebook</button>
		</form>
	{:else}<p>Owner sign-in is not available yet.</p>{/if}
	<a href={resolve('/')}>Back to Labbook</a>
</main>

<style>
	.owner-login {
		width: min(100%, 440px);
		margin: 50px auto;
		padding: 38px 28px;
		font-family: 'Segoe UI', sans-serif;
		color: #172332;
	}
	.eyebrow {
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 1.3px;
		color: #75808e;
	}
	h1 {
		font-size: 32px;
		font-weight: 600;
		letter-spacing: -0.8px;
		margin: 12px 0;
	}
	p {
		color: #75808e;
		font-size: 13px;
		line-height: 1.8;
	}
	form {
		margin: 26px 0;
	}
	label {
		display: block;
		font-size: 12px;
		margin-bottom: 8px;
	}
	input {
		width: 100%;
		background: white;
		border: 1px solid #dce2e8;
		border-radius: 4px;
		padding: 11px;
		color: #172332;
	}
	button {
		margin-top: 18px;
		background: #245ad6;
		border: 0;
		color: white;
		border-radius: 4px;
		padding: 11px 18px;
		font-size: 12px;
		cursor: pointer;
	}
	a {
		font-size: 12px;
		color: #6484b6;
	}
	.error {
		color: #a64b48;
	}
</style>
