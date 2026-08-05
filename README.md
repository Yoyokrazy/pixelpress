# PixelPress

**Live: <https://yoyokrazy.github.io/pixelpress/>**

Convert images into a PDF, and PDF pages back into images — entirely in your browser.

Nothing is uploaded. Every conversion runs on your own machine using
[pdf-lib](https://pdf-lib.js.org/) and [PDF.js](https://mozilla.github.io/pdf.js/), so the app
works offline and your documents never touch a server.

---

## Features

### Images → PDF

- Pick or drop **multiple images at once**, including whole folders
- Supports **PNG, JPEG, WebP, GIF, BMP, AVIF, TIFF and SVG**
- Thumbnail grid with **drag-to-reorder**, plus sort by name (natural order), date or size
- **Rotate** individual images or the whole batch in 90° steps
- Page size presets — fit-to-image, A3/A4/A5, Letter, Legal, Tabloid, photo sizes, or custom mm
- **Orientation** (auto / portrait / landscape) and **scaling** (fit, fill with clipping, stretch)
- Adjustable **margins** and **page background colour**
- **N-up layouts**: 1, 2, 4, 6 or 9 images per page in a grid
- Optional **JPEG compression** with a quality slider, and **downscaling** by longest edge
- PDF **metadata**: title, author, subject, keywords
- Progress reporting with **cancellation** for large batches

### PDF → Images

- Load **one or many PDFs**, including **password-protected** documents
- Export as **PNG, JPEG or WebP** at **72–600 DPI**
- Quality slider for lossy formats and **transparent background** support for PNG
- **Page ranges** with a live preview — `1-3, 5, 8-`, plus `all`, `first`, `last`, `odd`, `even`
- Customisable **filename patterns** — `{name}`, `{page}`, `{index}`, `{total}`, `{pageCount}`,
  with zero padding such as `{page:3}`
- Preview every rendered page, deselect the ones you do not want
- Download a single image or **all selected pages as a ZIP**

### Toolbox

- **Merge** several PDFs into one, in an order you control
- **Split** a PDF by single page, fixed-size chunks, or custom ranges (`1-3; 4-6; 7-`)
- **Organise** pages: drag to reorder, rotate individually, and mark pages for removal,
  all with live page thumbnails

### Throughout

- Light, dark and system **themes**, applied before first paint so there is no flash
- Settings are **remembered** between visits
- Keyboard shortcuts: <kbd>1</kbd>–<kbd>3</kbd> to switch tabs, <kbd>D</kbd> to cycle themes
- Accessible controls with proper labelling, focus rings and live-region notifications

---

## Getting started

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually <http://localhost:5173>).

### Scripts

| Command              | What it does                              |
| -------------------- | ----------------------------------------- |
| `npm run dev`        | Start the dev server with hot reload      |
| `npm run build`      | Typecheck and produce a production bundle |
| `npm run preview`    | Serve the production bundle locally       |
| `npm run test`       | Run the unit test suite once              |
| `npm run test:watch` | Run tests in watch mode                   |
| `npm run typecheck`  | Typecheck without emitting                |
| `npm run lint`       | Lint the source                           |

---

## How it works

| Concern             | Approach                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| Building PDFs       | `pdf-lib` embeds PNG/JPEG streams directly, so unmodified images are copied without re-encoding  |
| Other image formats | Decoded with `createImageBitmap` and re-encoded through a canvas                                 |
| Rendering PDF pages | `PDF.js` rasterises each page to a canvas at the requested DPI                                   |
| `cover` scaling     | A PDF clipping path is pushed around each cell so overflow is trimmed cleanly                    |
| Archives            | `JSZip` builds the download in memory                                                            |

Because everything is client-side, very large batches are limited by your device's memory
rather than an upload quota. Long conversions report progress and can be cancelled.

### Project layout

```
src/
  lib/          Pure conversion logic (no React) — fully unit tested
    imagesToPdf.ts   Build a PDF from an ordered list of images
    pdfToImages.ts   Rasterise PDF pages via PDF.js
    pdfTools.ts      Merge, split and page-level editing
    pageRange.ts     Parse and format page-range expressions
    pageSizes.ts     Page presets and orientation maths
    layout.ts        Fitting, rotation and N-up grid maths
    format.ts        Byte, filename and colour helpers
  components/   React views and UI primitives
  hooks/        Theme, toasts and persisted settings
  test/         Vitest suites
```

The `lib/` layer has no DOM-framework dependencies, which keeps the conversion behaviour
testable in isolation from the UI.

---

## Deployment

Pushing to `main` runs CI (typecheck, lint, test, build) and then the
**Deploy to GitHub Pages** workflow, which publishes to
<https://yoyokrazy.github.io/pixelpress/>.

The deploy workflow probes the Pages API first and skips cleanly if Pages is not enabled,
so a fork without Pages configured will not see failing runs. To enable it on a fork:
**Settings → Pages → Build and deployment → Source: GitHub Actions**. Note that GitHub
Pages requires a public repository or a paid plan.

The workflow sets `BASE_PATH` so the bundle resolves assets from `/<repo>/`. The build is
fully static, so any static host (Netlify, Vercel, S3, a plain nginx directory) also works —
just serve the `dist/` folder.

---

## Licence

MIT
