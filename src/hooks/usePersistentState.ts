import { useCallback, useEffect, useState } from 'react';

/**
 * State backed by localStorage. Stored values are shallow-merged over the
 * defaults so new settings introduced by an update still get a sane value.
 */
export function usePersistentState<T extends object>(
	key: string,
	defaults: T,
): [T, (update: Partial<T> | ((current: T) => Partial<T>)) => void, () => void] {
	const [value, setValue] = useState<T>(() => {
		try {
			const raw = localStorage.getItem(key);
			if (!raw) {
				return defaults;
			}
			const parsed = JSON.parse(raw) as unknown;
			if (typeof parsed !== 'object' || parsed === null) {
				return defaults;
			}
			return { ...defaults, ...(parsed as Partial<T>) };
		} catch {
			return defaults;
		}
	});

	useEffect(() => {
		try {
			localStorage.setItem(key, JSON.stringify(value));
		} catch {
			// Quota or private-mode errors are non-fatal.
		}
	}, [key, value]);

	const update = useCallback((patch: Partial<T> | ((current: T) => Partial<T>)) => {
		setValue((current) => ({
			...current,
			...(typeof patch === 'function' ? patch(current) : patch),
		}));
	}, []);

	const reset = useCallback(() => {
		setValue(defaults);
		try {
			localStorage.removeItem(key);
		} catch {
			// Ignore storage failures.
		}
		// `defaults` is a module-level constant in every call site.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key]);

	return [value, update, reset];
}
