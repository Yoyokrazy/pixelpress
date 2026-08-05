# PixelPress — instructions for AI agents

PixelPress converts images to PDF and PDF pages back to images, **entirely in the
browser**. There is no server and no upload step. Keep it that way.

## Non-negotiables

- **Never add a network round-trip for user files.** Every conversion runs client
  side. If a change would send a user's image or PDF anywhere, it is wrong.
- **Never use the TypeScript `any` type.** Use `unknown` plus a type guard.
- Do not introduce a backend, an analytics tracker, or a telemetry call.

## Layout

| Path | Purpose |
| ---- | ------- |
| `src/lib/` | Pure conversion logic, no React. This is where the real work happens. |
| `src/components/` | React views and UI primitives. |
| `src/hooks/` | Theme, toasts, persisted settings. |
| `src/test/` | Vitest suites. |
| `.github/scripts/triage.mjs` | Issue triage rules, unit tested. |

`src/lib/` deliberately has no framework dependency so its behaviour can be
tested without a DOM. Prefer putting new logic there and keeping components thin.

## Commands

```bash
npm run dev            # dev server
npm run typecheck      # tsc -b
npm run lint           # oxlint
npm run test           # vitest run
npm run test:coverage  # vitest run --coverage (enforces thresholds)
npm run build          # tsc -b && vite build
```

Always run `npm run typecheck && npm run test` before opening a pull request.

## Testing expectations

- Anything added to `src/lib/` needs unit tests.
- Coverage thresholds are enforced in `vite.config.ts` and act as a ratchet;
  never lower them to make a change pass. Raise coverage instead.
- `download.ts` and `pdfToImages.ts` need canvas and the pdf.js worker, which
  jsdom does not provide, so they are verified manually in a real browser. Do not
  add brittle mocks purely to inflate the coverage number.
- `pdf-lib` is pure JavaScript, so PDF construction **is** testable in jsdom —
  see `src/test/imagesToPdf.test.ts` for how to build fixture PNGs without a
  canvas.

## Domain gotchas that have already caused bugs

These are real regressions that were shipped and then fixed. Do not reintroduce them.

1. **EXIF orientation.** Browsers apply EXIF rotation when decoding an image, but
   `pdf-lib` reads the raw JPEG/PNG header and ignores it. Embedding original
   bytes for an EXIF-rotated file produces a sideways, aspect-distorted page.
   `prepareImageForPdf` therefore excludes EXIF-rotated files from the lossless
   passthrough and re-encodes them through a canvas.
2. **Object URLs leak.** Every `URL.createObjectURL` needs a matching
   `revokeObjectURL`, including on unmount and on the cancellation path.
3. **Do not unmount the tab views.** All three stay mounted and are hidden,
   because unmounting discards the user's queued files.
4. **`pdf-lib` always stamps its own `/Producer`.** Setting it is a no-op; set
   `/Creator` instead.
5. **Open a PDF once, not once per page.** `renderPdfThumbnails` reuses a single
   document and worker; opening per page is dramatically slower on large files.

## Style

- Tabs for indentation, single quotes, semicolons.
- Comment only what needs clarifying — prefer explaining *why*, not *what*.
- Follow [Conventional Commits](https://www.conventionalcommits.org/) for commit
  messages and PR titles.
