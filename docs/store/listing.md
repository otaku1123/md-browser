# Chrome ウェブストア 提出用メモ

デベロッパー ダッシュボード（https://chrome.google.com/webstore/devconsole ）に入力する内容をまとめたもの。

パッケージのアップロードと審査への提出は、タグを push すると自動で行われる（[auto-publish.md](auto-publish.md)）。このメモは、掲載情報を変えるときと、手動で提出するときに使う。

## 前提条件

- Chrome ウェブストアのデベロッパー登録が済んでいる（登録料 $5、一度だけ）
- Google アカウントで 2 段階認証が有効になっている
- リリース PR（`develop` → `main`）がマージ済み。リリース PR では CI の `release-check` ジョブ（`scripts/release-check.mjs`）が、バージョンの上げ忘れ、manifest の権限面の変更、ストア用 zip のサイズ増（+25% 超）、名前・概要の文字数上限を検査する。権限面を意図して変えるときは PR に `store-permissions` ラベルを付け、本書の権限説明と `privacy.html` を更新する
- 提出するコミットに `v<version>` タグを付けて push 済み（ストアの版とコードを対応づけるため）
  ```sh
  git fetch && git tag -a v<version> origin/main -m "Release <version>" && git push origin v<version>
  ```
- タグの push で動く Release ワークフロー（`.github/workflows/release.yml`）が成功し、GitHub Release に `md-browser-<version>.zip` が添付されている。それを `release/` にダウンロード済み
  ```sh
  gh release download v<version> -p '*.zip' -D release
  ```
  - ワークフローは、タグと `package.json`・manifest のバージョンが一致しない場合や、タグが `main` 上にない場合に失敗する（`develop` には未リリースの変更が入るため）
  - 手元で作る場合は、`main` ブランチで `npm run pack:ext` を実行する
- GitHub Pages に `privacy.html` がデプロイ済み（`main` に push すれば自動でデプロイされる）

## 1. パッケージ

| 項目 | 値 |
|---|---|
| アップロードするファイル | `release/md-browser-1.10.0.zip` |
| バージョン | `extension/public/manifest.json` の `version`。更新するたびに上げる |

## 2. ストア掲載情報（Store listing）

### 基本

| 項目 | 値 |
|---|---|
| カテゴリ | Developer Tools（デベロッパー ツール） |
| 言語 | English（既定）＋ 日本語 |
| ホームページ URL | https://github.com/otaku1123/md-browser |
| サポート URL | https://github.com/otaku1123/md-browser/issues |

名前と概要（132 文字以内）は manifest の `_locales` から自動で読み込まれる。

### 詳細説明（English）

```text
MD Browser renders local Markdown files right in Chrome — with a table of contents, Mermaid diagrams, and live reload.

Open any .md file from your computer (drag it into Chrome or open file:///…/README.md) and it is displayed as a clean, readable document instead of plain text.

FEATURES
• GitHub-style rendering: tables, task lists, syntax-highlighted code blocks
• Sidebar table of contents that follows your scroll position; hide it or drag to resize
• Sidebar listing the other Markdown files in the same folder and its subfolders, one click to open; also resizable, and folders you don't need can be hidden
• Full-text search across the folder (Ctrl/⌘+Shift+F): matches grouped by file with the line, the heading and an excerpt; click one to jump there with the matches highlighted. Ignores case and character width; "This file" searches only the open document. No index, nothing stored
• Quick file switcher (Ctrl/⌘+P): open any file of the folder by typing part of its name
• Mermaid diagrams (flowcharts, sequence diagrams, and more): click to enlarge, save as SVG or PNG
• PlantUML diagrams, drawn inside the browser (nothing is sent to a PlantUML server)
• Math with KaTeX ($…$, $$…$$ and ```math blocks, as on GitHub), footnotes, and emoji shortcodes (:smile:)
• Live reload: save the file in your editor and the page re-renders within about a second, keeping your scroll position
• GitHub alerts (> [!NOTE], > [!WARNING] …) and collapsible front matter (YAML / TOML)
• One-click copy button on code blocks, and a link button on headings
• Switch to the raw Markdown source (button or Ctrl/⌘+Shift+M), with line numbers
• Display settings: theme (system / light / dark), text size, content width, image and diagram size (50–200%), and fonts for body text and code
• Resize a single image or diagram with the −/+ buttons that appear on hover; remembered for each document
• Click an image to see it at full size
• Works from the keyboard and with screen readers: a skip link to the document, and Enter opens diagrams and images
• Relative images and links to other .md files just work
• Print-friendly output: prints (or saves as PDF) on white, without the toolbar and sidebars
• Tab icon shows which tabs are rendered by MD Browser, and marks files that changed (or can't be read) while the tab was in the background
• Built-in viewer (click the toolbar icon) to open files or whole folders, with a collapsible file tree and the folder name in the toolbar; a list of recently opened files and folders, and an adjustable scan limit for very large folders
• Report a bug or suggest an idea from the settings panel: it opens a GitHub issue form, and nothing is sent unless you submit it

PRIVACY
Everything runs locally in your browser. No data is collected or sent anywhere, and there are no analytics. The extension only reads the Markdown file you are viewing and, for the file sidebar, the names of the files in that file's folder and below; their contents are read only when you search the folder, in the page and in memory only — nothing is indexed or saved.

SETUP (important)
Chrome requires one extra step for extensions that read local files:
1. Open chrome://extensions and click "Details" on MD Browser
2. Turn on "Allow access to file URLs"
The extension shows these steps automatically after installation.

Open source (MIT): https://github.com/otaku1123/md-browser
```

### 詳細説明（日本語）

```text
MD Browser は、パソコン上の Markdown ファイルを Chrome で読みやすく表示する拡張機能です。目次・Mermaid 図・自動更新に対応しています。

.md ファイルを Chrome にドラッグする（または file:///…/README.md を開く）だけで、プレーンテキストではなく整形されたドキュメントとして表示されます。

主な機能
• GitHub 風の表示：表・タスクリスト・シンタックスハイライト付きコードブロック
• スクロール位置に連動する目次サイドバー（表示の切り替え、ドラッグで幅を変更）
• 同じフォルダとサブフォルダにある他の Markdown ファイルをサイドバーに一覧表示し、クリックで開ける（幅も変更可能。不要なフォルダは非表示にできる）
• Mermaid 図（フローチャート、シーケンス図など）。クリックで拡大し、SVG・PNG で保存
• PlantUML 図（ブラウザ内で描画し、PlantUML のサーバーには送信しません）
• KaTeX による数式（GitHub と同じ $…$、$$…$$、```math）、脚注、絵文字（:smile:）
• 自動更新：エディタで保存すると約 1 秒で再描画（スクロール位置を保持）
• GitHub のアラート記法（> [!NOTE]、> [!WARNING] など）と、Front matter（YAML / TOML）の折りたたみ表示
• コードブロックのワンクリックコピーと、見出しへのリンクのコピー
• 元の Markdown テキスト表示への切り替え（ボタンまたは Ctrl/⌘+Shift+M、行番号付き）
• 表示設定：テーマ（OS 設定 / ライト / ダーク）、文字サイズ、本文幅、画像・図のサイズ（50〜200%）、本文とコードのフォント
• 画像や図にマウスを乗せると出る −/+ ボタンで、1 つずつ大きさを変更（文書ごとに記憶）
• 画像をクリックすると原寸で表示
• キーボードやスクリーンリーダーでも操作しやすい（本文へのスキップリンク、Enter で図や画像を拡大）
• 相対パスの画像や、他の .md ファイルへのリンクもそのまま動作
• 印刷・PDF 保存に対応（ツールバーやサイドバーを除き、白背景で出力）
• タブのアイコンで MD Browser が表示しているタブがひと目でわかり、裏のタブでファイルが更新された（または読めなくなった）ことも表示
• ツールバーのアイコンから開けるビューアー（ファイル・フォルダ単位で表示、折りたためるファイルツリーとフォルダ名の表示付き。最近開いたファイル・フォルダの一覧。大きなフォルダの走査上限は変更可能）
• 設定パネルから不具合の報告や要望の投稿ができる（GitHub の Issue フォームが開きます。送信するまで何も送られません）

プライバシー
すべての処理はブラウザ内で完結します。データの収集・送信やアクセス解析は一切行いません。拡張機能が読み込むのは、表示中の Markdown ファイルと、ファイル一覧のサイドバー用に、そのファイルがあるフォルダとその下にあるファイルの名前だけです。

初期設定（重要）
ローカルファイルを読む拡張機能には、Chrome の仕様で次の設定が必要です。
1. chrome://extensions を開き、MD Browser の「詳細」をクリック
2. 「ファイルの URL へのアクセスを許可する」を ON にする
インストール直後に、この手順を案内する画面が自動で開きます。

オープンソース（MIT ライセンス）: https://github.com/otaku1123/md-browser
```

### 画像素材（`docs/store/assets/`）

| 種類 | サイズ | ファイル |
|---|---|---|
| ストアアイコン | 128×128 | `store-icon-128.png` |
| スクリーンショット | 1280×800 | `en/1-document.png`, `en/2-dark.png`, `en/3-setup.png`, `en/4-folder.png`（日本語版は `ja/` 配下） |
| 小さいプロモーション タイル | 440×280 | `en/promo-small-440x280.png`（日本語版は `ja/` 配下） |

作り直すとき: `npm run build:ext` の後に `python scripts/store-assets.py <一時ディレクトリ>` を実行する（Playwright for Python が必要）。

## 3. プライバシーへの取り組み（Privacy practices）

### 単一用途の説明（Single purpose）

```text
Render local Markdown (.md) files opened in Chrome as formatted documents with a table of contents and Mermaid diagrams, and re-render them when the file changes. It can also list the other Markdown files in the same folder in a sidebar and search their text.
```

### ホスト権限（Host permissions）

manifest の `permissions` は `storage` だけで、`host_permissions` はない。content_scripts の `file:///*.md` などへのマッチでは、ダッシュボードにホスト権限の説明欄は表示されない（1.6.0 の提出時に確認）。file:// の読み込みは、詳細説明の PRIVACY 節とプライバシーポリシーで開示している。

審査で理由を聞かれたときは、次の文面で返信する。

```text
The content script runs only on local Markdown files (file:///*.md, *.markdown, *.mdown, *.mkd) to replace Chrome's plain-text view with a rendered document. The service worker re-reads only the Markdown file shown in the requesting tab (verified against the sender's URL) to detect changes for live reload. To show a sidebar of the other Markdown files next to it, the service worker also reads Chrome's file:// directory listings of that file's folder and its subfolders (never parent folders; hidden folders, common dependency and build output folders such as node_modules and dist, and folders the user chose to hide are skipped; at most 4 levels, 200 folders and 500 files) and returns only the Markdown file names. The contents of those listed files are read only when the user searches the folder's text (⌘/Ctrl+Shift+F), each by a checked root-relative path below the same root, and only to show the matches on the page. No other files are read, no other pages are accessed, and no network requests are made by the extension.
```

### storage 権限が必要な理由（Permission justification: storage）

```text
Stores the user's display preferences (theme, text size, content width, image and diagram size, font names for the document body and code blocks, whether the table of contents and the file sidebar are shown, and their widths, and the shortcut for the quick file switcher) and the viewer's folder scan limit, so they apply to every rendered Markdown file and the viewer. chrome.storage.session keeps, per tab and only until the browser closes, the folder the file sidebar was opened from, so the list stays the same while moving into subfolders. chrome.storage.local keeps, on this computer only and never synced, the subfolders the user chose to hide from the file sidebar (per starting folder) and the sizes the user set for individual images and diagrams (per document URL). Only these preferences, folder locations and document URLs are stored; no file contents or personal data are saved.
```

### リモートコード（Remote code）

- **No, I am not using remote code**（Mermaid などのライブラリも含め、すべてのコードをパッケージに同梱）

### データの使用（Data usage）

- 収集するデータ: **すべてチェックしない**（何も収集しない）
- 次の 3 つの宣言にチェックを入れる:
  - 承認されたユースケース以外の目的で、ユーザーデータを第三者に販売・転送しない
  - 単一用途と関係のない目的で、ユーザーデータを使用・転送しない
  - 信用度の判断や貸付の目的で、ユーザーデータを使用・転送しない

### プライバシー ポリシー URL

```text
https://otaku1123.github.io/md-browser/privacy.html
```

## 4. 配布（Distribution）

| 項目 | 値 |
|---|---|
| 公開範囲 | 公開（Public）。まず試したい場合は「限定公開（Unlisted）」も可 |
| 地域 | すべての地域 |
| 価格 | 無料 |

## 5. 審査担当者向けメモ（必要な場合）

```text
To test: install the extension, enable "Allow access to file URLs" on the extension's details page, then open any local .md file in Chrome (e.g. drag a README.md into a tab). The file is rendered with a table of contents and diagrams. Editing and saving the file re-renders the page within about one second. If the folder contains other .md files, they are listed in the left sidebar (toggle with the button at the top left). The toolbar icon opens the bundled viewer.
```

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| 審査で「権限の説明不足」として却下された | 「ホスト権限」節の文面（file:// だけに限定していること、通信をしないこと）で返信し、必要なら詳細説明の PRIVACY 節にも追記して再提出する |
| 「説明文がキーワードの羅列」と指摘された | 機能の箇条書きを減らし、文章での説明を増やす |
| アップロード時に manifest エラーが出る | `version` が前回より大きいか、`_locales` の文字数が上限内（名前 75 文字、説明 132 文字）かを確認する |
