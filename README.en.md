# MD Browser

[日本語](README.md) | English

A static web app and Chrome extension for previewing Markdown files in the browser.

**Web app:** https://otaku1123.github.io/md-browser/

**Chrome extension:** [Chrome Web Store](https://chromewebstore.google.com/detail/infhmmggjagaoiiogbjkffelfdgfdkop)

**Feedback:** open an [issue](https://github.com/otaku1123/md-browser/issues/new/choose) — a [bug report](https://github.com/otaku1123/md-browser/issues/new?template=bug_report.yml) or an [idea or question](https://github.com/otaku1123/md-browser/issues/new?template=feature_request.yml). Both are also linked from the bottom of the settings panel (gear icon), which fills in the version.

Everything runs locally in your browser. Files are never uploaded, and diagrams and math are rendered by bundled engines without contacting external servers ([privacy policy](https://otaku1123.github.io/md-browser/privacy.html)).

## Features

- GitHub Flavored Markdown (tables, task lists, syntax-highlighted code). About 35 common languages are bundled; some 80 more (Dockerfile, PowerShell, CMake, ARM / x86 / AVR / MIPS assembly, Verilog, VHDL, Protobuf, nginx, Dart, Scala, Haskell, Elixir, MATLAB, Groovy, …) are loaded when a document has a code block in them (the table in `src/core/highlight.ts`)
- GitHub alerts (`> [!NOTE]` etc.) and collapsible front matter (YAML / TOML)
- Footnotes (`[^1]` and `[^1]: note`) with back links
- Emoji shortcodes (`:smile:`, `:+1:`; like GitHub, not inside code and not emoticons such as `:)`)
- Copy buttons on code blocks
- Markdown source view (the `<>` toolbar button, or Ctrl+Shift+M / ⌘+Shift+M on Mac) with line numbers, highlighting and copy-all; follows auto-reload
- Quick file switcher (Ctrl+P / ⌘+P on Mac): fuzzy-find a Markdown file of the open folder by name (↑↓, Enter, Esc); with an empty query, documents recently opened in the tab come first. Active only with two or more files, so a single file still prints; the shortcut can be changed to ⌘/Ctrl+K, ⌘/Ctrl+Shift+P or turned off in the display settings
- Hover a heading to show 🔗; click it to copy a link to that heading
- Table of contents sidebar with scroll-synced highlighting; sections with sub-headings fold with ▸ (or ← / → on a focused entry), folds survive auto-reload and are remembered per document in the tab, and a folded section stays the current entry while you read inside it; toggle it from the toolbar and resize it by dragging, with the arrow keys, or double-click to reset (saved and shared across tabs)
- Mermaid diagrams (lazy-loaded); click to enlarge, save as SVG / PNG. In the enlarged view, Ctrl/⌘ + wheel (or pinch) zooms, the wheel or a drag pans, and a double-click toggles 100% and fit (keyboard: + − 0 and the arrow keys); document images work the same way
- Math with KaTeX (`$...$`, `$$...$$`, ` ```math `; same syntax as GitHub, lazy-loaded)
- PlantUML diagrams (` ```plantuml ` / `puml` / `uml`); the official in-browser engine is bundled and lazy-loaded, and the diagram source is never sent to a server. Besides the UML diagrams, `@startjson` / `@startyaml` / `@startmindmap` / `@startwbs` / `@startgantt` work ([sample/docs/plantuml.md](sample/docs/plantuml.md)); the layout is the bundled Smetana (no Graphviz). 
- PlantUML's standard library (`!include <C4/…>`, `<awslib/…>`, `<kubernetes/…>`, …) is not bundled. Name a host in the display settings ("PlantUML"; the official one is `https://plantuml.github.io/plantuml/js-plantuml/`) and the one library a diagram includes is fetched from it and read as data, never run as a script. The host sees the library name (`c4.min.js`), not the diagram. Nothing is fetched until a host is named. Emoji (`<:…:>`) are not supported. The standard library, sprites and emoji are not bundled. Click to enlarge, save as SVG / PNG
- PlantUML's local file includes (`!include ./inc/common.iuml`, `!includesub`, `!theme X from dir`, …) work when the extension shows a `file://` document. Paths resolve against the document's folder (inside an included file, against that file's folder), and only `.puml` / `.plantuml` / `.iuml` / `.pu` files below the file sidebar's root folder are read, through the extension's service worker. Files outside it, and other kinds of file, give "cannot include" (the reason is logged to the console). Not available in the web app and the viewer. A change to an included file shows the next time the document is redrawn
- Full-text search in the folder (Ctrl+Shift+F / ⌘+Shift+F on Mac, or the 🔍 toolbar button): searches the text of every Markdown file of the open folder and lists the matches per file with the line number, the heading they are under and an excerpt. Clicking a match opens the file at that line and highlights the matches on the page (the ones on that line in another colour; cleared when the search is closed). Enter / Shift+Enter (or the ↓ ↑ buttons) go to the next / previous match; the "This file" scope searches only the shown document (an in-page find). Ignores case and character width (half-width kana too); several words are ANDed. No index: the files are read when the panel opens, so nothing is stored. Ctrl+F stays the browser's find
- Images with relative paths (when a folder is opened)
- GitHub's theme-specific images: `![](a.png#gh-dark-mode-only)` / `#gh-light-mode-only` show only in that theme, and `<picture><source media="(prefers-color-scheme: dark)" …>` follows the theme chosen in the display settings (also when it is not the OS one). Printing and PDF use the light version
- Auto-reload when the local file changes (1 s polling, Chrome / Edge)
- Relative links to other `.md` files in the folder
- Breadcrumb: the toolbar shows the document's path from the opened folder (`sample/ / docs / setup.md`; from the listed root on extension `file://` pages). Clicking a folder reveals it in the sidebar; narrow windows show the file name only
- The file sidebar shows folders collapsed; only the open document's folders are expanded (folders you expand stay open when the list refreshes)
- The file sidebar works with the keyboard: ↑↓, Home and End move, → expands a folder / enters it, ← collapses it / goes to the parent, Enter opens a file or toggles a folder
- Fold folders together: the buttons above the list expand or collapse every folder; Alt(⌥)+click, or Alt+→ / Alt+←, opens or closes a folder with all its subfolders
- Hide folders you don't need from the file sidebar (the eye button next to a folder name). Hidden folders are not scanned at all, so opening is faster; show them again from "Hidden folders" below the list. Saved per folder, only in this browser
- Favorites: the ☆ at the right of a file row pins a document to a "Favorites" section above the tree (the quick switcher ⌘/Ctrl+P lists them before the recent documents). Saved per folder, only in this browser (by the root folder's URL on `file://` pages, by the folder's name in the web app and viewer; not synced)
- When a folder is opened, names starting with `.` and `node_modules`, `bower_components`, `vendor`, `dist`, `build`, `out`, `target`, `coverage`, `venv` and `__pycache__` are skipped (web app and extension alike)
- Display settings (gear button): theme (system / light / dark), text size, content width, image and diagram size (50–200% of their own size, never wider than the text), body and code fonts. Stored in `chrome.storage.sync` (extension) or `localStorage` (web) and applied to other tabs immediately
- Custom CSS (in the display settings): a stylesheet of your own for the document, applied as you type. It is wrapped in `@scope (.content)`, so it cannot break the toolbar or the settings panel (and, the other way round, cannot reach the page background or `@font-face`). "Apply" switches it off without losing it; "Include in HTML export" puts the same CSS into a saved HTML file. A `url(https://…)` in it makes the browser fetch that address. Stored on this computer only (`chrome.storage.local` in the extension, `localStorage` on the web), never synced
- Folder CSS (when the extension shows a `file://` document; off by default): a `.md-browser.css` in the document's folder (or else in the root folder of the file list) styles the document. Switch it on with "Apply the folder's `.md-browser.css`" in the custom CSS section of the display settings (shared by every tab, synced). Like the custom CSS it is wrapped in `@scope (.content)`, and it goes before the custom CSS, so your own stylesheet wins where they clash. It is off by default because that file is written by whoever made the folder, and a `url(https://…)` in it makes the browser fetch that address. A change to the file shows when the page is opened again. Not available in the web app and the viewer
- Print / PDF (in the display settings): paper (A4 / Letter), orientation and margins, plus "Write the URL after each link", "Table of contents on the first page" and "New page before each h1". They apply to "Save as PDF" and to the browser's print (⌘/Ctrl+P), and are stored with the other display settings
- Resize single images and diagrams: hover (or focus with the keyboard) to show "− / n% / +" at the top right (25–300%; "n%" goes back to the display setting; always shown on touch screens). Saved per document, only in this browser (by file URL on `file://` pages, by opened folder name + path in the web app and viewer; not synced)
- Print / PDF output without the toolbar and sidebars, in light colors on white
- Export (display settings ⚙ → Export): save the shown document as one HTML file with the styles, diagrams and images embedded, in the current text size and width (on file:// pages, images below the file sidebar's root folder are read through the extension's service worker and embedded; images outside it keep their local paths). Options: the theme (as shown, or light whatever the page shows, diagrams and theme images included), a table of contents at the top (a collapsible `<details>`, no script) and the math fonts (only the KaTeX woff2 files the document uses, as data: URLs; off, the reader's fonts stand in). "Save as PDF" opens the browser's print dialog
- Open in editor (extension `file://` pages only): choose VS Code, Cursor or a custom URL (`{path}` and `{line}` are filled in, e.g. `idea://open?file={path}&line={line}`) under "Editor" in the display settings ⚙, and a toolbar button opens the file at the line shown at the top. Off by default, since it launches another application (the browser asks before doing so)
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
