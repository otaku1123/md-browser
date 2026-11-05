# MD Browser

[日本語](README.md) | English

A static web app and Chrome extension for previewing Markdown files in the browser.

**Web app:** https://otaku1123.github.io/md-browser/

**Chrome extension:** [Chrome Web Store](https://chromewebstore.google.com/detail/infhmmggjagaoiiogbjkffelfdgfdkop)

**Feedback:** open an [issue](https://github.com/otaku1123/md-browser/issues/new/choose) — a [bug report](https://github.com/otaku1123/md-browser/issues/new?template=bug_report.yml) or an [idea or question](https://github.com/otaku1123/md-browser/issues/new?template=feature_request.yml). Both are also linked from the bottom of the settings panel (gear icon), which fills in the version.

Everything runs locally in your browser. Files are never uploaded, and diagrams and math are rendered by bundled engines without contacting external servers ([privacy policy](https://otaku1123.github.io/md-browser/privacy.html)).

## Features

The details (how things are used, shortcuts, where settings are stored, limits) are in [docs/features.en.md](docs/features.en.md).

**Rendering**

- GitHub Flavored Markdown (tables, task lists, syntax highlighting for about 120 languages), alerts, front matter, footnotes and emoji shortcodes
- Mermaid and PlantUML diagrams and KaTeX math, all drawn in the browser; click to enlarge, save as SVG / PNG
- Relative images and links, GitHub's theme-specific images, and auto-reload when the file is saved (Chrome / Edge)

**Navigation**

- A table of contents sidebar (scroll-synced, foldable sections) and a file sidebar (fold and hide folders, favorites, breadcrumb, keyboard navigation)
- Quick file switcher (⌘/Ctrl+P) and full-text search in the folder (⌘/Ctrl+Shift+F)
- Copy a heading's link, copy a code block, show the Markdown source (⌘/Ctrl+Shift+M)

**Display settings (⚙)**

- Theme, text size, content width, fonts and image size (single images and diagrams can be resized too)
- Custom CSS, and a folder's own `.md-browser.css` (extension only, off by default)
- Print / PDF options, export as one self-contained HTML file, open in editor (extension only)

**Other**

- Restores the last file / folder after a reload, with a list of recently opened items (web app and viewer)
- Japanese and English UI; everything runs in the browser and no file is uploaded

## Usage (web app)

Open a file or a folder with the buttons, or drop it onto the page.

| How you open it | Auto-reload | Relative images |
|---|---|---|
| Open folder / drop a folder | ✓ | ✓ |
| Open file / drop a file (Chrome / Edge) | ✓ | – |
| Firefox / Safari | – | Only when a folder is opened |

## Chrome extension

### What it does

- Opening `file:///…/*.md` renders the file in place (TOC, diagrams, relative images, links to other Markdown files)
- Saving the file re-renders it in about a second, keeping the scroll position
- Lists Markdown files in the same folder and its subfolders in a left sidebar (when there are two or more; the skipped folders and hiding folders are described in [docs/features.en.md](docs/features.en.md))
- Clicking the toolbar icon opens the same viewer as the web app inside the extension

### Install from the Chrome Web Store

1. Click "Add to Chrome" on the [Chrome Web Store](https://chromewebstore.google.com/detail/infhmmggjagaoiiogbjkffelfdgfdkop)
2. From the setup page that opens, go to the extension's details and **turn on "Allow access to file URLs"** (required)
3. Drag a `.md` file into Chrome (or open `file:///path/README.md`)

Expected result: the file is rendered with a table of contents, and "Auto-reload ON" appears at the top right.

### Troubleshooting

| Symptom | What to check |
|---|---|
| The file is shown as plain text | "Allow access to file URLs" is on in the extension's details. Reload the tab after turning it on |
| The `.md` file is downloaded instead | This depends on the OS MIME settings. Drag and drop the file, or use the viewer from the toolbar icon |
| "Auto-reload OFF" is shown | Reload the extension on `chrome://extensions`, then reload the tab |

### How it works

- A `file://` page cannot re-read itself because of CORS, so the extension's service worker reads the file and hands it to the page
- The service worker only reads the `.md` file that the requesting tab itself has open and files below the tab's root folder that the page names by a root-relative path (`..` and absolute paths are refused; no arbitrary file is read). The page can name `.md` files for full-text search, images for the HTML export to embed (extensions png / jpg / jpeg / gif / webp / svg / avif / bmp, returned as data: URLs, up to 20 MB) and the files a PlantUML diagram includes and the folder CSS `.md-browser.css` (extensions puml / plantuml / iuml / pu / css, returned as text, up to 2 MB); any other kind of file is refused by its name
- The file list is read only from the folder of the file the tab first opened and below (from Chrome's folder listing page; never parent folders; up to 4 levels, 500 files and 200 folders). Excluded and user-hidden folders are never listed. Hide / show requests get the same tab check, and the page sends only a path relative to the root

## Development

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # type check + build to dist/
npm test           # unit tests (vitest + jsdom)
npx playwright install chromium   # first time only
npm run test:e2e   # build the web app and extension, then run E2E tests (Playwright)
npm run build:ext  # build the extension to dist-extension/
npm run pack:ext   # create release/md-browser-<version>.zip
npm run ext:try    # open the built extension in a throwaway Chromium (Playwright's) to look at it
```

To load a development build, open `chrome://extensions`, turn on Developer mode, choose "Load unpacked" and select `dist-extension/`, then turn on "Allow access to file URLs" in the extension's details. Or skip that: `npm run ext:try` builds the extension and opens `sample/README.md` (or the document you pass: `npm run ext:try -- ~/notes/memo.md`) in a Chromium with the extension loaded and file URL access granted; `--watch` rebuilds on source changes and restarts Chromium with the same tabs (without type-checking). Close the window or press Ctrl+C to quit; the profile is deleted. Chrome 137 and later ignore `--load-extension`, hence Chromium.

Screenshot tests (`tests/e2e/visual-*.spec.ts`) compare pages with the baselines in `tests/e2e/__screenshots__/`. Fonts render differently on each OS, so baselines are made on CI (Linux) and the tests skip elsewhere. After an intended visual change, regenerate them on CI and commit them:

```sh
gh workflow run test.yml --ref <branch> -f update_screenshots=true
gh run list --workflow test.yml --branch <branch> -L 1   # find the run ID
gh run download <run-id> -n screenshots -D tests/e2e/__screenshots__
git diff --stat tests/e2e/__screenshots__   # review the images, then commit
```

### Comparing with GitHub's rendering

`tests/fixtures/gfm/*.md` are small Markdown files, one per construct, with the HTML the GitHub Markdown API returned for each saved next to it as `*.github.html`. The unit test `tests/unit/gfm-compat.test.ts` normalizes both sides (`tests/unit/gfm-normalize.ts` drops presentation attributes such as class, id and `dir`, and GitHub's own wrappers) and compares the structure, so a failing fixture is a difference from GitHub. Known differences are listed with their reason in `GAPS` in that test and are removed once fixed; intended differences (keeping `style` attributes and `<abbr>`, drawing PlantUML, removing unsafe HTML instead of showing it as text) are absorbed by the normalizer, each with a comment.

After editing a fixture, fetch GitHub's side again (this is the only command that goes online; CI uses the saved files):

```sh
npm run gfm:fetch              # only fixtures that changed (unauthenticated: 60 requests per hour; uses gh auth token when available)
npm run gfm:fetch -- --force   # all of them (GitHub changed its output)
```

The API's `markdown` mode matches how a README is shown, except that alerts, task lists and math are added later on github.com and are left alone by the API. Fixtures for those start with `<!-- gfm-fixture mode: gfm -->` to use the `gfm` mode (the comment renderer: line breaks become `<br>` and headings get no anchors).

On a diff failure, the `playwright-report` artifact holds the expected, actual and diff images. To try them locally on any OS, `VISUAL_LOCAL=<temp dir> npx playwright test --project=visual-web --project=visual-extension --update-snapshots` writes the images outside the repo.

Branching, release and store submission notes are in the [Japanese README](README.md).

## License

[MIT](LICENSE). Notices for bundled third-party libraries are generated at build time as `THIRD_PARTY_NOTICES.txt`.
