<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import {
		listCommits,
		getRepoTree,
		getCommitDetail,
		shortSha,
		commitTitle,
		type CommitSummary,
		type RepoRef,
		type TreeEntry,
		type CommitFile
	} from '$lib/github';
	import {
		buildCommitInfo,
		computeChangedFolders,
		EMPTY_INFO,
		type CommitInfo
	} from '$lib/commitInfo';
	import { auth } from '$lib/token.svelte';
	import RepoSidebar from '$lib/components/RepoSidebar.svelte';
	import Scrubber from '$lib/components/Scrubber.svelte';
	import {
		PanelLeftClose,
		PanelLeftOpen,
		ExternalLink,
		FilePlus,
		FileMinus,
		FileEdit,
		FileSymlink,
		FileQuestion
	} from '@lucide/svelte';

	const repoRef = $derived<RepoRef>({ owner: page.params.owner!, repo: page.params.repo! });

	let commits = $state<CommitSummary[]>([]);
	let listError = $state<string | null>(null);
	let listLoading = $state(true);
	let nextPage = $state(2);
	let hasMore = $state(true);
	let loadingMore = $state(false);

	// Newest = 0; oldest = commits.length - 1.
	let currentIndex = $state(0);
	let sidebarVisible = $state(true);

	const treeCache = new Map<string, { tree: TreeEntry[]; truncated: boolean }>();
	let treeEntries = $state<TreeEntry[] | null>(null);
	let treeTruncated = $state(false);
	let treeLoading = $state(false);
	let treeError = $state<string | null>(null);

	const commitInfoCache = new Map<string, CommitInfo>();
	let currentInfo = $state<CommitInfo>(EMPTY_INFO);

	let playing = $state(false);
	let playSpeed = $state(1);
	const BASE_INTERVAL_MS = 900;
	let playTimer: ReturnType<typeof setInterval> | null = null;

	const currentCommit = $derived(commits[currentIndex]);
	const lastIndex = $derived(commits.length > 0 ? commits.length - 1 : 0);
	const scrubValue = $derived(lastIndex - currentIndex);
	const fileStatuses = $derived(currentInfo.statuses);
	const changedFolders = $derived(computeChangedFolders(currentInfo.statuses));
	const totalAdditions = $derived(currentInfo.files.reduce((acc, f) => acc + (f.additions ?? 0), 0));
	const totalDeletions = $derived(currentInfo.files.reduce((acc, f) => acc + (f.deletions ?? 0), 0));

	$effect(() => {
		void repoRef.owner;
		void repoRef.repo;
		commits = [];
		currentIndex = 0;
		nextPage = 2;
		hasMore = true;
		treeCache.clear();
		commitInfoCache.clear();
		treeEntries = null;
		currentInfo = EMPTY_INFO;
		stopPlay();
		void loadInitial();
	});

	async function loadInitial() {
		listLoading = true;
		listError = null;
		try {
			const result = await listCommits(repoRef, { token: auth.token, perPage: 50, page: 1 });
			commits = result;
			hasMore = result.length === 50;
			currentIndex = 0;
			if (result.length > 0) {
				void ensureTree(result[0].sha);
				void ensureCommitInfo(result[0].sha);
			}
		} catch (e) {
			listError = e instanceof Error ? e.message : String(e);
		} finally {
			listLoading = false;
		}
	}

	async function loadMore() {
		if (loadingMore || !hasMore) return;
		loadingMore = true;
		try {
			const more = await listCommits(repoRef, {
				token: auth.token,
				perPage: 50,
				page: nextPage
			});
			commits = [...commits, ...more];
			nextPage += 1;
			if (more.length < 50) hasMore = false;
		} catch (e) {
			listError = e instanceof Error ? e.message : String(e);
		} finally {
			loadingMore = false;
		}
	}

	async function ensureTree(sha: string) {
		const cached = treeCache.get(sha);
		if (cached) {
			treeEntries = cached.tree;
			treeTruncated = cached.truncated;
			treeLoading = false;
			treeError = null;
			return;
		}
		if (!treeEntries) treeLoading = true;
		try {
			const result = await getRepoTree(repoRef, sha, { token: auth.token });
			treeCache.set(sha, { tree: result.tree, truncated: result.truncated });
			if (currentCommit?.sha === sha) {
				treeEntries = result.tree;
				treeTruncated = result.truncated;
				treeError = null;
			}
		} catch (e) {
			if (!treeEntries) {
				treeError = e instanceof Error ? e.message : String(e);
			}
		} finally {
			treeLoading = false;
		}
	}

	async function ensureCommitInfo(sha: string) {
		const cached = commitInfoCache.get(sha);
		if (cached) {
			if (currentCommit?.sha === sha) currentInfo = cached;
			return;
		}
		try {
			const detail = await getCommitDetail(repoRef, sha, { token: auth.token });
			const info = buildCommitInfo(detail.files ?? []);
			commitInfoCache.set(sha, info);
			if (currentCommit?.sha === sha) currentInfo = info;
		} catch {
			commitInfoCache.set(sha, EMPTY_INFO);
			if (currentCommit?.sha === sha) currentInfo = EMPTY_INFO;
		}
	}

	$effect(() => {
		if (!currentCommit) return;
		void ensureCommitInfo(currentCommit.sha);
		if (!playing || playSpeed <= 2) {
			void ensureTree(currentCommit.sha);
		}
	});

	function setScrubValue(v: number) {
		const clamped = Math.max(0, Math.min(lastIndex, v));
		currentIndex = lastIndex - clamped;
		if (playing) stopPlay();
	}

	function step(delta: number) {
		setScrubValue(scrubValue + delta);
	}

	function startPlay() {
		if (commits.length < 2) return;
		if (currentIndex === 0) currentIndex = lastIndex;
		playing = true;
		const interval = BASE_INTERVAL_MS / playSpeed;
		playTimer = setInterval(() => {
			if (currentIndex <= 0) {
				stopPlay();
				return;
			}
			currentIndex -= 1;
		}, interval);
	}

	function stopPlay() {
		playing = false;
		if (playTimer) {
			clearInterval(playTimer);
			playTimer = null;
		}
	}

	function togglePlay() {
		if (playing) stopPlay();
		else startPlay();
	}

	function setSpeed(s: number) {
		playSpeed = s;
		if (playing) {
			stopPlay();
			startPlay();
		}
	}

	onDestroy(stopPlay);

	function pickPath(path: string, type: 'tree' | 'blob') {
		if (type !== 'blob') return;
		goToFile(path);
	}

	function goToFile(path: string) {
		const encoded = path
			.split('/')
			.map((seg) => encodeURIComponent(seg))
			.join('/');
		goto(`/${repoRef.owner}/${repoRef.repo}/file/${encoded}`);
	}

	function selectCommit(i: number) {
		if (i >= 0 && i < commits.length) {
			currentIndex = i;
			if (playing) stopPlay();
		}
	}

	function onKey(e: KeyboardEvent) {
		const tag = (e.target as HTMLElement | null)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA') return;
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			step(-1);
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			step(1);
		} else if (e.key === 'Home') {
			e.preventDefault();
			setScrubValue(0);
		} else if (e.key === 'End') {
			e.preventDefault();
			setScrubValue(lastIndex);
		} else if (e.key === ' ' || e.code === 'Space') {
			e.preventDefault();
			togglePlay();
		} else if (e.key === 's' || e.key === 'S') {
			sidebarVisible = !sidebarVisible;
		}
	}

	const dateStr = $derived(
		currentCommit?.commit.author?.date
			? new Date(currentCommit.commit.author.date).toLocaleString()
			: ''
	);

	type IconProps = { size?: number; class?: string };
	function iconFor(status: CommitFile['status']): typeof FilePlus {
		switch (status) {
			case 'added':
				return FilePlus;
			case 'removed':
				return FileMinus;
			case 'modified':
			case 'changed':
				return FileEdit;
			case 'renamed':
			case 'copied':
				return FileSymlink;
			default:
				return FileQuestion;
		}
	}
	function colorClassFor(status: CommitFile['status']): string {
		switch (status) {
			case 'added':
				return 'add';
			case 'removed':
				return 'del';
			case 'modified':
			case 'changed':
				return 'mod';
			case 'renamed':
			case 'copied':
				return 'ren';
			default:
				return 'mod';
		}
	}
	function letterFor(status: CommitFile['status']): string {
		switch (status) {
			case 'added':
				return 'A';
			case 'removed':
				return 'D';
			case 'modified':
			case 'changed':
				return 'M';
			case 'renamed':
				return 'R';
			case 'copied':
				return 'C';
			default:
				return '?';
		}
	}
</script>

<svelte:head>
	<title>{repoRef.owner}/{repoRef.repo} — GitViewer</title>
</svelte:head>

<svelte:window onkeydown={onKey} />

<div class="page">
	<div class="topbar">
		<button
			class="icon-btn"
			onclick={() => (sidebarVisible = !sidebarVisible)}
			title="Toggle sidebar (S)"
			aria-label="Toggle sidebar"
		>
			{#if sidebarVisible}
				<PanelLeftClose size={16} />
			{:else}
				<PanelLeftOpen size={16} />
			{/if}
		</button>
		<a
			href="https://github.com/{repoRef.owner}/{repoRef.repo}"
			target="_blank"
			rel="noreferrer noopener"
			class="repo-label"
		>
			<span>{repoRef.owner}/{repoRef.repo}</span>
			<ExternalLink size={12} />
		</a>
		<div class="spacer"></div>
		{#if currentCommit}
			<a
				href={currentCommit.html_url}
				target="_blank"
				rel="noreferrer noopener"
				class="github-link"
				title="View this commit on GitHub"
			>
				<span>{shortSha(currentCommit.sha)}</span>
				<ExternalLink size={12} />
			</a>
		{/if}
	</div>

	{#if commits.length > 0}
		<Scrubber
			min={0}
			max={lastIndex}
			value={scrubValue}
			onChange={setScrubValue}
			{playing}
			canPlay={commits.length > 1}
			onTogglePlay={togglePlay}
			speed={playSpeed}
			onSpeedChange={setSpeed}
			{hasMore}
			onLoadMore={loadMore}
			{loadingMore}
		/>
		<div class="commit-meta">
			<div class="commit-title">{commitTitle(currentCommit?.commit.message ?? '')}</div>
			<div class="commit-sub">
				<span class="counter">commit {scrubValue + 1} of {commits.length}{hasMore ? '+' : ''}</span>
				<span class="sep">·</span>
				<span>{currentCommit?.commit.author?.name ?? 'unknown'}</span>
				<span class="sep">·</span>
				<span>{dateStr}</span>
				{#if currentInfo.files.length > 0}
					<span class="sep">·</span>
					<span class="counter">
						{currentInfo.files.length} file{currentInfo.files.length === 1 ? '' : 's'}
					</span>
					{#if totalAdditions > 0}
						<span class="stat-add">+{totalAdditions}</span>
					{/if}
					{#if totalDeletions > 0}
						<span class="stat-del">−{totalDeletions}</span>
					{/if}
				{/if}
			</div>
		</div>
	{/if}

	<div class="body">
		{#if sidebarVisible}
			<RepoSidebar
				{commits}
				{currentIndex}
				onSelectCommit={selectCommit}
				onLoadMore={loadMore}
				{loadingMore}
				{hasMore}
				{treeEntries}
				{treeLoading}
				{treeError}
				{treeTruncated}
				{fileStatuses}
				{changedFolders}
				onPickPath={pickPath}
			/>
		{/if}

		<div class="main">
			{#if listLoading}
				<div class="centered">Loading {repoRef.owner}/{repoRef.repo}…</div>
			{:else if listError}
				<div class="centered error">
					<strong>Couldn't load this repo.</strong>
					<p>{listError}</p>
					<button onclick={() => loadInitial()}>Retry</button>
				</div>
			{:else if commits.length === 0}
				<div class="centered">No commits found in this repo.</div>
			{:else if currentInfo.files.length === 0}
				<div class="centered">
					<p>Loading commit details…</p>
					<p class="muted">Drag the timeline above, or hit <kbd>Space</kbd> to play.</p>
				</div>
			{:else}
				<div class="files-header">
					Files changed in this commit
				</div>
				<ul class="files-list">
					{#each currentInfo.files as file (file.filename)}
						{@const Ico = iconFor(file.status)}
						{@const cls = colorClassFor(file.status)}
						<li>
							<button
								class="file-row"
								onclick={() => goToFile(file.filename)}
								title="Open {file.filename} in viewer"
							>
								<span class="badge {cls}">{letterFor(file.status)}</span>
								<Ico size={14} class="row-icon" />
								<span class="path">{file.filename}</span>
								{#if file.status === 'renamed' && file.previous_filename}
									<span class="renamed-from">← {file.previous_filename}</span>
								{/if}
								<span class="row-stats">
									{#if file.additions > 0}<span class="stat-add">+{file.additions}</span>{/if}
									{#if file.deletions > 0}<span class="stat-del">−{file.deletions}</span>{/if}
								</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
</div>

<style>
	.page {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
	}
	.topbar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-elev);
		flex-shrink: 0;
	}
	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 30px;
		padding: 0;
	}
	.repo-label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: var(--font-mono);
		font-size: 13px;
		padding: 4px 8px;
		border-radius: 6px;
		color: var(--text-dim);
	}
	.repo-label:hover {
		text-decoration: none;
		color: var(--accent);
		background: var(--bg-elev-2);
	}
	.spacer {
		flex: 1;
	}
	.github-link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--text-dim);
		padding: 4px 8px;
		border-radius: 6px;
	}
	.github-link:hover {
		color: var(--accent);
		background: var(--bg-elev-2);
		text-decoration: none;
	}
	.commit-meta {
		padding: 8px 16px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-elev);
		flex-shrink: 0;
	}
	.commit-title {
		font-size: 13px;
		font-weight: 500;
		margin-bottom: 2px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.commit-sub {
		font-size: 11px;
		color: var(--text-dim);
		display: flex;
		gap: 6px;
		align-items: center;
		flex-wrap: wrap;
	}
	.counter {
		font-variant-numeric: tabular-nums;
		color: var(--text);
	}
	.sep {
		color: var(--border);
	}
	.stat-add {
		color: var(--success);
		font-variant-numeric: tabular-nums;
	}
	.stat-del {
		color: var(--danger);
		font-variant-numeric: tabular-nums;
	}
	.body {
		flex: 1;
		display: flex;
		min-height: 0;
		overflow: hidden;
	}
	.main {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
		overflow: hidden;
	}
	.files-header {
		padding: 10px 16px;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-dim);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}
	.files-list {
		list-style: none;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		flex: 1;
	}
	.files-list li {
		margin: 0;
	}
	.file-row {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		text-align: left;
		background: transparent;
		border: none;
		border-bottom: 1px solid var(--border);
		border-radius: 0;
		padding: 8px 16px;
		color: var(--text);
		font-family: var(--font-mono);
		font-size: 12.5px;
	}
	.file-row:hover {
		background: var(--bg-elev-2);
	}
	.file-row :global(.row-icon) {
		color: var(--text-dim);
		flex-shrink: 0;
	}
	.badge {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		border-radius: 3px;
		font-size: 10px;
		font-weight: 700;
		color: #fff;
		font-family: var(--font-mono);
	}
	.badge.add {
		background: var(--success);
	}
	.badge.mod {
		background: #d29922;
	}
	.badge.ren {
		background: var(--accent-strong);
	}
	.badge.del {
		background: var(--danger);
	}
	.path {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.renamed-from {
		font-size: 11px;
		color: var(--text-dim);
		flex-shrink: 0;
	}
	.row-stats {
		display: inline-flex;
		gap: 6px;
		flex-shrink: 0;
	}
	.centered {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 64px 24px;
		color: var(--text-dim);
		text-align: center;
	}
	.centered.error strong {
		color: var(--danger);
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
