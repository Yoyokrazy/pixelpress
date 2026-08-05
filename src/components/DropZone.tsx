import { useCallback, useId, useRef, useState, type DragEvent, type ReactNode } from 'react';

interface DropZoneProps {
	accept: string;
	multiple?: boolean;
	onFiles: (files: File[]) => void;
	title: string;
	subtitle: string;
	icon: ReactNode;
	compact?: boolean;
	disabled?: boolean;
}

/** Click-or-drag file picker with directory support where the browser allows it. */
export function DropZone({
	accept,
	multiple = true,
	onFiles,
	title,
	subtitle,
	icon,
	compact = false,
	disabled = false,
}: DropZoneProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [dragging, setDragging] = useState(false);
	const dragDepth = useRef(0);
	const inputId = useId();

	const handleDrop = useCallback(
		async (event: DragEvent<HTMLDivElement>) => {
			event.preventDefault();
			dragDepth.current = 0;
			setDragging(false);
			if (disabled) {
				return;
			}
			const files = await collectFiles(event.dataTransfer);
			if (files.length > 0) {
				onFiles(multiple ? files : files.slice(0, 1));
			}
		},
		[disabled, multiple, onFiles],
	);

	return (
		<div
			onDragEnter={(event) => {
				event.preventDefault();
				dragDepth.current += 1;
				if (!disabled) {
					setDragging(true);
				}
			}}
			onDragOver={(event) => event.preventDefault()}
			onDragLeave={(event) => {
				event.preventDefault();
				dragDepth.current = Math.max(0, dragDepth.current - 1);
				if (dragDepth.current === 0) {
					setDragging(false);
				}
			}}
			onDrop={handleDrop}
			className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition ${
				compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-12'
			} ${
				dragging
					? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
					: 'border-slate-300 bg-white/60 hover:border-brand-400 hover:bg-brand-50/40 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:border-brand-500 dark:hover:bg-brand-900/10'
			} ${disabled ? 'pointer-events-none opacity-50' : ''}`}
		>
			<input
				ref={inputRef}
				id={inputId}
				type="file"
				accept={accept}
				multiple={multiple}
				disabled={disabled}
				className="sr-only"
				onChange={(event) => {
					const files = [...(event.target.files ?? [])];
					if (files.length > 0) {
						onFiles(files);
					}
					event.target.value = '';
				}}
			/>
			<span className={`text-brand-500 ${compact ? 'scale-90' : ''}`}>{icon}</span>
			<label
				htmlFor={inputId}
				className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-100"
			>
				<span className="text-brand-600 underline-offset-2 hover:underline dark:text-brand-400">
					{title}
				</span>
			</label>
			<p className="max-w-md text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
		</div>
	);
}

/** Read a drop payload, walking directory entries when the browser exposes them. */
async function collectFiles(transfer: DataTransfer): Promise<File[]> {
	const items = [...(transfer.items ?? [])];
	const entries = items
		.map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
		.filter((entry): entry is FileSystemEntry => entry !== null);

	if (entries.length === 0) {
		return [...transfer.files];
	}

	const files: File[] = [];
	for (const entry of entries) {
		await walkEntry(entry, files);
	}
	return files.length > 0 ? files : [...transfer.files];
}

async function walkEntry(entry: FileSystemEntry, sink: File[], depth = 0): Promise<void> {
	if (depth > 8) {
		return;
	}
	if (entry.isFile) {
		const file = await new Promise<File | null>((resolve) => {
			(entry as FileSystemFileEntry).file(resolve, () => resolve(null));
		});
		if (file && !file.name.startsWith('.')) {
			sink.push(file);
		}
		return;
	}
	if (entry.isDirectory) {
		const reader = (entry as FileSystemDirectoryEntry).createReader();
		let batch: FileSystemEntry[] = [];
		do {
			batch = await new Promise<FileSystemEntry[]>((resolve) => {
				reader.readEntries(resolve, () => resolve([]));
			});
			for (const child of batch) {
				await walkEntry(child, sink, depth + 1);
			}
		} while (batch.length > 0);
	}
}
