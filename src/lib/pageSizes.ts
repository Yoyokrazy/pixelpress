import type { Orientation } from './types';

/** PDF user-space units are 1/72 inch. */
export const POINTS_PER_INCH = 72;
export const MM_PER_INCH = 25.4;

export function mmToPoints(mm: number): number {
	return (mm / MM_PER_INCH) * POINTS_PER_INCH;
}

export function pointsToMm(points: number): number {
	return (points / POINTS_PER_INCH) * MM_PER_INCH;
}

export interface PageSizePreset {
	id: string;
	label: string;
	/** Portrait dimensions in PDF points. `null` for the auto-fit option. */
	width: number | null;
	height: number | null;
}

export const AUTO_PAGE_SIZE = 'auto';
export const CUSTOM_PAGE_SIZE = 'custom';

export const PAGE_SIZES: PageSizePreset[] = [
	{ id: AUTO_PAGE_SIZE, label: 'Fit to image', width: null, height: null },
	{ id: 'a4', label: 'A4 · 210 × 297 mm', width: mmToPoints(210), height: mmToPoints(297) },
	{ id: 'a3', label: 'A3 · 297 × 420 mm', width: mmToPoints(297), height: mmToPoints(420) },
	{ id: 'a5', label: 'A5 · 148 × 210 mm', width: mmToPoints(148), height: mmToPoints(210) },
	{ id: 'letter', label: 'Letter · 8.5 × 11 in', width: 612, height: 792 },
	{ id: 'legal', label: 'Legal · 8.5 × 14 in', width: 612, height: 1008 },
	{ id: 'tabloid', label: 'Tabloid · 11 × 17 in', width: 792, height: 1224 },
	{ id: 'photo4x6', label: 'Photo · 4 × 6 in', width: 288, height: 432 },
	{ id: 'photo5x7', label: 'Photo · 5 × 7 in', width: 360, height: 504 },
	{ id: 'square', label: 'Square · 8 × 8 in', width: 576, height: 576 },
	{ id: CUSTOM_PAGE_SIZE, label: 'Custom…', width: null, height: null },
];

export function getPageSizePreset(id: string): PageSizePreset | undefined {
	return PAGE_SIZES.find((preset) => preset.id === id);
}

/**
 * Resolve the final page box in points, honouring the requested orientation.
 * Returns `null` when the page should simply match the image (auto mode).
 */
export function resolvePageSize(
	pageSizeId: string,
	orientation: Orientation,
	customWidthMm: number,
	customHeightMm: number,
	imageAspect?: number,
): { width: number; height: number } | null {
	let width: number;
	let height: number;

	if (pageSizeId === CUSTOM_PAGE_SIZE) {
		width = mmToPoints(Math.max(1, customWidthMm));
		height = mmToPoints(Math.max(1, customHeightMm));
	} else {
		const preset = getPageSizePreset(pageSizeId);
		if (!preset || preset.width === null || preset.height === null) {
			return null;
		}
		width = preset.width;
		height = preset.height;
	}

	return applyOrientation(width, height, orientation, imageAspect);
}

/**
 * Swap width/height so the page matches the requested orientation. In `auto`
 * mode the page follows the image's own aspect ratio when one is supplied.
 */
export function applyOrientation(
	width: number,
	height: number,
	orientation: Orientation,
	imageAspect?: number,
): { width: number; height: number } {
	const portrait = { width: Math.min(width, height), height: Math.max(width, height) };
	const landscape = { width: Math.max(width, height), height: Math.min(width, height) };

	switch (orientation) {
		case 'portrait':
			return portrait;
		case 'landscape':
			return landscape;
		case 'auto':
		default:
			if (imageAspect === undefined || !Number.isFinite(imageAspect) || imageAspect <= 0) {
				return { width, height };
			}
			return imageAspect > 1 ? landscape : portrait;
	}
}
