# MD Browser

[日本語](README.md) | English

A static web app and Chrome extension for previewing Markdown files in the browser.

**Web app:** https://otaku1123.github.io/md-browser/

**Chrome extension:** [Chrome Web Store](https://chromewebstore.google.com/detail/infhmmggjagaoiiogbjkffelfdgfdkop)

**Feedback:** open an [issue](https://github.com/otaku1123/md-browser/issues/new/choose) — a [bug report](https://github.com/otaku1123/md-browser/issues/new?template=bug_report.yml) or an [idea or question](https://github.com/otaku1123/md-browser/issues/new?template=feature_request.yml). Both are also linked from the bottom of the settings panel (gear icon), which fills in the version.

Everything runs locally in your browser. Files are never uploaded, and diagrams and math are rendered by bundled engines without contacting external servers ([privacy policy](https://otaku1123.github.io/md-browser/privacy.html)).

## Features

- GitHub Flavored Markdown (tables, task lists, syntax-highlighted code)
- GitHub alerts (`> [!NOTE]` etc.) and collapsible front matter (YAML / TOML)
- Footnotes (`[^1]` and `[^1]: note`) with back links
- Emoji shortcodes (`:smile:`, `:+1:`; like GitHub, not inside code and not emoticons such as `:)`)
- Copy buttons on code blocks
- Markdown source view (the `<>` toolbar button, or Ctrl+Shift+M / ⌘+Shift+M on Mac) with line numbers, highlighting and copy-all; follows auto-reload
- Quick file switcher (Ctrl+P / ⌘+P on Mac): fuzzy-find a Markdown file of the open folder by name (↑↓, Enter, Esc); with an empty query, documents recently opened in the tab come first. Active only with two or more files, so a single file still prints; the shortcut can be changed to ⌘/Ctrl+K, ⌘/Ctrl+Shift+P or turned off in the display settings
- Hover a heading to show 🔗; click it to copy a link to that heading
- Table of contents sidebar with scroll-synced highlighting; toggle it from the toolbar and resize it by dragging, with the arrow keys, or double-click to reset (saved and shared across tabs)
- Mermaid diagrams (lazy-loaded); click to enlarge, save as SVG / PNG
- Math with KaTeX (`$...$`, `$$...$$`, ` ```math `; same syntax as GitHub, lazy-loaded)
- PlantUML diagrams (` ```plantuml ` / `puml` / `uml`); the official in-browser engine is bundled and lazy-loaded, nothing is sent to a server. The standard library, sprites and emoji are not bundled. Click to enlarge, save as SVG / PNG
- Full-text search in the folder (Ctrl+Shift+F / ⌘+Shift+F on Mac, or the 🔍 toolbar button): searches the text of every Markdown file of the open folder and lists the matches per file with the line number, the heading they are under and an excerpt. Ignores case and character width (half-width kana too); several words are ANDed. No index: the files are read when the panel opens, so nothing is stored. Ctrl+F stays the browser's find
- Images with relative paths (when a folder is opened)
- Auto-reload when the local file changes (1 s polling, Chrome / Edge)
- Relative links to other `.md` files in the folder
- The file sidebar shows folders collapsed; only the open document's folders are expanded (folders you expand stay open when the list refreshes)
- The file sidebar works with the keyboard: ↑↓, Home and End move, → expands a folder / enters it, ← collapses it / goes to the parent, Enter opens a file or toggles a folder
- Hide folders you don't need from the file sidebar (the eye button next to a folder name). Hidden folders are not scanned at all, so opening is faster; show them again from "Hidden folders" below the list. Saved per folder, only in this browser
- When a folder is opened, names starting with `.` and `node_modules`, `bower_components`, `vendor`, `dist`, `build`, `out`, `target`, `coverage`, `venv` and `__pycache__` are skipped (web app and extension alike)
- Display settings (gear button): theme (system / light / dark), text size, content width, image and diagram size (50–200% of their own size, never wider than the text), body and code fonts. Stored in `chrome.storage.sync` (extension) or `localStorage` (web) and applied to other tabs immediately
- Resize single images and diagrams: hover (or focus with the keyboard) to show "− / n% / +" at the top right (25–300%; "n%" goes back to the display setting; always shown on touch screens). Saved per document, only in this browser (by file URL on `file://` pages, by opened folder name + path in the web app and viewer; not synced)
- Print / PDF output without the toolbar and sidebars, in light colors on white
- Restores the last file / folder after a reload (web app and viewer). The start screen lists up to 10 recently opened items
- Japanese and English UI, following the browser language

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
- Lists Markdown files in the same folder and its subfolders in a left sidebar (when there are two or more; names starting with `.` and `node_modules`, `bower_components`, `vendor`, `dist`, `build`, `out`, `target`, `coverage`, `venv` and `__pycache__` are skipped). Folders start collapsed; only the open document's folders are expanded. Folders can be hidden with the button next to their name (saved per root folder in `chrome.storage.local`, not synced)
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
- The service worker only reads the `.md` file that the requesting tab itself has open and, for full-text search, `.md` files below the tab's root folder that the page names by a root-relative path (`..` and absolute paths are refused)
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
```

To load a development build, open `chrome://extensions`, turn on Developer mode, choose "Load unpacked" and select `dist-extension/`, then turn on "Allow access to file URLs" in the extension's details.

Screenshot tests (`tests/e2e/visual-*.spec.ts`) compare pages with the baselines in `tests/e2e/__screenshots__/`. Fonts render differently on each OS, so baselines are made on CI (Linux) and the tests skip elsewhere. After an intended visual change, regenerate them on CI and commit them:

```sh
gh workflow run test.yml --ref <branch> -f update_screenshots=true
gh run list --workflow test.yml --branch <branch> -L 1   # find the run ID
gh run download <run-id> -n screenshots -D tests/e2e/__screenshots__
git diff --stat tests/e2e/__screenshots__   # review the images, then commit
```

On a diff failure, the `playwright-report` artifact holds the expected, actual and diff images. To try them locally on any OS, `VISUAL_LOCAL=<temp dir> npx playwright test --project=visual-web --project=visual-extension --update-snapshots` writes the images outside the repo.

Branching, release and store submission notes are in the [Japanese README](README.md).

## License

[MIT](LICENSE). Notices for bundled third-party libraries are generated at build time as `THIRD_PARTY_NOTICES.txt`.
