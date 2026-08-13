import { lazy, Suspense, useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ImagesToPdfView } from './components/ImagesToPdfView';
import { ResizeImagesView } from './components/ResizeImagesView';
import { Toaster } from './components/Toaster';
import { IconButton } from './components/Button';
import {
	IconFilePdf,
	IconGithub,
	IconImage,
	IconLayers,
	IconMonitor,
	IconMoon,
	IconResize,
	IconSpinner,
	IconSun,
} from './components/icons';
import { useTheme } from './hooks/useTheme';
import { useToasts, type ToastKind } from './hooks/useToasts';

// The PDF → Images and Toolbox views pull in pdf.js, by far the heaviest
// dependency. Loading them lazily keeps that chunk out of the initial download
// for anyone who only uses Images → PDF or Resize. Each view still stays
// mounted once visited (see `visited` below), so queued files survive tab
// switches exactly as before.
const PdfToImagesView = lazy(() =>
	import('./components/PdfToImagesView').then((module) => ({ default: module.PdfToImagesView })),
);
const PdfToolboxView = lazy(() =>
	import('./components/PdfToolboxView').then((module) => ({ default: module.PdfToolboxView })),
);

type TabId = 'images-to-pdf' | 'pdf-to-images' | 'resize' | 'toolbox';

const TABS: Array<{ id: TabId; label: string; short: string; hint: string }> = [
	{
		id: 'images-to-pdf',
		label: 'Images → PDF',
		short: 'PDF',
		hint: 'Combine images into one document',
	},
	{
		id: 'pdf-to-images',
		label: 'PDF → Images',
		short: 'IMG',
		hint: 'Export pages as PNG, JPEG or WebP',
	},
	{
		id: 'resize',
		label: 'Resize',
		short: 'SIZE',
		hint: 'Scale images down to a smaller file',
	},
	{ id: 'toolbox', label: 'Toolbox', short: 'TOOLS', hint: 'Merge, split and organise PDFs' },
];

const TAB_IDS = TABS.map((entry) => entry.id);
const TAB_STORAGE_KEY = 'pixelpress:tab';

function isTabId(value: string | null): value is TabId {
	return value !== null && (TAB_IDS as string[]).includes(value);
}

function readInitialTab(): TabId {
	try {
		const stored = localStorage.getItem(TAB_STORAGE_KEY);
		return isTabId(stored) ? stored : 'images-to-pdf';
	} catch {
		return 'images-to-pdf';
	}
}

/** Placeholder shown while a lazily-loaded view's chunk is fetched. */
function ViewLoading() {
	return (
		<div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-500 dark:text-slate-400">
			<IconSpinner className="size-5 animate-spin" />
			Loading…
		</div>
	);
}

export default function App() {
	const { theme, cycleTheme } = useTheme();
	const { toasts, push, dismiss } = useToasts();
	const [tab, setTab] = useState<TabId>(readInitialTab);
	// Tabs the user has opened at least once. Lazy views mount when their tab is
	// first visited and stay mounted afterwards, so nothing they hold is lost.
	const [visited, setVisited] = useState<Set<TabId>>(() => new Set([tab]));
	const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

	useEffect(() => {
		setVisited((current) => (current.has(tab) ? current : new Set(current).add(tab)));
	}, [tab]);

	useEffect(() => {
		try {
			localStorage.setItem(TAB_STORAGE_KEY, tab);
		} catch {
			// Storage can be blocked; the tab still works for this session.
		}
	}, [tab]);

	// Roving arrow-key navigation for the tablist, per the ARIA tabs pattern.
	const onTabKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
		let nextIndex: number | null = null;
		if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
			nextIndex = (index + 1) % TABS.length;
		} else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
			nextIndex = (index - 1 + TABS.length) % TABS.length;
		} else if (event.key === 'Home') {
			nextIndex = 0;
		} else if (event.key === 'End') {
			nextIndex = TABS.length - 1;
		}
		const nextTab = nextIndex === null ? undefined : TABS[nextIndex];
		if (nextIndex === null || !nextTab) {
			return;
		}
		event.preventDefault();
		setTab(nextTab.id);
		tabRefs.current[nextIndex]?.focus();
	}, []);

	const notify = useCallback(
		(kind: ToastKind, message: string, detail?: string) => {
			push(kind, message, detail);
		},
		[push],
	);

	// Keyboard shortcuts: 1/2/3 switch tabs, D cycles the theme.
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement | null;
			const typing =
				target?.tagName === 'INPUT' ||
				target?.tagName === 'TEXTAREA' ||
				target?.tagName === 'SELECT' ||
				target?.isContentEditable;
			if (typing || event.metaKey || event.ctrlKey || event.altKey) {
				return;
			}
			const index = Number.parseInt(event.key, 10);
			const target_tab = TABS[index - 1];
			if (target_tab) {
				setTab(target_tab.id);
			} else if (event.key.toLowerCase() === 'd') {
				cycleTheme();
			}
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [cycleTheme]);

	// Block the browser from navigating away when a file is dropped outside a drop zone.
	useEffect(() => {
		const prevent = (event: DragEvent) => {
			if (event.dataTransfer?.types.includes('Files')) {
				event.preventDefault();
			}
		};
		window.addEventListener('dragover', prevent);
		window.addEventListener('drop', prevent);
		return () => {
			window.removeEventListener('dragover', prevent);
			window.removeEventListener('drop', prevent);
		};
	}, []);

	const ThemeIcon = theme === 'light' ? IconSun : theme === 'dark' ? IconMoon : IconMonitor;

	return (
		<div className="flex min-h-full flex-col">
			<header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/85">
				<div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
					<div className="flex items-center gap-2.5">
						<span className="flex size-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
							<IconImage className="size-5" />
						</span>
						<div className="leading-tight">
							<h1 className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-50">
								PixelPress
							</h1>
							<p className="hidden text-[11px] text-slate-500 sm:block dark:text-slate-400">
								Images ⇄ PDF, entirely in your browser
							</p>
						</div>
					</div>

					<nav
						role="tablist"
						aria-label="Conversion tools"
						className="ml-auto flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-800 dark:bg-slate-900"
					>
						{TABS.map((entry, index) => {
							const active = entry.id === tab;
							const Icon =
								entry.id === 'images-to-pdf'
									? IconImage
									: entry.id === 'pdf-to-images'
										? IconFilePdf
										: entry.id === 'resize'
											? IconResize
											: IconLayers;
							return (
								<button
									key={entry.id}
									id={`tab-${entry.id}`}
									ref={(node) => {
										tabRefs.current[index] = node;
									}}
									type="button"
									role="tab"
									aria-selected={active}
									aria-controls={`tabpanel-${entry.id}`}
									tabIndex={active ? 0 : -1}
									title={`${entry.hint} (${index + 1})`}
									onClick={() => setTab(entry.id)}
									onKeyDown={(event) => onTabKeyDown(event, index)}
									className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 sm:text-sm ${
										active
											? 'bg-white text-brand-700 shadow-sm dark:bg-slate-950 dark:text-brand-300'
											: 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
									}`}
								>
									<Icon className="size-4" />
									<span className="hidden sm:inline">{entry.label}</span>
									<span className="sm:hidden">{entry.short}</span>
								</button>
							);
						})}
					</nav>

					<div className="flex items-center gap-1">
						<IconButton label={`Theme: ${theme} (press D)`} onClick={cycleTheme}>
							<ThemeIcon className="size-5" />
						</IconButton>
						<a
							href="https://github.com/Yoyokrazy/pixelpress"
							target="_blank"
							rel="noreferrer noopener"
							title="View source on GitHub"
							aria-label="View source on GitHub"
							className="inline-flex items-center justify-center rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
						>
							<IconGithub className="size-5" />
						</a>
					</div>
				</div>
			</header>

			<main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
				{/*
					The two light views stay mounted so switching tabs never discards
					the files, ordering and previews the user set up. The heavier pdf.js
					views are code-split: each mounts on first visit and then stays
					mounted, so its queued work survives later tab switches too.
				*/}
				<div
					id="tabpanel-images-to-pdf"
					role="tabpanel"
					aria-labelledby="tab-images-to-pdf"
					hidden={tab !== 'images-to-pdf'}
				>
					<ImagesToPdfView notify={notify} />
				</div>
				<div
					id="tabpanel-pdf-to-images"
					role="tabpanel"
					aria-labelledby="tab-pdf-to-images"
					hidden={tab !== 'pdf-to-images'}
				>
					{visited.has('pdf-to-images') ? (
						<Suspense fallback={<ViewLoading />}>
							<PdfToImagesView notify={notify} />
						</Suspense>
					) : null}
				</div>
				<div id="tabpanel-resize" role="tabpanel" aria-labelledby="tab-resize" hidden={tab !== 'resize'}>
					<ResizeImagesView notify={notify} />
				</div>
				<div id="tabpanel-toolbox" role="tabpanel" aria-labelledby="tab-toolbox" hidden={tab !== 'toolbox'}>
					{visited.has('toolbox') ? (
						<Suspense fallback={<ViewLoading />}>
							<PdfToolboxView notify={notify} />
						</Suspense>
					) : null}
				</div>
			</main>

			<footer className="border-t border-slate-200 px-4 py-4 text-center text-xs text-slate-500 sm:px-6 dark:border-slate-800 dark:text-slate-400">
				<p>
					Everything runs locally — your files never leave this device. Shortcuts:{' '}
					<kbd className="rounded border border-slate-300 px-1 dark:border-slate-700">1</kbd>–
					<kbd className="rounded border border-slate-300 px-1 dark:border-slate-700">4</kbd> to switch
					tabs, <kbd className="rounded border border-slate-300 px-1 dark:border-slate-700">D</kbd> for
					theme.
				</p>
			</footer>

			<Toaster toasts={toasts} onDismiss={dismiss} />
		</div>
	);
}
