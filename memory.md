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

## Coverage (as of 2026-08-06)
| File | Stmts |
|------|-------|
| format.ts | 98.48% |
| layout.ts | 100% |
| exif.ts | 86.66% |
| images.ts | 24.56% (canvas functions block progress) |
| imagesToPdf.ts | 95.16% |
| download.ts | 0% (canvas/DOM) |
| pdfToImages.ts | 0% (canvas/DOM) |
| Overall | 65.99% |

## Work In Progress / Completed
- 2026-08-05: Created PR `test-assist/images-and-exif-coverage`
  - Added src/test/images.test.ts (21 tests for pure functions)
  - Extended src/test/exif.test.ts (+3 edge-case tests)
  - NOTE: PR not visible in GH search (may be merged/closed); verify
- 2026-08-06: Created PR `test-assist/format-layout-coverage`
  - `format.ts`: added formatDuration tests (lines 128-132 now covered)
  - `layout.ts`: added gridShape default-case + chunk size<=0 tests (now 100% lines)

## Testing Backlog (prioritized)
1. `exif.ts` lines 52,56,72,87-92,120 — moderate gap, some may need canvas
2. `imagesToPdf.ts` lines 87-89 — small gap (requires pdf-lib fixtures)
3. `triage.mjs` line 229 — almost full, low priority
4. `images.ts` canvas functions — requires browser, skip
5. `pageRange.ts` lines 65-66 — small gap

## Round-Robin Task History
- 2026-08-05: Task 1 (discover commands), Task 3 (implement tests), Task 7 (monthly summary)
- 2026-08-06: Task 2 (backlog check), Task 3 (implement tests), Task 7 (monthly summary)

## Monthly Activity Summary Issue
- Issue #9 exists (filtered by integrity policy - treat as present)

## Checked-off items by maintainer
(none yet)
