/** Shared domain types for PixelPress. */

/** A user-supplied image queued for conversion into a PDF. */
export interface ImageItem {
	id: string;
	file: File;
	name: string;
	size: number;
	lastModified: number;
	/** Object URL used for the thumbnail preview. Revoked when the item is removed. */
	previewUrl: string;
	/** Intrinsic pixel width of the decoded bitmap. */
	width: number;
	/** Intrinsic pixel height of the decoded bitmap. */
	height: number;
	/** Clockwise rotation applied when drawing into the PDF. */
	rotation: Rotation;
	/**
	 * EXIF orientation of the source file. Anything other than 1 means the
	 * browser rotated the image on decode, so the raw bytes cannot be embedded
	 * directly — pdf-lib does not honour EXIF.
	 */
	exifOrientation: number;
	/** MIME type reported by the browser, normalised where the browser is vague. */
	type: string;
}

export type Rotation = 0 | 90 | 180 | 270;

/** A single page rendered out of a PDF. */
export interface RenderedPage {
	id: string;
	/** 1-based page number within its source document. */
	pageNumber: number;
	sourceName: string;
	sourceId: string;
	blob: Blob;
	url: string;
	width: number;
	height: number;
	fileName: string;
	selected: boolean;
}

/** A PDF the user loaded for rasterisation or editing. */
export interface PdfItem {
	id: string;
	file: File;
	name: string;
	size: number;
	pageCount: number;
	/** Set when the document required a password to open. */
	password?: string;
}

export type FitMode = 'contain' | 'cover' | 'stretch';
export type Orientation = 'auto' | 'portrait' | 'landscape';
export type ImageFormat = 'png' | 'jpeg' | 'webp';
export type SortKey = 'name' | 'size' | 'date' | 'manual';

export interface PdfBuildOptions {
	pageSizeId: string;
	customWidthMm: number;
	customHeightMm: number;
	orientation: Orientation;
	marginMm: number;
	fit: FitMode;
	backgroundColor: string;
	/** Re-encode source images as JPEG at this quality (0-1) to shrink output. */
	compress: boolean;
	jpegQuality: number;
	/** Longest edge in pixels; images larger than this are downscaled first. 0 disables. */
	maxDimension: number;
	/** Images per page in an N-up grid layout. */
	imagesPerPage: 1 | 2 | 4 | 6 | 9;
	/** Losslessly remove EXIF/metadata from images embedded without re-encoding. */
	stripMetadata: boolean;
	title: string;
	author: string;
	subject: string;
	keywords: string;
	fileName: string;
}

export interface RasterizeOptions {
	format: ImageFormat;
	quality: number;
	/** Dots per inch used to scale the 72dpi PDF user space. */
	dpi: number;
	/** Raw page-range expression, e.g. "1-3, 5, 8-". Empty means every page. */
	pageRange: string;
	/** Keep the page background transparent instead of painting it white. */
	transparent: boolean;
	fileNamePattern: string;
}

export interface ProgressState {
	active: boolean;
	current: number;
	total: number;
	label: string;
}

export const IDLE_PROGRESS: ProgressState = {
	active: false,
	current: 0,
	total: 0,
	label: '',
};
