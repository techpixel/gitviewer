<script lang="ts">
	import type { CommitSummary, CommitFile, TreeEntry } from '$lib/github';
	import { commitTitle, shortSha } from '$lib/github';
	import FileTree, { buildTree, type TreeNode } from './FileTree.svelte';
	import { Files, GitCommit, Search } from '@lucide/svelte';

	type Props = {
		commits: CommitSummary[];
		currentIndex: number;
		onSelectCommit: (index: number) => void;
		onLoadMore?: () => void;
		loadingMore?: boolean;
		hasMore?: boolean;
		treeEntries: TreeEntry[] | null;
		treeLoading: boolean;
		treeError: string | null;
		treeTruncated: boolean;
		activePath?: string;
		fileStatuses?: Map<string, CommitFile>;
		changedFolders?: Set<string>;
		onPickPath: (path: string, type: 'tree' | 'blob') => void;
	};
	let {
		commits,
		currentIndex,
		onSelectCommit,
		onLoadMore,
		loadingMore = false,
		hasMore = false,
		treeEntries,
		treeLoading,
		treeError,
		treeTruncated,
		activePath = '',
		fileStatuses,
		changedFolders,
		onPickPath
	}: Props = $props();

	let tab = $state<'files' | 'commits'>('files');
	let filter = $state('');

	const treeNodes = $derived<TreeNode[]>(treeEntries ? buildTree(treeEntries) : []);

	function relativeTime(iso: string | undefined | null): string {
		if (!iso) return '';
		const date = new Date(iso);
		const diffMs = Date.now() - date.getTime();
		const sec = Math.floor(diffMs / 1000);
		if (sec < 60) return `${sec}s ago`;
		const min = Math.floor(sec / 60);
		if (min < 60) return `${min}m ago`;
		const hr = Math.floor(min / 60);
		if (hr < 24) return `${hr}h ago`;
		const days = Math.floor(hr / 24);
		if (days < 30) return `${days}d ago`;
		const months = Math.floor(days / 30);
		if (months < 12) return `${months}mo ago`;
		return `${Math.floor(months / 12)}y ago`;
	}
</script>

<aside class="sidebar">
	<div class="tabs" role="tablist">
		<button
			role="tab"
			aria-selected={tab === 'files'}
			class:active={tab === 'files'}
			onclick={() => (tab = 'files')}
		>
			<Files size={14} />
			<span>Files</span>
		</button>
		<button
			role="tab"
			aria-selected={tab === 'commits'}
			class:active={tab === 'commits'}
			onclick={() => (tab = 'commits')}
		>
			<GitCommit size={14} />
			<span>Commits</span>
			<span class="badge">{commits.length}{hasMore ? '+' : ''}</span>
		</button>
	</div>

	{#if tab === 'files'}
		<div class="filter-row">
			<Search size={14} class="filter-icon" />
			<input
				type="text"
				placeholder="Filter files…"
				bind:value={filter}
				autocomplete="off"
				spellcheck="false"
			/>
		</div>
		<div class="scroll">
			{#if treeLoading && !treeEntries}
				<div class="hint">Loading tree…</div>
			{:else if treeError}
				<div class="hint error">{treeError}</div>
			{:else if !treeEntries || treeEntries.length === 0}
				<div class="hint">No files.</div>
			{:else}
				<FileTree
					nodes={treeNodes}
					{filter}
					onPick={onPickPath}
					{activePath}
					{fileStatuses}
					{changedFolders}
				/>
				{#if treeTruncated}
					<div class="hint">
						<em>Tree truncated by GitHub (very large repo).</em>
					</div>
				{/if}
			{/if}
		</div>
	{:else}
		<div class="scroll">
			<ul class="commit-list">
				{#each commits as commit, i (commit.sha)}
					<li>
						<button
							class="commit-row"
							class:active={i === currentIndex}
							onclick={() => onSelectCommit(i)}
							title={commit.commit.message}
						>
							<div class="row-top">
								<span class="sha">{shortSha(commit.sha)}</span>
								<span class="when">{relativeTime(commit.commit.author?.date)}</span>
							</div>
							<div class="title">{commitTitle(commit.commit.message)}</div>
							<div class="author">{commit.commit.author?.name ?? 'unknown'}</div>
						</button>
					</li>
				{/each}
			</ul>
			{#if hasMore && onLoadMore}
				<div class="load-more">
					<button onclick={onLoadMore} disabled={loadingMore}>
						{loadingMore ? 'Loading…' : 'Load older commits'}
					</button>
				</div>
			{/if}
		</div>
	{/if}
</aside>

<style>
	.sidebar {
		width: 320px;
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--border);
		background: var(--bg-elev);
		overflow: hidden;
	}
	.tabs {
		display: flex;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.tabs button {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		background: transparent;
		border: none;
		border-radius: 0;
		padding: 10px 12px;
		font-size: 13px;
		color: var(--text-dim);
		cursor: pointer;
		border-bottom: 2px solid transparent;
	}
	.tabs button.active {
		color: var(--text);
		border-bottom-color: var(--accent);
	}
	.tabs button:hover:not(.active) {
		background: var(--bg-elev-2);
		color: var(--text);
	}
	.badge {
		background: var(--bg-elev-2);
		color: var(--text-dim);
		font-size: 11px;
		padding: 1px 6px;
		border-radius: 999px;
		font-variant-numeric: tabular-nums;
	}
	.filter-row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 8px;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.filter-row :global(.filter-icon) {
		color: var(--text-dim);
		flex-shrink: 0;
	}
	.filter-row input {
		flex: 1;
		font-size: 12px;
		padding: 4px 0;
		border: none;
		background: transparent;
	}
	.filter-row input:focus {
		outline: none;
	}
	.scroll {
		flex: 1;
		overflow-y: auto;
		min-height: 0;
	}
	.hint {
		padding: 16px;
		font-size: 12px;
		color: var(--text-dim);
		text-align: center;
	}
	.hint.error {
		color: var(--danger);
	}
	.commit-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.commit-row {
		display: block;
		width: 100%;
		text-align: left;
		background: transparent;
		border: none;
		border-bottom: 1px solid var(--border);
		border-radius: 0;
		padding: 10px 16px;
		color: var(--text);
	}
	.commit-row:hover {
		background: var(--bg-elev-2);
	}
	.commit-row.active {
		background: var(--bg-elev-2);
		box-shadow: inset 3px 0 0 var(--accent);
	}
	.row-top {
		display: flex;
		justify-content: space-between;
		font-size: 11px;
		color: var(--text-dim);
		margin-bottom: 4px;
		font-family: var(--font-mono);
	}
	.sha {
		color: var(--accent);
	}
	.title {
		font-size: 13px;
		line-height: 1.4;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-bottom: 2px;
	}
	.author {
		font-size: 11px;
		color: var(--text-dim);
	}
	.load-more {
		padding: 12px;
		border-top: 1px solid var(--border);
	}
	.load-more button {
		width: 100%;
	}
</style>
