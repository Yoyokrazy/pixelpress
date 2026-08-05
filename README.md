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
| `npm run test:coverage` | Run tests with coverage and enforce thresholds |
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

## Automation

| Workflow | Trigger | What it does |
| -------- | ------- | ------------ |
| **CI** | Push / PR to `main` | Typecheck, lint, test with coverage, build. Posts a coverage table on pull requests. |
| **Deploy to GitHub Pages** | Push to `main` | Publishes the site; skips cleanly if Pages is not enabled |
| **Issue triage** | Issue opened / reopened / edited | Categorises and labels the issue, then asks Copilot to attempt a fix when it looks actionable |
| **Dependabot** | Dependabot PR | Labels the update type, auto-merges patch and minor once CI is green, flags majors for review |
| **CI Failure Doctor** | CI or deploy run fails | Agentic. Investigates the failure, matches it against past incidents and files a deduplicated report issue. |
| **Daily Test Improver** | Weekly, or `/test-assist` | Agentic. Finds coverage gaps and opens draft pull requests adding tests. |

Copilot code review is requested automatically on every pull request through a
repository ruleset, including draft pull requests.

### Coverage

`npm run test:coverage` enforces thresholds defined in `vite.config.ts`. They sit
just below current coverage and act as a **ratchet against regressions** — raise
them as coverage improves, never lower them to make a change pass.

`download.ts` and `pdfToImages.ts` need canvas and the pdf.js worker, which jsdom
does not provide, so they are verified in a real browser rather than mocked.
`pdf-lib` is pure JavaScript, so PDF construction *is* covered by unit tests.

### Agentic workflows (gh-aw)

The two agentic workflows are built with
[gh-aw](https://github.com/github/gh-aw). Each is a Markdown file with YAML
frontmatter, compiled to a `.lock.yml` that Actions executes — **both files are
committed and must stay in sync**:

```bash
gh extension install github/gh-aw
gh aw compile          # after editing any .md workflow
gh aw status
```

Security model: the agent job itself runs with `permissions: read-all`. Every
write — issue, comment, pull request, label — is declared under `safe-outputs:`
and performed by a separate job that only runs after a threat-detection job
screens the agent's requested actions. A prompt-injected agent therefore cannot
write to the repository or exfiltrate secrets directly. `protected-files`
prevents agents from editing sensitive paths such as the workflows themselves.

> [!NOTE]
> The agentic workflows need a `COPILOT_GITHUB_TOKEN` secret — a fine-grained PAT
> with **Account permissions → Copilot Requests → Read**. The
> `permissions: copilot-requests: write` shortcut only works for organisation
> Copilot subscriptions, not personal accounts. Without the secret these two
> workflows fail; the rest of CI is unaffected.

### Issue triage

Every new issue is classified into one of: `bug`, `feature`, `documentation`,
`dependencies`, `license`, `security`, `performance`, `accessibility`, `question`
or `unknown`, and labelled accordingly. The workflow then posts a short comment
explaining what it decided.

Issues are handed to GitHub Copilot for an automated fix attempt only when they
are categorised as bug, documentation, dependencies, license, accessibility or
performance **and** carry enough detail to act on. Deliberately excluded:

- **Security reports** — routed to a human; please use a
  [private advisory](https://github.com/Yoyokrazy/pixelpress/security/advisories/new)
- **Feature requests** — need a design decision first
- **Questions** and issues that could not be categorised
- Anything filed by a bot

Any pull request Copilot opens still requires human review before merging.

> [!IMPORTANT]
> Assigning the Copilot coding agent requires a **user** token. The default
> `GITHUB_TOKEN` is a GitHub App installation token and the API rejects it with
> *"Assigning agents is not supported with GitHub App installation tokens"*.
>
> To enable automated fixes, add a secret named `COPILOT_ASSIGN_TOKEN`:
>
> 1. Create a [fine-grained PAT](https://github.com/settings/personal-access-tokens/new)
>    scoped to this repository only, with **Issues: Read and write**
> 2. Add it under **Settings → Secrets and variables → Actions** as
>    `COPILOT_ASSIGN_TOKEN`
>
> Without the secret, triage still labels and comments on every issue; eligible
> ones are simply marked `needs-human` instead of being delegated.

The classification rules live in
[`.github/scripts/triage.mjs`](.github/scripts/triage.mjs) and are unit tested in
[`src/test/triage.test.ts`](src/test/triage.test.ts), so they can be changed with
confidence. To re-run triage on an existing issue, dispatch the **Issue triage**
workflow with the issue number.

> [!NOTE]
> The model used by the Copilot coding agent **cannot be set as a repository
> default**. A model picker appears only when you assign an issue by hand on
> github.com; issues assigned by automation (as this workflow does) always run
> on **Auto**. The agentic gh-aw workflows are different — they *do* accept an
> explicit model via `engine: { id: copilot, model: ... }` in their frontmatter.

### Agent context

[`.github/copilot-instructions.md`](.github/copilot-instructions.md) gives AI
agents the architecture, testing expectations and — most usefully — the domain
bugs that have already been fixed once, so they are not reintroduced.

### Dependencies

Dependabot checks npm packages and GitHub Actions weekly, with a **7-day
cooldown**: a newly published version is not proposed until it has been out for
a week, which avoids chasing releases that get pulled shortly after publishing.
Security updates bypass the cooldown. Related packages are grouped so routine
updates arrive as a handful of PRs rather than one per package.

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
