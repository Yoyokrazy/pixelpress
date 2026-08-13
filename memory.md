# PixelPress Test Improver Memory

## Validated Commands
- `npm run test` — `npx vitest run` (install deps first with `npm install`)
- `npm run typecheck` — `tsc -b`
- `npm run lint` — `oxlint`
- `npm run test:coverage` — `npx vitest run --coverage`
- `npm run build` — `tsc -b && vite build`

## Testing Framework
- Vitest + jsdom; `@testing-library/jest-dom/vitest` in setup.ts
- Tests in `src/test/`, lib in `src/lib/`
- Canvas-dependent code (download.ts, pdfToImages.ts, prepareImageForPdf, etc.) not testable in jsdom

## Coverage (as of 2026-08-13)
| File | Stmts | Branches |
|------|-------|----------|
| format.ts | 98.5% | 98.18% |
| layout.ts | 100% | 96.42% |
| exif.ts | 100% | 97.82% |
| metadata.ts | 100% | 100% |
| imagesToPdf.ts | 96.96% | 83.33% |
| compressPdf.ts | 19.56% | 60% (canvas-dependent) |
| images.ts | 25.21% (canvas) | 39.39% |
| resizeImages.ts | 68.18% | 77.08% (partially canvas) |
| download.ts | 0% (canvas/DOM) | 0% |
| pdfToImages.ts | 0% (canvas/DOM) | 0% |
| Overall | 68.51% | 76.9% |

## Work In Progress / Completed
- 2026-08-05: PR `test-assist/images-and-exif-coverage` (merged via PR #13)
- 2026-08-06: PR `test-assist/format-layout-coverage` (merged via PR #13)
- 2026-08-12: PR #13 merged by Yoyokrazy — closed all format/layout/exif/pageRange/imagesToPdf/triage gaps
- 2026-08-13: PR `test-assist/metadata-edge-cases` created
  - metadata.ts now 100% stmts + branches
  - 6 edge-case tests for JPEG + 1 for PNG defensive guards

## Testing Backlog (prioritized)
1. `imagesToPdf.ts` lines 96, 135 — small gap
2. `resizeImages.ts` lines 251-324 — canvas-dependent, skip
3. `compressPdf.ts` lines 68-135 — canvas-dependent, skip
4. `triage.mjs` lines 179-180, 225 — small remaining gap

## Round-Robin Task History
- 2026-08-05: Task 1, Task 3, Task 7
- 2026-08-06: Task 2, Task 3, Task 7
- 2026-08-13: Task 3 (metadata edge cases), Task 7

## Monthly Activity Summary Issue
- Issue #9 exists (monthly activity for 2026-08)

## Checked-off items by maintainer
(none yet)
