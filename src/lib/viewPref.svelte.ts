import { browser } from '$app/environment';

const STORAGE_KEY = 'gitviewer:diffFormat';
type Format = 'line-by-line' | 'side-by-side';

function read(): Format {
	if (!browser) return defaultFormat();
	const v = localStorage.getItem(STORAGE_KEY);
	return v === 'line-by-line' || v === 'side-by-side' ? v : defaultFormat();
}

function defaultFormat(): Format {
	if (!browser) return 'line-by-line';
	return window.matchMedia('(min-width: 1200px)').matches ? 'side-by-side' : 'line-by-line';
}

export const viewPref = $state({ format: read() });

export function setFormat(f: Format) {
	viewPref.format = f;
	if (browser) localStorage.setItem(STORAGE_KEY, f);
}
