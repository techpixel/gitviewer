<script lang="ts">
	import { goto } from '$app/navigation';
	import { parseRepoInput } from '$lib/github';
	import { ArrowRight } from '@lucide/svelte';

	let input = $state('');
	let error = $state<string | null>(null);

	function open() {
		error = null;
		try {
			const { owner, repo } = parseRepoInput(input);
			goto(`/${owner}/${repo}`);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	const examples = [
		{ label: 'sveltejs/svelte', value: 'sveltejs/svelte' },
		{ label: 'torvalds/linux', value: 'torvalds/linux' },
		{ label: 'tj/commander.js', value: 'tj/commander.js' }
	];

	function pick(v: string) {
		input = v;
		open();
	}
</script>

<div class="landing">
	<div class="hero">
		<h1>GitViewer</h1>
		<p class="tagline">Watch any GitHub file evolve through its commit history.</p>

		<form
			class="repo-form"
			onsubmit={(e) => {
				e.preventDefault();
				open();
			}}
		>
			<input
				type="text"
				bind:value={input}
				placeholder="owner/repo or https://github.com/owner/repo"
				autofocus
				spellcheck="false"
			/>
			<button type="submit" class="primary">
				<span>Open</span>
				<ArrowRight size={16} />
			</button>
		</form>

		{#if error}
			<div class="error">{error}</div>
		{/if}

		<div class="examples">
			<span class="examples-label">Try:</span>
			{#each examples as ex}
				<button class="example" onclick={() => pick(ex.value)}>{ex.label}</button>
			{/each}
		</div>

		<div class="tips">
			<p>
				<kbd>Space</kbd> play · <kbd>←</kbd> <kbd>→</kbd> step · <kbd>S</kbd> toggle sidebar
			</p>
			<p class="muted">
				Public repos work without auth (60 req/hr limit). Add a token in the top-right for higher
				limits.
			</p>
		</div>
	</div>
</div>

<style>
	.landing {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 32px 16px;
	}
	.hero {
		max-width: 560px;
		width: 100%;
		text-align: center;
	}
	h1 {
		font-size: 40px;
		margin: 0 0 8px 0;
		letter-spacing: -0.02em;
	}
	.tagline {
		color: var(--text-dim);
		font-size: 16px;
		margin: 0 0 32px 0;
	}
	.repo-form {
		display: flex;
		gap: 8px;
		margin-bottom: 12px;
	}
	.repo-form input {
		flex: 1;
		font-size: 15px;
		padding: 10px 14px;
	}
	.repo-form button {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 10px 18px;
		font-size: 15px;
	}
	.error {
		background: rgba(248, 81, 73, 0.1);
		border: 1px solid var(--danger);
		color: var(--danger);
		padding: 8px 12px;
		border-radius: 6px;
		font-size: 13px;
		margin-bottom: 12px;
		text-align: left;
	}
	.examples {
		display: flex;
		gap: 8px;
		justify-content: center;
		flex-wrap: wrap;
		margin-bottom: 32px;
	}
	.examples-label {
		color: var(--text-dim);
		font-size: 13px;
		align-self: center;
	}
	.example {
		font-size: 12px;
		padding: 4px 10px;
		font-family: var(--font-mono);
	}
	.tips {
		font-size: 12px;
		color: var(--text-dim);
		line-height: 1.8;
	}
	.tips p {
		margin: 0;
	}
	.muted {
		opacity: 0.7;
	}
	kbd {
		font-family: var(--font-mono);
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 1px 6px;
		font-size: 11px;
	}
</style>
