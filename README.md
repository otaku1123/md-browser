# MD Browser

日本語 | [English](README.en.md)

Markdown ファイルをブラウザでプレビューする静的 Web アプリ。

**公開版:** https://otaku1123.github.io/md-browser/

**Chrome 拡張機能:** [Chrome ウェブストア](https://chromewebstore.google.com/detail/infhmmggjagaoiiogbjkffelfdgfdkop)

**開発版:** https://otaku1123.github.io/md-browser/dev/ （`develop` ブランチ。ツールバーに「DEV」と表示）

**フィードバック:** [Issues](https://github.com/otaku1123/md-browser/issues/new/choose) へ（[不具合の報告](https://github.com/otaku1123/md-browser/issues/new?template=bug_report.yml) / [要望・質問](https://github.com/otaku1123/md-browser/issues/new?template=feature_request.yml)）。アプリの設定パネル（歯車）の下からも開け、バージョンが自動で入る

`main` / `develop` に push すると GitHub Actions（`.github/workflows/deploy-pages.yml`）で両方がまとめてデプロイされます。

### ブランチ運用

| ブランチ | 用途 | デプロイ先 |
|---|---|---|
| `feature/*` などの作業ブランチ | 1 Issue ＝ 1 ブランチ。PR は `develop` 向け（既定ブランチ） | なし（PR で CI のみ） |
| `develop` | 開発版。PR をマージして dev 環境で動作確認する | `/dev/` |
| `main` | リリース版。ある程度まとまったら `develop` → `main` の PR を作ってマージ | `/`（本番）＋ストア提出用の zip を作成 |

## 機能

- GFM 相当の Markdown 表示（表・タスクリスト・コードハイライト）
- GitHub のアラート記法（`> [!NOTE]` など）、Front matter（YAML / TOML）の折りたたみ表示
- 脚注（`[^1]` と `[^1]: 注釈`）の表示、注釈から本文への戻りリンク
- 絵文字ショートコード（`:smile:` `:+1:` など。GitHub 同様、コード内や `:)` のような顔文字は変換しない）
- コードブロックのコピーボタン
- Markdown ソース表示への切り替え（ツールバーの `<>` ボタン、または Ctrl+Shift+M / Mac は ⌘+Shift+M）。行番号・ハイライトつきで、全体をコピー可能。自動更新にも追従し、ファイルを開くたびにプレビューから始まる
- クイックファイル切り替え（Ctrl+P / Mac は ⌘+P）: 開いているフォルダの Markdown をファイル名のあいまい検索で開く（↑↓・Enter・Esc）。検索語が空のときは、このタブで最近開いた文書から並ぶ。ファイルが 2 件以上のときだけ有効で、1 ファイルなら印刷のショートカットのまま。ショートカットは表示設定で ⌘/Ctrl+K・⌘/Ctrl+Shift+P・オフにも変えられる
- 見出しにホバーすると 🔗 を表示し、クリックでその見出しへのリンクをコピー
- 見出しのサイドバー表示（スクロール連動ハイライト）。ツールバーのボタンで表示 / 非表示を切り替え、左端のハンドルのドラッグ・矢印キー・ダブルクリック（初期幅に戻す）で幅を調整（設定は保存され他のタブにも反映）
- Mermaid 図（使うときだけ遅延ロード）。クリックで拡大表示し、SVG / PNG で保存可能
- 数式（KaTeX。`$...$` / `$$...$$` / ` ```math `。GitHub と同じ記法で、使うときだけ遅延ロード）
- フォルダ内の全文検索（Ctrl+Shift+F / Mac は ⌘+Shift+F、またはツールバーの 🔍）: 開いているフォルダの全 Markdown の本文を検索し、ファイルごとに行番号・所属見出し・抜粋を表示。大文字小文字・全角半角・半角カナの違いを無視、空白区切りで複数語の AND。索引は作らず、パネルを開いたときにファイルを読んで検索するので、保存されるものはない。Ctrl+F はブラウザのページ内検索のまま
- 相対パス画像の表示（「フォルダを開く」使用時）
- ローカルファイル更新の自動検知・再描画（1秒間隔、Chrome / Edge）
- フォルダ内の他の `.md` への相対リンク移動
- ファイル一覧のサイドバーはフォルダを閉じた状態で表示し、開いている文書のあるフォルダだけ展開（自分で開いたフォルダは一覧の更新後も開いたまま）
- ファイル一覧のサイドバーはキーボードでも操作できる（↑↓・Home・End で移動、→ でフォルダを開く / 中へ、← で閉じる / 親フォルダへ、Enter でファイルを開く / フォルダを開閉）
- ファイル一覧のサイドバーから不要なフォルダを隠せる（フォルダ名の右の 👁 ボタン。隠したフォルダは読み込まないので走査も速くなる。一覧の下の「非表示のフォルダ」から再表示。設定はフォルダごとにこの PC のブラウザ内だけに保存）
- フォルダを開くとき、`.` で始まる名前と `node_modules`・`bower_components`・`vendor`・`dist`・`build`・`out`・`target`・`coverage`・`venv`・`__pycache__` は除外（Web 版・拡張機能共通）
- 表示設定（ツールバーの歯車ボタン）: テーマ（OS 設定 / ライト / ダーク）、文字サイズ、本文幅、画像・図のサイズ（元の大きさの 50〜200%。本文幅を超えない）、本文・コードのフォント名。拡張機能は `chrome.storage.sync`、Web 版は `localStorage` に保存し、他のタブにも即時反映
- 画像・図ごとのサイズ変更: ホバー（またはキーボードでフォーカス）すると右上に「− / n% / +」を表示（25〜300%。「n%」で表示設定のサイズに戻す。タッチ操作の端末では常に表示）。文書ごとにこの PC のブラウザ内だけに保存（`file://` のページはファイルの URL、Web 版・ビューアーは開いたフォルダ名 + パスごと。同期しない）
- 印刷 / PDF 出力（ツールバーや目次を除き、白背景・ライト配色で出力）
- 再読み込み後に前回のファイル / フォルダを復元（Web 版・ビューアー）。開く前の画面に「最近開いたもの」（最大10件、×で削除・「クリア」で全削除）を表示し、権限が切れていてもクリックで開き直せる
- PlantUML 図（` ```plantuml ` / `puml` / `uml`。公式のブラウザ版エンジンを同梱し、使うときだけ遅延ロード。外部サーバーには送らない。標準ライブラリ・スプライト・絵文字は同梱していないため使えない）。クリックで拡大表示し、SVG / PNG で保存可能

## 開発

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # 型チェック + dist/ へビルド
npm run preview    # ビルド結果の確認
```

### テスト

```sh
npm test                     # 単体テスト（vitest + jsdom）: 表示・サニタイズ・パス解決・フォント名
npx playwright install chromium   # 初回のみ
npm run test:e2e             # Web 版と拡張機能をビルドして E2E テスト（Playwright）
```

push と PR のたびに GitHub Actions（`.github/workflows/test.yml`）で型チェック・単体テスト・E2E テストが走る。失敗時はレポートが Artifacts に保存される。

#### スクリーンショット比較

`tests/e2e/visual-*.spec.ts` は画面を `tests/e2e/__screenshots__/` の基準画像と比べる。フォントの描画が OS で違うため、基準画像は CI（Linux）で作り、Linux 以外では自動でスキップされる。表示を意図して変えたときは、CI で基準画像を作り直してコミットする:

```sh
gh workflow run test.yml --ref <branch> -f update_screenshots=true
gh run list --workflow test.yml --branch <branch> -L 1   # run ID を確認
gh run download <run-id> -n screenshots -D tests/e2e/__screenshots__
git diff --stat tests/e2e/__screenshots__   # 画像を目で確認してからコミット
```

差分で失敗したときは、失敗時の Artifacts（`playwright-report`）に期待値・実際・差分の画像が入っている。手元（macOS など）で試すだけなら `VISUAL_LOCAL=<一時ディレクトリ> npx playwright test --project=visual-web --project=visual-extension --update-snapshots` で、リポジトリの外に画像を作って実行できる。

## 使い方

| 開き方 | 自動更新 | 相対パス画像 |
|---|---|---|
| フォルダを開く / フォルダをドロップ | ○ | ○ |
| ファイルを開く / ファイルをドロップ（Chrome/Edge） | ○ | × |
| Firefox / Safari | × | フォルダ選択時のみ ○ |

## Chrome 拡張

### 機能

- `file:///…/*.md` を開くと、その場で整形表示（目次・Mermaid・相対パス画像・別 MD へのリンク）
- ファイルを保存すると約 1 秒で自動再描画（スクロール位置を保持）
- 同じフォルダとサブフォルダの Markdown ファイルを左のサイドバーに一覧表示（2 件以上あるとき。`.` で始まる名前と `node_modules`・`bower_components`・`vendor`・`dist`・`build`・`out`・`target`・`coverage`・`venv`・`__pycache__` は除外）。フォルダは閉じた状態で表示し、開いている文書のあるフォルダだけ展開。フォルダ名の右のボタンで不要なフォルダを隠せる（起点フォルダごとに `chrome.storage.local` に保存、同期しない）
- ツールバーのアイコンをクリックすると、Web 版と同じビューアーを拡張内で開く

### ストアからインストール

1. [Chrome ウェブストア](https://chromewebstore.google.com/detail/infhmmggjagaoiiogbjkffelfdgfdkop) で「Chrome に追加」を押す
2. 自動で開く案内画面のボタンから拡張機能の詳細を開き、**「ファイルの URL へのアクセスを許可する」を ON にする**（必須）
3. `.md` ファイルを Chrome にドラッグする（または `file:///パス/README.md` を開く）

### ソースからビルドしてインストール（開発用）

```sh
npm run build:ext   # dist-extension/ に出力
```

1. Chrome で `chrome://extensions` を開く
2. 右上の「デベロッパー モード」を ON にする
3. 「パッケージ化されていない拡張機能を読み込む」で `dist-extension/` を選ぶ
4. MD Browser の「詳細」を開き、**「ファイルの URL へのアクセスを許可する」を ON にする**（必須）
5. Finder から `.md` ファイルを Chrome にドラッグする（または `file:///パス/README.md` を開く）

期待される結果: 目次付きで整形表示され、右上に「自動更新 ON」と表示される。

### Chrome ウェブストア用パッケージ

```sh
npm run pack:ext    # release/md-browser-<version>.zip を作成
```

`main` 上のコミットに `v<version>` タグを付けて push すると、Release ワークフローが同じ zip を作って GitHub Release に添付する。

同梱しているライブラリのライセンス表記は、ビルド時に `THIRD_PARTY_NOTICES.txt`（拡張機能は zip の直下、Web 版はサイトの直下）として自動生成される（`scripts/vite-third-party-notices.ts`）。実際にバンドルされたパッケージだけが載る。

提出画面に入力する内容（説明文・権限が必要な理由・プライバシー）は [docs/store/listing.md](docs/store/listing.md) にまとめてある。プライバシーポリシーは https://otaku1123.github.io/md-browser/privacy.html で公開している。

画面の文言は、ブラウザの言語設定に合わせて日本語と英語で切り替わる（`src/i18n.ts`）。

### トラブルシューティング

| 症状 | 確認すること |
|---|---|
| 生のテキストのまま表示される | 拡張機能の詳細で「ファイルの URL へのアクセスを許可する」が ON か。ON にした後は対象タブを再読み込みする |
| `.md` がダウンロードされてしまう | OS 側の MIME 設定の影響。ドラッグ&ドロップで開くか、ツールバーのビューアーを使う |
| 「自動更新 OFF」と表示される | 拡張を再読み込み（`chrome://extensions` の更新ボタン）してからタブを再読み込みする |
| コードを変更したのに反映されない | `npm run build:ext` の後、`chrome://extensions` で拡張の更新ボタンを押す |

### 仕組み

- `file://` のページは CORS 制限で自分自身を再読み込みできない。そのため、拡張のバックグラウンド（service worker）がファイルを読み、ページに返す
- バックグラウンドが読むのは、依頼元のタブ自身が開いている `.md` ファイルと、全文検索のためにページが起点からの相対パスで指名した、起点の下の `.md` ファイルだけ（`..` や絶対パスは拒否。任意のファイルは読まない）
- ファイル一覧も、依頼元のタブが最初に開いたファイルのフォルダとその下だけを Chrome のフォルダ一覧ページから読む（サイドバーでサブフォルダに移っても同じ一覧のまま。親フォルダは読まない。深さ 4 階層・500 ファイル・200 フォルダまで）。除外するフォルダと、ユーザーが隠したフォルダは一覧ページ自体を読まない。隠す / 再表示の依頼も同じタブ確認のうえ、ページからは起点からの相対パスだけを受け取る

## 構成

```
src/
├── core/          # 描画コア（Web 版・拡張で共用）
│   ├── render.ts    Markdown → サニタイズ済み HTML + 目次
│   ├── diagrams.ts  Mermaid 描画
│   ├── assets.ts    相対パス解決・画像差し替え
│   └── toc.ts       目次サイドバー（クリック移動・スクロール連動）
├── extension/     # Chrome 拡張
│   ├── content.ts     file:// の .md をその場で描画・自動更新
│   ├── background.ts  ツールバーのアイコン / file:// の読み込み代行
│   └── messages.ts
├── workspace.ts   # 開いたファイル/フォルダの抽象化（読み込み・変更検知）
├── main.ts        # UI・イベント・ポーリング
└── style.css
extension/public/  # manifest.json・読み込み用スクリプト・アイコン
sample/            # 動作確認用の Markdown
```

## ライセンス

[MIT](LICENSE)
