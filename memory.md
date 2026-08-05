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

## Coverage (baseline 2026-08-05)
| File | Stmts |
|------|-------|
| images.ts | 24.56% (was 15.78%) |
| exif.ts | 85% (was 80%) |
| download.ts | 0% (canvas/DOM) |
| pdfToImages.ts | 0% (canvas/DOM) |
| Overall | 64.84% |

## Work in Progress / Completed
- 2026-08-05: Created PR `test-assist/images-and-exif-coverage`
  - Added src/test/images.test.ts (21 tests for pure functions)
  - Extended src/test/exif.test.ts (+3 edge-case tests)

## Testing Backlog (prioritized)
1. `format.ts` lines 80, 128-132 — moderate coverage gap
2. `layout.ts` lines 120-121, 129 — small gap
3. `imagesToPdf.ts` lines 87-89 — small gap
4. `triage.mjs` line 229 — almost full, low priority
5. `images.ts` canvas functions — requires browser, skip

## Round-Robin Task History
- 2026-08-05: Task 1 (discover commands), Task 3 (implement tests), Task 7 (monthly summary)

## Monthly Activity Summary Issue
- Not yet created (first run)

## Checked-off items by maintainer
(none yet)
