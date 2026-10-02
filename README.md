# Room 108 — local feasibility prototype

## Try it

On this computer, open `dist/index.html` in Chrome or Edge. Keep the whole `dist` folder together. No installation, internet connection, account, or application backend is needed.

For phone testing:

1. Double-click `start-local.cmd` and keep its window open. If the preview is already running, use its existing address instead.
2. Connect the phone and computer to the same trusted Wi-Fi network.
3. Open the printed **Phone test** address in Android Chrome or iPhone Safari. Do not type `localhost` on the phone; that refers to the phone itself.
4. If Windows requests firewall access, allow **Private networks** only. School/guest Wi-Fi may block communication between devices.
5. Enter a name, choose or take three photos, write three paragraphs and an ending, preview, and download the PDF.
6. On iPhone, if the PDF opens in a viewer, use **Share → Save to Files**. A second download link remains available.
7. Stop the local server with **Ctrl+C** when finished.

The optional server only serves the static app files. It does not accept uploads, process stories, or store student data. LAN mode makes these app files reachable by other devices on that network while it runs. No internet deployment has been performed.

## What is implemented

- Plain HTML/CSS/JavaScript; no build step or framework.
- Touch-friendly photo picker and separate camera input, native form validation, editable story preview.
- Browser-native EXIF orientation handling, aspect-ratio-preserving resize to at most 1600 pixels on the longest side, JPEG quality 0.8, white background for transparent images.
- One photo is processed at a time; only the three compressed JPEGs are retained. Replaced images and temporary object URLs are released.
- 25 MB input limit and 50-megapixel decoded-image limit. Browser decoding still requires temporary memory for the original image; these limits cannot guarantee survival on every low-memory phone.
- Local, pinned jsPDF 4.2.1 with its MIT license in `dist/vendor`. No CDN, analytics, external requests, or browser storage. CSP disallows network API connections.
- A4 PDFs, 18 mm margins, scene headings, photos fitted without cropping, wrapped paragraphs that continue onto additional pages, page numbers, and final ending.
- Browser-shaped paragraph text supports Thai names and punctuation. Paragraphs are embedded as small high-resolution raster blocks rather than a full-page screenshot. **Paragraph text is not selectable/searchable in the PDF.** Headings remain PDF text. This is a deliberate prototype tradeoff for reliable browser font shaping without another font dependency.

## Limitations to test on real phones

- Android Chrome and iPhone Safari have not been tested on physical devices. Desktop Chrome mobile emulation does not establish Safari, camera, low-memory, or native download compatibility.
- Camera availability and the exact picker UI are controlled by the browser/OS. The file-input camera route does not use `getUserMedia`.
- JPEG/PNG are the safest inputs. HEIC works only if that browser can decode it; otherwise the app gives a clear message to use JPEG/PNG or take a new photo. No HEIC converter is bundled.
- Closing or refreshing loses the story. Browser exit warnings are best-effort and may not appear on mobile. Download before leaving.
- Student names are limited to 100 characters; each paragraph is limited to 3000 characters.

## Checks performed

`tests/flow.cjs` uses Playwright and installed Chrome. `tests/fixtures.py` creates synthetic 12-megapixel JPEG fixtures; these are not photographs from a physical phone.

Passed: full three-photo story flow, landscape/portrait dimensions, EXIF orientation 6, compression, missing-photo validation, corrupt-image recovery, preview, normal and long PDF downloads, unbroken long-word wrapping, 320/390/768/1280 px widths, no uncaught JavaScript errors, and no external network requests.

The normal PDF has 3 pages; the long-input PDF has 7 pages. Both were rendered with Poppler and visually inspected for image proportions, text wrapping, page boundaries, Thai name rendering, final text, and page numbers. Test artifacts and recorded results are in `tests/output/`.

For this computer's bundled runtimes, reproduce checks in PowerShell from this folder:

```powershell
& "$env:USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe" tests/fixtures.py
$env:ROOM108_PACKAGES = "$env:USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules"
& "$env:USERPROFILE/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe" tests/flow.cjs
```

The test server must already be running on port 8108. Tests use the installed Chrome executable at `C:/Program Files/Google/Chrome/Application/chrome.exe`. These test tools are not app runtime dependencies.

References: [jsPDF documentation](https://github.com/parallax/jsPDF), [browser file input and capture](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/file).
