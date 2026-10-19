# Chrome ウェブストア 提出用メモ

デベロッパー ダッシュボード（https://chrome.google.com/webstore/devconsole ）に入力する内容をまとめたもの。

## 前提条件

- Chrome ウェブストアのデベロッパー登録が済んでいる（登録料 $5、一度だけ）
- Google アカウントで 2 段階認証が有効になっている
- リリース PR（`develop` → `main`）がマージ済み
- **`main` ブランチで** `npm run pack:ext` を実行し、`release/md-browser-<version>.zip` を作成済み（`develop` には未リリースの変更が入るため使わない）
  ```sh
  git switch main && git pull --ff-only && npm run pack:ext
  ```
- 提出するコミットに `v<version>` タグを付けて push 済み（ストアの版とコードを対応づけるため）
  ```sh
  git tag v<version> origin/main && git push origin v<version>
  ```
- GitHub Pages に `privacy.html` がデプロイ済み（`main` に push すれば自動でデプロイされる）

## 1. パッケージ

| 項目 | 値 |
|---|---|
| アップロードするファイル | `release/md-browser-1.3.0.zip` |
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
• Sidebar table of contents that follows your scroll position
• Mermaid diagrams (flowcharts, sequence diagrams, and more)
• Live reload: save the file in your editor and the page re-renders within about a second, keeping your scroll position
• GitHub alerts (> [!NOTE], > [!WARNING] …) and collapsible front matter (YAML / TOML)
• One-click copy button on code blocks
• Choose your own fonts for body text and code
• Relative images and links to other .md files just work
• Light and dark themes (follows your system setting)
• Built-in viewer (click the toolbar icon) to open files or whole folders, with a collapsible file tree

PRIVACY
Everything runs locally in your browser. No data is collected or sent anywhere, and there are no analytics. The extension only re-reads the Markdown file you are currently viewing.

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
• スクロール位置に連動する目次サイドバー
• Mermaid 図（フローチャート、シーケンス図など）
• 自動更新：エディタで保存すると約 1 秒で再描画（スクロール位置を保持）
• GitHub のアラート記法（> [!NOTE]、> [!WARNING] など）と、Front matter（YAML / TOML）の折りたたみ表示
• コードブロックのワンクリックコピー
• 本文とコードのフォントを好みに変更
• 相対パスの画像や、他の .md ファイルへのリンクもそのまま動作
• ライト / ダークテーマ（OS の設定に追従）
• ツールバーのアイコンから開けるビューアー（ファイル・フォルダ単位で表示、折りたためるファイルツリー付き）

プライバシー
すべての処理はブラウザ内で完結します。データの収集・送信やアクセス解析は一切行いません。拡張機能が再読み込みするのは、表示中の Markdown ファイルだけです。

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
Render local Markdown (.md) files opened in Chrome as formatted documents with a table of contents and Mermaid diagrams, and re-render them when the file changes.
```

### ホスト権限が必要な理由（Host permission justification）

content_scripts の `file:///*.md` などへのマッチが、ホスト権限として扱われる。

```text
The content script runs only on local Markdown files (file:///*.md, *.markdown, *.mdown, *.mkd) to replace Chrome's plain-text view with a rendered document. The service worker re-reads only the Markdown file shown in the requesting tab (verified against the sender's URL) to detect changes for live reload. No other pages or files are accessed, and no network requests are made by the extension.
```

### storage 権限が必要な理由（Permission justification: storage）

```text
Stores the user's font preferences (font names for the document body and code blocks) so they apply to every rendered Markdown file and the viewer. Only these two font names are stored; no file contents or personal data are saved.
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
To test: install the extension, enable "Allow access to file URLs" on the extension's details page, then open any local .md file in Chrome (e.g. drag a README.md into a tab). The file is rendered with a table of contents and diagrams. Editing and saving the file re-renders the page within about one second. The toolbar icon opens the bundled viewer.
```

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| 審査で「権限の説明不足」として却下された | 「ホスト権限が必要な理由」の文面に、file:// だけに限定していること、通信をしないことを明記して再提出する |
| 「説明文がキーワードの羅列」と指摘された | 機能の箇条書きを減らし、文章での説明を増やす |
| アップロード時に manifest エラーが出る | `version` が前回より大きいか、`_locales` の文字数が上限内（名前 75 文字、説明 132 文字）かを確認する |
