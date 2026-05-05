export type CommitSummary = {
	sha: string;
	html_url: string;
	commit: {
		message: string;
		author: { name: string; email: string; date: string } | null;
		committer: { name: string; email: string; date: string } | null;
	};
	author: { login: string; avatar_url: string } | null;
};

export type RepoRef = { owner: string; repo: string };

export class GitHubError extends Error {
	status: number;
	rateLimited: boolean;
	constructor(message: string, status: number, rateLimited = false) {
		super(message);
		this.status = status;
		this.rateLimited = rateLimited;
	}
}

export function parseRepoInput(raw: string): RepoRef {
	const input = raw.trim();
	if (!input) throw new Error('Enter a GitHub repo.');

	const sshMatch = input.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
	if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };

	let urlLike = input;
	if (!/^https?:\/\//.test(urlLike) && urlLike.includes('/') && !urlLike.startsWith('/')) {
		const parts = urlLike.split('/').filter(Boolean);
		if (parts.length === 2 && !parts[0].includes('.')) {
			return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') };
		}
		urlLike = 'https://' + urlLike;
	}

	try {
		const url = new URL(urlLike);
		if (!/github\.com$/i.test(url.hostname)) {
			throw new Error('Only github.com repos are supported.');
		}
		const segments = url.pathname.split('/').filter(Boolean);
		if (segments.length < 2) throw new Error('URL is missing owner/repo.');
		return { owner: segments[0], repo: segments[1].replace(/\.git$/, '') };
	} catch (err) {
		if (err instanceof Error && err.message.startsWith('Only github')) throw err;
		throw new Error(`Couldn't parse "${raw}" as a GitHub repo.`);
	}
}

function buildHeaders(accept: string, token: string): HeadersInit {
	const headers: Record<string, string> = {
		Accept: accept,
		'X-GitHub-Api-Version': '2022-11-28'
	};
	if (token) headers.Authorization = `Bearer ${token}`;
	return headers;
}

async function handleError(res: Response): Promise<never> {
	const remaining = res.headers.get('x-ratelimit-remaining');
	const rateLimited = res.status === 403 && remaining === '0';
	let detail = '';
	try {
		const body = await res.json();
		if (body && typeof body.message === 'string') detail = body.message;
	} catch {
		/* ignore */
	}
	if (rateLimited) {
		throw new GitHubError(
			`GitHub rate limit hit (60 req/hr unauthenticated). Add a Personal Access Token in Settings to lift the limit.`,
			res.status,
			true
		);
	}
	if (res.status === 404) {
		throw new GitHubError(
			`Repo not found. If it's private, you'll need a Personal Access Token in Settings.`,
			404
		);
	}
	throw new GitHubError(detail || `GitHub API ${res.status} ${res.statusText}`, res.status);
}

export async function listCommits(
	{ owner, repo }: RepoRef,
	opts: { token?: string; perPage?: number; page?: number; path?: string } = {}
): Promise<CommitSummary[]> {
	const { token = '', perPage = 50, page = 1, path } = opts;
	const url = new URL(`https://api.github.com/repos/${owner}/${repo}/commits`);
	url.searchParams.set('per_page', String(perPage));
	url.searchParams.set('page', String(page));
	if (path) url.searchParams.set('path', path);
	const res = await fetch(url, { headers: buildHeaders('application/vnd.github+json', token) });
	if (!res.ok) await handleError(res);
	return (await res.json()) as CommitSummary[];
}

export type CommitFile = {
	filename: string;
	previous_filename?: string;
	status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
	patch?: string;
	additions: number;
	deletions: number;
	changes: number;
};

type CommitDetail = CommitSummary & { files?: CommitFile[] };

export async function getCommitDetail(
	{ owner, repo }: RepoRef,
	sha: string,
	opts: { token?: string } = {}
): Promise<CommitDetail> {
	const { token = '' } = opts;
	const url = `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`;
	const res = await fetch(url, { headers: buildHeaders('application/vnd.github+json', token) });
	if (!res.ok) await handleError(res);
	return (await res.json()) as CommitDetail;
}

/**
 * Extract patches from a commit for everything at or under `path` and wrap
 * them with the `diff --git` headers that diff2html expects. Works for both
 * file paths (one match) and directory paths (all files under that dir).
 * Returns `null` when nothing under that path changed in this commit.
 */
export async function getCommitPathDiff(
	repoRef: RepoRef,
	sha: string,
	path: string,
	opts: { token?: string } = {}
): Promise<{ diff: string; files: CommitFile[] } | null> {
	const detail = await getCommitDetail(repoRef, sha, opts);
	const all = detail.files ?? [];
	const matched = all.filter((f) => matchesPath(f, path));
	if (matched.length === 0) return null;
	const diff = matched
		.map((f) => buildDiffHeader(f) + (f.patch ? f.patch + '\n' : ''))
		.join('');
	return { diff, files: matched };
}

function matchesPath(file: CommitFile, path: string): boolean {
	const prefix = path.endsWith('/') ? path : path + '/';
	return (
		file.filename === path ||
		file.filename.startsWith(prefix) ||
		file.previous_filename === path ||
		(file.previous_filename?.startsWith(prefix) ?? false)
	);
}

function buildDiffHeader(file: CommitFile): string {
	const newPath = file.filename;
	const oldPath = file.previous_filename ?? file.filename;
	const lines: string[] = [`diff --git a/${oldPath} b/${newPath}`];
	if (file.status === 'added') {
		lines.push('--- /dev/null');
		lines.push(`+++ b/${newPath}`);
	} else if (file.status === 'removed') {
		lines.push(`--- a/${oldPath}`);
		lines.push('+++ /dev/null');
	} else {
		lines.push(`--- a/${oldPath}`);
		lines.push(`+++ b/${newPath}`);
	}
	return lines.join('\n') + '\n';
}

export type AnnotatedLine =
	| { type: 'context'; lineNo: number; text: string }
	| { type: 'added'; lineNo: number; text: string }
	| { type: 'removed'; oldLineNo: number; text: string };

/**
 * Take a file's content at commit SHA and the unified-diff patch describing
 * what changed in that commit, and produce a flat list of lines ready to
 * render. Removed lines are interleaved at the position they were removed
 * from. Added lines retain their new-side line number; removed lines carry
 * the old-side line number for reference.
 */
export function annotateContent(content: string, patch: string): AnnotatedLine[] {
	const lines = content.split('\n');
	if (!patch) {
		return lines.map((text, i) => ({ type: 'context' as const, lineNo: i + 1, text }));
	}

	// removedBefore: new-line N → list of {oldLineNo, text} that should appear before line N.
	type Removed = { oldLineNo: number; text: string };
	const removedBefore = new Map<number, Removed[]>();
	const removedAtEnd: Removed[] = [];
	const addedSet = new Set<number>();

	let pending: Removed[] = [];
	let nextNew = 1;
	let nextOld = 1;
	let inHunk = false;

	const hunkHeader = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

	for (const raw of patch.split('\n')) {
		const m = raw.match(hunkHeader);
		if (m) {
			if (pending.length > 0) {
				const target = nextNew;
				if (!removedBefore.has(target)) removedBefore.set(target, []);
				removedBefore.get(target)!.push(...pending);
				pending = [];
			}
			nextOld = parseInt(m[1], 10);
			nextNew = parseInt(m[2], 10);
			inHunk = true;
			continue;
		}
		if (!inHunk) continue;
		if (
			raw.startsWith('diff --git') ||
			raw.startsWith('+++') ||
			raw.startsWith('---') ||
			raw.startsWith('index ') ||
			raw.startsWith('new file') ||
			raw.startsWith('deleted file') ||
			raw.startsWith('similarity ') ||
			raw.startsWith('rename ')
		) {
			inHunk = false;
			continue;
		}
		if (raw.startsWith('+')) {
			if (pending.length > 0) {
				const target = nextNew;
				if (!removedBefore.has(target)) removedBefore.set(target, []);
				removedBefore.get(target)!.push(...pending);
				pending = [];
			}
			addedSet.add(nextNew);
			nextNew++;
		} else if (raw.startsWith('-')) {
			pending.push({ oldLineNo: nextOld, text: raw.slice(1) });
			nextOld++;
		} else if (raw.startsWith(' ')) {
			if (pending.length > 0) {
				const target = nextNew;
				if (!removedBefore.has(target)) removedBefore.set(target, []);
				removedBefore.get(target)!.push(...pending);
				pending = [];
			}
			nextNew++;
			nextOld++;
		}
		// '\ No newline at end of file' and blank lines: no advance.
	}
	if (pending.length > 0) {
		removedAtEnd.push(...pending);
	}

	const out: AnnotatedLine[] = [];
	for (let i = 0; i < lines.length; i++) {
		const lineNo = i + 1;
		const before = removedBefore.get(lineNo);
		if (before) {
			for (const r of before) out.push({ type: 'removed', oldLineNo: r.oldLineNo, text: r.text });
		}
		out.push({
			type: addedSet.has(lineNo) ? 'added' : 'context',
			lineNo,
			text: lines[i]
		});
	}
	for (const r of removedAtEnd) {
		out.push({ type: 'removed', oldLineNo: r.oldLineNo, text: r.text });
	}
	return out;
}

/**
 * Parse a unified diff string and extract the new-side filenames it touches.
 * Used to populate the file picker in the slideshow.
 */
export function extractFilenames(diff: string): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	const re = /^\+\+\+ b\/(.+)$/gm;
	let m: RegExpExecArray | null;
	while ((m = re.exec(diff)) !== null) {
		const name = m[1].trim();
		if (name && name !== 'dev/null' && !seen.has(name)) {
			seen.add(name);
			out.push(name);
		}
	}
	// Also pick up additions where +++ b/<path> exists but capture missed
	// (e.g. /dev/null new files captured via diff --git a/foo b/foo).
	const reGit = /^diff --git a\/.+ b\/(.+)$/gm;
	while ((m = reGit.exec(diff)) !== null) {
		const name = m[1].trim();
		if (name && !seen.has(name)) {
			seen.add(name);
			out.push(name);
		}
	}
	return out.sort();
}

export async function getCommitDiff(
	{ owner, repo }: RepoRef,
	sha: string,
	opts: { token?: string } = {}
): Promise<string> {
	const { token = '' } = opts;
	const url = `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`;
	const res = await fetch(url, { headers: buildHeaders('application/vnd.github.diff', token) });
	if (!res.ok) await handleError(res);
	return await res.text();
}

export type FileAtRef = {
	content: string;
	size: number;
	sha: string;
	encoding: 'utf-8' | 'binary';
};

/**
 * Fetch a file's content at a specific ref (commit SHA or branch). Decodes
 * the base64 payload that the GitHub Contents API returns. Returns null if
 * the path does not exist at that ref. Throws when the path is a directory
 * or when the file is too large for the Contents API (>1MB).
 */
export async function getFileAtRef(
	{ owner, repo }: RepoRef,
	path: string,
	ref: string,
	opts: { token?: string } = {}
): Promise<FileAtRef | null> {
	const { token = '' } = opts;
	const cleanPath = path
		.split('/')
		.map((seg) => encodeURIComponent(seg))
		.join('/');
	const url = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath}?ref=${encodeURIComponent(ref)}`;
	const res = await fetch(url, { headers: buildHeaders('application/vnd.github+json', token) });
	if (res.status === 404) return null;
	if (!res.ok) await handleError(res);
	const body = (await res.json()) as
		| {
				type: 'file';
				size: number;
				sha: string;
				content: string;
				encoding: string;
		  }
		| { type: 'dir' | 'symlink' | 'submodule' }
		| Array<unknown>;
	if (Array.isArray(body)) {
		throw new GitHubError(`"${path}" is a directory at this commit, not a file.`, 200);
	}
	if (body.type !== 'file') {
		throw new GitHubError(`"${path}" is a ${body.type}, not a regular file.`, 200);
	}
	if (body.encoding !== 'base64') {
		throw new GitHubError(`Unexpected encoding "${body.encoding}" for ${path}.`, 200);
	}
	if (!body.content) {
		throw new GitHubError(
			`File too large to fetch via the Contents API (${body.size} bytes). Open it on GitHub.`,
			200
		);
	}
	const decoded = decodeBase64Utf8(body.content);
	const isBinary = looksBinary(decoded);
	return {
		content: decoded,
		size: body.size,
		sha: body.sha,
		encoding: isBinary ? 'binary' : 'utf-8'
	};
}

function decodeBase64Utf8(b64: string): string {
	const cleaned = b64.replace(/\n/g, '');
	const bytes = Uint8Array.from(atob(cleaned), (c) => c.charCodeAt(0));
	return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function looksBinary(s: string): boolean {
	// A NUL byte in the first 8KB is the simplest binary heuristic.
	const sample = s.slice(0, 8192);
	return sample.includes(' ');
}

export type TreeEntry = {
	path: string;
	type: 'blob' | 'tree' | 'commit';
	size?: number;
	sha: string;
};

export type RepoTree = {
	sha: string;
	tree: TreeEntry[];
	truncated: boolean;
};

/**
 * Fetch the recursive git tree at the given ref (commit SHA or branch name).
 * Returns a flat list of every blob and tree entry. The `truncated` flag is
 * set by GitHub when the tree is too large to return in one call (~100k
 * entries) — for those repos a path-by-path browser would be more reliable.
 */
export async function getRepoTree(
	{ owner, repo }: RepoRef,
	ref: string,
	opts: { token?: string } = {}
): Promise<RepoTree> {
	const { token = '' } = opts;
	const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${ref}?recursive=1`;
	const res = await fetch(url, { headers: buildHeaders('application/vnd.github+json', token) });
	if (!res.ok) await handleError(res);
	return (await res.json()) as RepoTree;
}

export function shortSha(sha: string): string {
	return sha.slice(0, 7);
}

export function commitTitle(message: string): string {
	const firstLine = message.split('\n', 1)[0] ?? '';
	return firstLine.length > 120 ? firstLine.slice(0, 117) + '…' : firstLine;
}
