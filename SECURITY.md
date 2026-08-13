# Security Policy

## Our security model

PixelPress runs **entirely in your browser**. There is no backend and no upload
step: images and PDFs you open are read, converted and saved locally using the
Web platform (Canvas, `pdf-lib`, `pdf.js`). Your files never leave your device.

The app makes **no network requests for your data**. The only network activity
is fetching the app's own static assets (JavaScript, CSS and the `pdf.js`
worker) from the same origin it is served from. A `Content-Security-Policy`
meta tag restricts connections accordingly as defence in depth.

## Supported versions

The deployed site (GitHub Pages) always tracks the latest `main`. Fixes are
applied there; there are no separately maintained release branches.

## Reporting a vulnerability

Please report suspected vulnerabilities privately rather than opening a public
issue:

- Preferred: open a [GitHub security advisory](https://github.com/Yoyokrazy/pixelpress/security/advisories/new)
  for this repository.
- Alternatively, open a regular issue that describes the problem **without**
  exploit details and asks a maintainer to make contact.

Please include:

- a description of the issue and its impact,
- the steps or a proof of concept needed to reproduce it,
- the affected browser/version if relevant.

We aim to acknowledge reports within a few days. Because the app is fully
client-side and stores nothing server-side, most reports will concern the build
pipeline, dependencies, or client-side handling of untrusted files — all of
which we take seriously.
