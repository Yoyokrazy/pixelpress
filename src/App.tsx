import { useCallback, useEffect, useState } from 'react';
import { ImagesToPdfView } from './components/ImagesToPdfView';
import { PdfToImagesView } from './components/PdfToImagesView';
import { PdfToolboxView } from './components/PdfToolboxView';
import { Toaster } from './components/Toaster';
import { IconButton } from './components/Button';
import {
	IconFilePdf,
	IconGithub,
	IconImage,
	IconLayers,
	IconMonitor,
	IconMoon,
	IconSun,
} from './components/icons';
import { useTheme } from './hooks/useTheme';
import { useToasts, type ToastKind } from './hooks/useToasts';

type TabId = 'images-to-pdf' | 'pdf-to-images' | 'toolbox';

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
	{ id: 'toolbox', label: 'Toolbox', short: 'TOOLS', hint: 'Merge, split and organise PDFs' },
];

const TAB_IDS = TABS.map((entry) => entry.id);
const TAB_STORAGE_KEY = 'pixelpress:tab';

function isTabId(value: string | null): value is TabId {
	return value !== null && (TAB_IDS as string[]).includes(value);
}

export default function App() {
	const { theme, cycleTheme } = useTheme();
	const { toasts, push, dismiss } = useToasts();
	const [tab, setTab] = useState<TabId>(() => {
		try {
			const stored = localStorage.getItem(TAB_STORAGE_KEY);
			return isTabId(stored) ? stored : 'images-to-pdf';
		} catch {
			return 'images-to-pdf';
		}
	});

	useEffect(() => {
		try {
			localStorage.setItem(TAB_STORAGE_KEY, tab);
		} catch {
			// Storage can be blocked; the tab still works for this session.
		}
	}, [tab]);

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
			if (index >= 1 && index <= TABS.length) {
				setTab(TABS[index - 1].id);
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
										: IconLayers;
							return (
								<button
									key={entry.id}
									id={`tab-${entry.id}`}
									type="button"
									role="tab"
									aria-selected={active}
									aria-controls={`tabpanel-${entry.id}`}
									title={`${entry.hint} (${index + 1})`}
									onClick={() => setTab(entry.id)}
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
					All three views stay mounted so switching tabs never discards the
					files, ordering and previews the user has already set up.
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
					<PdfToImagesView notify={notify} />
				</div>
				<div id="tabpanel-toolbox" role="tabpanel" aria-labelledby="tab-toolbox" hidden={tab !== 'toolbox'}>
					<PdfToolboxView notify={notify} />
				</div>
			</main>

			<footer className="border-t border-slate-200 px-4 py-4 text-center text-xs text-slate-500 sm:px-6 dark:border-slate-800 dark:text-slate-400">
				<p>
					Everything runs locally — your files never leave this device. Shortcuts:{' '}
					<kbd className="rounded border border-slate-300 px-1 dark:border-slate-700">1</kbd>–
					<kbd className="rounded border border-slate-300 px-1 dark:border-slate-700">3</kbd> to switch
					tabs, <kbd className="rounded border border-slate-300 px-1 dark:border-slate-700">D</kbd> for
					theme.
				</p>
			</footer>

			<Toaster toasts={toasts} onDismiss={dismiss} />
		</div>
	);
}
