<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { auth } from '$lib/token.svelte';
	import { GitBranch, Key, KeyRound } from '@lucide/svelte';
	import TokenDialog from '$lib/components/TokenDialog.svelte';

	let { children } = $props();
	let showTokenDialog = $state(false);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>GitViewer</title>
</svelte:head>

<div class="app-shell">
	<header class="app-header">
		<a href="/" class="brand">
			<GitBranch size={18} class="brand-mark" />
			<span>GitViewer</span>
		</a>
		<div class="spacer"></div>
		<button class="token-btn" onclick={() => (showTokenDialog = true)} title="GitHub token settings">
			{#if auth.token}
				<KeyRound size={14} class="token-on" />
				<span>Token set</span>
			{:else}
				<Key size={14} />
				<span>No token</span>
			{/if}
		</button>
	</header>
	<main class="app-main">
		{@render children()}
	</main>
</div>

<TokenDialog open={showTokenDialog} onClose={() => (showTokenDialog = false)} />

<style>
	.app-shell {
		display: flex;
		flex-direction: column;
		height: 100vh;
	}
	.app-header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 16px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-elev);
		flex-shrink: 0;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 600;
		font-size: 15px;
		color: var(--text);
	}
	.brand:hover {
		text-decoration: none;
		color: var(--accent);
	}
	.brand :global(.brand-mark) {
		color: var(--accent);
	}
	.spacer {
		flex: 1;
	}
	.token-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
	}
	.token-btn :global(.token-on) {
		color: var(--success);
	}
	.app-main {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
</style>
