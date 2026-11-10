# Features in detail

[日本語](features.md) | English

The long version of the feature list in the [README](../README.en.md): how each feature is used, its shortcuts, where its settings are stored and whether they sync, and its limits. Everything applies to the web app, the Chrome extension and the extension's viewer alike unless it says otherwise.

## Rendering

- GitHub Flavored Markdown (tables, task lists, syntax-highlighted code). About 35 common languages are bundled; some 80 more (Dockerfile, PowerShell, CMake, ARM / x86 / AVR / MIPS assembly, Verilog, VHDL, Protobuf, nginx, Dart, Scala, Haskell, Elixir, MATLAB, Groovy, …) are loaded when a document has a code block in them (the table in `src/core/highlight.ts`)
- Emphasis next to CJK punctuation: `**原因。**が` or `**「注意」**です` is bold even though the `**` (or `*`, `~~`) touches a full stop or bracket, where CommonMark reads the markers as text and GitHub shows them literally. Follows the [CJK-friendly amendment](https://github.com/tats-u/markdown-cjk-friendly); text without CJK characters renders as before
- GitHub alerts (`> [!NOTE]` etc.) and collapsible front matter (YAML / TOML)
- Footnotes (`[^1]` and `[^1]: note`) with back links
- Emoji shortcodes (`:smile:`, `:+1:`; like GitHub, not inside code and not emoticons such as `:)`)
- Images with relative paths (when a folder is opened)
- GitHub's theme-specific images: `![](a.png#gh-dark-mode-only)` / `#gh-light-mode-only` show only in that theme, and `<picture><source media="(prefers-color-scheme: dark)" …>` follows the theme chosen in the display settings (also when it is not the OS one). Printing and PDF use the light version
- Auto-reload when the local file changes (1 s polling, Chrome / Edge)
- Relative links to other `.md` files in the folder

## Diagrams and math

- Mermaid diagrams (lazy-loaded); click to enlarge, save as SVG / PNG. In the enlarged view, Ctrl/⌘ + wheel (or pinch) zooms, the wheel or a drag pans, and a double-click toggles 100% and fit (keyboard: + − 0 and the arrow keys); document images work the same way
- Math with KaTeX (`$...$`, `$$...$$`, ` ```math `; same syntax as GitHub, lazy-loaded)
- PlantUML diagrams (` ```plantuml ` / `puml` / `uml`); the official in-browser engine is bundled and lazy-loaded, and the diagram source is never sent to a server. Besides the UML diagrams, `@startjson` / `@startyaml` / `@startmindmap` / `@startwbs` / `@startgantt` work ([sample/docs/plantuml.md](../sample/docs/plantuml.md)); the layout is the bundled Smetana (no Graphviz). 
- PlantUML's standard library (`!include <C4/…>`, `<awslib/…>`, `<kubernetes/…>`, …) is not bundled. Name a host in the display settings ("PlantUML"; the official one is `https://plantuml.github.io/plantuml/js-plantuml/`) and the one library a diagram includes is fetched from it and read as data, never run as a script. The host sees the library name (`c4.min.js`), not the diagram. Nothing is fetched until a host is named. Emoji (`<:…:>`) are not supported. The standard library, sprites and emoji are not bundled. Click to enlarge, save as SVG / PNG
- PlantUML's local file includes (`!include ./inc/common.iuml`, `!includesub`, `!theme X from dir`, …) work when the extension shows a `file://` document. Paths resolve against the document's folder (inside an included file, against that file's folder), and only `.puml` / `.plantuml` / `.iuml` / `.pu` files below the file sidebar's root folder are read, through the extension's service worker. Files outside it, and other kinds of file, give "cannot include" (the reason is logged to the console). Not available in the web app and the viewer. A change to an included file shows the next time the document is redrawn

## Navigation

- Table of contents sidebar with scroll-synced highlighting; sections with sub-headings fold with ▸ (or ← / → on a focused entry), folds survive auto-reload and are remembered per document in the tab, and a folded section stays the current entry while you read inside it; toggle it from the toolbar and resize it by dragging, with the arrow keys, or double-click to reset (saved and shared across tabs)
- Breadcrumb: the toolbar shows the document's path from the opened folder (`sample/ / docs / setup.md`; from the listed root on extension `file://` pages). Clicking a folder reveals it in the sidebar; narrow windows show the file name only
- The file sidebar shows folders collapsed; only the open document's folders are expanded (folders you expand stay open when the list refreshes)
- The file sidebar works with the keyboard: ↑↓, Home and End move, → expands a folder / enters it, ← collapses it / goes to the parent, Enter opens a file or toggles a folder
- Fold folders together: the buttons above the list expand or collapse every folder; Alt(⌥)+click, or Alt+→ / Alt+←, opens or closes a folder with all its subfolders
- Hide folders you don't need from the file sidebar (the eye button next to a folder name). Hidden folders are not scanned at all, so opening is faster; show them again from "Hidden folders" below the list. Saved per folder, only in this browser
- Favorites: the ☆ at the right of a file row pins a document to a "Favorites" section above the tree (the quick switcher ⌘/Ctrl+P lists them before the recent documents). Saved per folder, only in this browser (by the root folder's URL on `file://` pages, by the folder's name in the web app and viewer; not synced)
- When a folder is opened, names starting with `.` and `node_modules`, `bower_components`, `vendor`, `dist`, `build`, `out`, `target`, `coverage`, `venv` and `__pycache__` are skipped (web app and extension alike)
- Quick file switcher (Ctrl+P / ⌘+P on Mac): fuzzy-find a Markdown file of the open folder by name (↑↓, Enter, Esc); with an empty query, documents recently opened in the tab come first. Active only with two or more files, so a single file still prints; the shortcut can be changed to ⌘/Ctrl+K, ⌘/Ctrl+Shift+P or turned off in the display settings
- Full-text search in the folder (Ctrl+Shift+F / ⌘+Shift+F on Mac, or the 🔍 toolbar button): searches the text of every Markdown file of the open folder and lists the matches per file with the line number, the heading they are under and an excerpt. Clicking a match opens the file at that line and highlights the matches on the page (the ones on that line in another colour; cleared when the search is closed). Enter / Shift+Enter (or the ↓ ↑ buttons) go to the next / previous match; the "This file" scope searches only the shown document (an in-page find). Ignores case and character width (half-width kana too); several words are ANDed. No index: the files are read when the panel opens, so nothing is stored. Ctrl+F stays the browser's find
- Hover a heading to show 🔗; click it to copy a link to that heading
- Copy buttons on code blocks
- Markdown source view (the `<>` toolbar button, or Ctrl+Shift+M / ⌘+Shift+M on Mac) with line numbers, highlighting and copy-all; follows auto-reload

## Display settings (⚙)

- Display settings (gear button): theme (system / light / dark), text size, content width, image and diagram size (50–200% of their own size; up to 100% fitted to the text, beyond it wider than the text and scrolled sideways, fitted to the paper when printing), body and code fonts. Stored in `chrome.storage.sync` (extension) or `localStorage` (web) and applied to other tabs immediately
- Custom CSS (in the display settings): a stylesheet of your own for the document, applied as you type. It is wrapped in `@scope (.content)`, so it cannot break the toolbar or the settings panel (and, the other way round, cannot reach the page background or `@font-face`). "Apply" switches it off without losing it; "Include in HTML export" puts the same CSS into a saved HTML file. A `url(https://…)` in it makes the browser fetch that address. Stored on this computer only (`chrome.storage.local` in the extension, `localStorage` on the web), never synced
- Folder CSS (when the extension shows a `file://` document; off by default): a `.md-browser.css` in the document's folder (or else in the root folder of the file list) styles the document. Switch it on with "Apply the folder's `.md-browser.css`" in the custom CSS section of the display settings (shared by every tab, synced). Like the custom CSS it is wrapped in `@scope (.content)`, and it goes before the custom CSS, so your own stylesheet wins where they clash. It is off by default because that file is written by whoever made the folder, and a `url(https://…)` in it makes the browser fetch that address. A change to the file shows when the page is opened again. Not available in the web app and the viewer
- Print / PDF (in the display settings): paper (A4 / Letter), orientation and margins, plus "Write the URL after each link", "Table of contents on the first page" and "New page before each h1". They apply to "Save as PDF" and to the browser's print (⌘/Ctrl+P), and are stored with the other display settings
- Resize single images and diagrams: hover (or focus with the keyboard) to show "− / n% / +" at the top right (25–300%; "n%" goes back to the display setting; always shown on touch screens; above 100% the item may be wider than the text and scrolls sideways). Saved per document, only in this browser (by file URL on `file://` pages, by opened folder name + path in the web app and viewer; not synced)
- Print / PDF output without the toolbar and sidebars, in light colors on white
- Export (display settings ⚙ → Export): save the shown document as one HTML file with the styles, diagrams and images embedded, in the current text size and width (on file:// pages, images below the file sidebar's root folder are read through the extension's service worker and embedded; images outside it keep their local paths). Options: the theme (as shown, or light whatever the page shows, diagrams and theme images included), a table of contents at the top (a collapsible `<details>`, no script) and the math fonts (only the KaTeX woff2 files the document uses, as data: URLs; off, the reader's fonts stand in). "Save as PDF" opens the browser's print dialog
- Open in editor (extension `file://` pages only): choose VS Code, Cursor or a custom URL (`{path}` and `{line}` are filled in, e.g. `idea://open?file={path}&line={line}`) under "Editor" in the display settings ⚙, and a toolbar button opens the file at the line shown at the top. Off by default, since it launches another application (the browser asks before doing so)

## Other

- Restores the last file / folder after a reload (web app and viewer). The start screen lists up to 10 recently opened items
- Japanese and English UI, following the browser language
