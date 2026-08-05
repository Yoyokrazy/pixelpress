import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'pixelpress:theme';

function readStoredTheme(): ThemeChoice {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === 'light' || stored === 'dark' || stored === 'system') {
			return stored;
		}
	} catch {
		// localStorage can be unavailable in private browsing modes.
	}
	return 'system';
}

function prefersDark(): boolean {
	return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

export function useTheme() {
	const [theme, setThemeState] = useState<ThemeChoice>(readStoredTheme);
	const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
		readStoredTheme() === 'system' ? (prefersDark() ? 'dark' : 'light') : (readStoredTheme() as 'light' | 'dark'),
	);

	useEffect(() => {
		const apply = () => {
			const next = theme === 'system' ? (prefersDark() ? 'dark' : 'light') : theme;
			setResolved(next);
			document.documentElement.classList.toggle('dark', next === 'dark');
		};

		apply();

		if (theme !== 'system' || typeof matchMedia !== 'function') {
			return;
		}
		const query = matchMedia('(prefers-color-scheme: dark)');
		query.addEventListener('change', apply);
		return () => query.removeEventListener('change', apply);
	}, [theme]);

	const setTheme = useCallback((next: ThemeChoice) => {
		setThemeState(next);
		try {
			localStorage.setItem(STORAGE_KEY, next);
		} catch {
			// Ignore storage failures; the in-memory state still applies.
		}
	}, []);

	const cycleTheme = useCallback(() => {
		setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light');
	}, [setTheme, theme]);

	return { theme, resolvedTheme: resolved, setTheme, cycleTheme };
}
