import { browser } from '$app/environment';

const STORAGE_KEY = 'gitviewer:token';

function read(): string {
	if (!browser) return '';
	try {
		return localStorage.getItem(STORAGE_KEY) ?? '';
	} catch {
		return '';
	}
}

function write(value: string) {
	if (!browser) return;
	try {
		if (value) localStorage.setItem(STORAGE_KEY, value);
		else localStorage.removeItem(STORAGE_KEY);
	} catch {
		/* ignore quota / private mode */
	}
}

export const auth = $state({ token: read() });

export function setToken(value: string) {
	auth.token = value.trim();
	write(auth.token);
}

export function clearToken() {
	auth.token = '';
	write('');
}
