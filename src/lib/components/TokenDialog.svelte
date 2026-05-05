<script lang="ts">
	import { auth, setToken, clearToken } from '$lib/token.svelte';

	type Props = { open: boolean; onClose: () => void };
	let { open, onClose }: Props = $props();

	let draft = $state('');

	$effect(() => {
		if (open) draft = auth.token;
	});

	function save() {
		setToken(draft);
		onClose();
	}

	function clear() {
		clearToken();
		draft = '';
		onClose();
	}

	function onKeyDown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') onClose();
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
	}
</script>

<svelte:window onkeydown={onKeyDown} />

{#if open}
	<div
		class="backdrop"
		onclick={onClose}
		onkeydown={(e) => e.key === 'Escape' && onClose()}
		role="button"
		tabindex="-1"
		aria-label="Close dialog"
	></div>
	<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="tok-title">
		<h3 id="tok-title">GitHub Personal Access Token</h3>
		<p class="hint">
			Optional. Lifts the 60 req/hr unauth rate limit and lets you load private repos. Stored in
			your browser's localStorage only — never sent anywhere except api.github.com.
		</p>
		<p class="hint">
			Create one at
			<a
				href="https://github.com/settings/tokens?type=beta"
				target="_blank"
				rel="noreferrer noopener">github.com/settings/tokens</a
			>
			(fine-grained, read-only Contents permission is enough).
		</p>
		<input
			type="password"
			placeholder="ghp_… or github_pat_…"
			bind:value={draft}
			autocomplete="off"
			spellcheck="false"
		/>
		<div class="actions">
			<button onclick={clear} disabled={!auth.token}>Clear</button>
			<div class="spacer"></div>
			<button onclick={onClose}>Cancel</button>
			<button class="primary" onclick={save}>Save</button>
		</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 100;
		border: none;
	}
	.dialog {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 101;
		background: var(--bg-elev);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 20px;
		width: min(440px, 90vw);
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
	}
	h3 {
		margin: 0 0 12px 0;
		font-size: 16px;
	}
	.hint {
		font-size: 12px;
		color: var(--text-dim);
		margin: 0 0 12px 0;
		line-height: 1.5;
	}
	input {
		width: 100%;
		font-family: var(--font-mono);
		font-size: 12px;
		margin-bottom: 16px;
	}
	.actions {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.spacer {
		flex: 1;
	}
</style>
