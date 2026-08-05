import { useCallback, useEffect, useRef, useState } from 'react';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
	id: string;
	kind: ToastKind;
	message: string;
	detail?: string;
}

let toastCounter = 0;

export function useToasts(defaultDurationMs = 5000) {
	const [toasts, setToasts] = useState<Toast[]>([]);
	const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

	const dismiss = useCallback((id: string) => {
		setToasts((current) => current.filter((toast) => toast.id !== id));
		const timer = timers.current.get(id);
		if (timer) {
			clearTimeout(timer);
			timers.current.delete(id);
		}
	}, []);

	const push = useCallback(
		(kind: ToastKind, message: string, detail?: string, durationMs = defaultDurationMs) => {
			toastCounter += 1;
			const id = `toast-${toastCounter}`;
			setToasts((current) => [...current.slice(-4), { id, kind, message, detail }]);
			if (durationMs > 0) {
				timers.current.set(
					id,
					setTimeout(() => dismiss(id), durationMs),
				);
			}
			return id;
		},
		[defaultDurationMs, dismiss],
	);

	useEffect(() => {
		const pending = timers.current;
		return () => {
			for (const timer of pending.values()) {
				clearTimeout(timer);
			}
			pending.clear();
		};
	}, []);

	return { toasts, push, dismiss };
}
