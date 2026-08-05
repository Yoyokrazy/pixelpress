import type { FitMode, Rotation } from './types';

export interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Fit a source rectangle into a destination rectangle and return the centred
 * placement. `contain` preserves the whole image, `cover` fills the box and
 * overflows, `stretch` ignores the aspect ratio.
 */
export function fitRect(
	sourceWidth: number,
	sourceHeight: number,
	boxWidth: number,
	boxHeight: number,
	mode: FitMode,
): Box {
	if (sourceWidth <= 0 || sourceHeight <= 0 || boxWidth <= 0 || boxHeight <= 0) {
		return { x: 0, y: 0, width: Math.max(0, boxWidth), height: Math.max(0, boxHeight) };
	}

	if (mode === 'stretch') {
		return { x: 0, y: 0, width: boxWidth, height: boxHeight };
	}

	const scaleX = boxWidth / sourceWidth;
	const scaleY = boxHeight / sourceHeight;
	const scale = mode === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
	const width = sourceWidth * scale;
	const height = sourceHeight * scale;

	return {
		x: (boxWidth - width) / 2,
		y: (boxHeight - height) / 2,
		width,
		height,
	};
}

/** Dimensions after applying a quarter-turn rotation. */
export function rotatedSize(
	width: number,
	height: number,
	rotation: Rotation,
): { width: number; height: number } {
	return rotation === 90 || rotation === 270
		? { width: height, height: width }
		: { width, height };
}

/** Advance a rotation by one clockwise quarter turn. */
export function rotateClockwise(rotation: Rotation): Rotation {
	return (((rotation + 90) % 360) as Rotation);
}

/** Advance a rotation by one counter-clockwise quarter turn. */
export function rotateCounterClockwise(rotation: Rotation): Rotation {
	return (((rotation + 270) % 360) as Rotation);
}

/**
 * Compute a grid of equally sized cells for an N-up layout. Cells are returned
 * in reading order (left to right, top to bottom) using a PDF coordinate
 * system whose origin is the bottom-left corner.
 */
export function gridCells(
	pageWidth: number,
	pageHeight: number,
	margin: number,
	count: number,
	gutter = 0,
): Box[] {
	const { columns, rows } = gridShape(count, pageWidth, pageHeight);
	const usableWidth = Math.max(0, pageWidth - margin * 2 - gutter * (columns - 1));
	const usableHeight = Math.max(0, pageHeight - margin * 2 - gutter * (rows - 1));
	const cellWidth = usableWidth / columns;
	const cellHeight = usableHeight / rows;
	const cells: Box[] = [];

	for (let row = 0; row < rows; row += 1) {
		for (let column = 0; column < columns; column += 1) {
			cells.push({
				x: margin + column * (cellWidth + gutter),
				// Rows are laid out top-down but PDF y grows upwards.
				y: pageHeight - margin - (row + 1) * cellHeight - row * gutter,
				width: cellWidth,
				height: cellHeight,
			});
		}
	}

	return cells;
}

/** Choose a column/row split for an N-up layout that suits the page shape. */
export function gridShape(
	count: number,
	pageWidth: number,
	pageHeight: number,
): { columns: number; rows: number } {
	if (count <= 1) {
		return { columns: 1, rows: 1 };
	}

	const landscape = pageWidth > pageHeight;
	switch (count) {
		case 2:
			return landscape ? { columns: 2, rows: 1 } : { columns: 1, rows: 2 };
		case 4:
			return { columns: 2, rows: 2 };
		case 6:
			return landscape ? { columns: 3, rows: 2 } : { columns: 2, rows: 3 };
		case 9:
			return { columns: 3, rows: 3 };
		default: {
			const columns = Math.ceil(Math.sqrt(count));
			return { columns, rows: Math.ceil(count / columns) };
		}
	}
}

/** Split a list into consecutive chunks of at most `size` items. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
	if (size <= 0) {
		return [items.slice()];
	}
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
}
