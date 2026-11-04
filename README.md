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

- GFM 相当の Markdown 表示（表・タスクリスト・コードハイライト）。ハイライトは主要な約 35 言語を同梱し、Dockerfile・PowerShell・CMake・アセンブリ（ARM / x86 / AVR / MIPS）・Verilog・VHDL・Protobuf・nginx・Dart・Scala・Haskell・Elixir・MATLAB・Groovy など約 80 言語は、その言語のコードブロックがある文書を開いたときに読み込む（`src/core/highlight.ts` の表）
- GitHub のアラート記法（`> [!NOTE]` など）、Front matter（YAML / TOML）の折りたたみ表示
- 脚注（`[^1]` と `[^1]: 注釈`）の表示、注釈から本文への戻りリンク
- 絵文字ショートコード（`:smile:` `:+1:` など。GitHub 同様、コード内や `:)` のような顔文字は変換しない）
- コードブロックのコピーボタン
- Markdown ソース表示への切り替え（ツールバーの `<>` ボタン、または Ctrl+Shift+M / Mac は ⌘+Shift+M）。行番号・ハイライトつきで、全体をコピー可能。自動更新にも追従し、ファイルを開くたびにプレビューから始まる
- クイックファイル切り替え（Ctrl+P / Mac は ⌘+P）: 開いているフォルダの Markdown をファイル名のあいまい検索で開く（↑↓・Enter・Esc）。検索語が空のときは、このタブで最近開いた文書から並ぶ。ファイルが 2 件以上のときだけ有効で、1 ファイルなら印刷のショートカットのまま。ショートカットは表示設定で ⌘/Ctrl+K・⌘/Ctrl+Shift+P・オフにも変えられる
- 見出しにホバーすると 🔗 を表示し、クリックでその見出しへのリンクをコピー
- 見出しのサイドバー表示（スクロール連動ハイライト）。下位見出しを持つ節は ▸ で折りたたみ（リンクにフォーカスして ← →でも操作）。折りたたみは自動更新後も保たれ、文書ごとにタブ内で記憶される。折りたたんだ節の中を読んでいる間はその節が現在位置として強調される。ツールバーのボタンで表示 / 非表示を切り替え、左端のハンドルのドラッグ・矢印キー・ダブルクリック（初期幅に戻す）で幅を調整（設定は保存され他のタブにも反映）
- Mermaid 図（使うときだけ遅延ロード）。クリックで拡大表示し、SVG / PNG で保存可能。拡大表示では Ctrl/⌘ + ホイール（ピンチ）で拡大縮小、ホイールやドラッグで移動、ダブルクリックで原寸（100%）と全体表示を切り替え（キーボードは + − 0 と矢印キー）。文書内の画像も同じ
- 数式（KaTeX。`$...$` / `$$...$$` / ` ```math `。GitHub と同じ記法で、使うときだけ遅延ロード）
- フォルダ内の全文検索（Ctrl+Shift+F / Mac は ⌘+Shift+F、またはツールバーの 🔍）: 開いているフォルダの全 Markdown の本文を検索し、ファイルごとに行番号・所属見出し・抜粋を表示。結果をクリックすると該当行へ移動し、ページ上の一致を強調表示（その行の一致は色を変えて表示。検索を閉じると消える）。Enter / Shift+Enter（または ↓ ↑ ボタン）で次 / 前の一致へ。範囲を「このファイル」にすると表示中の文書だけを検索（ページ内検索の代わり）。大文字小文字・全角半角・半角カナの違いを無視、空白区切りで複数語の AND。索引は作らず、パネルを開いたときにファイルを読んで検索するので、保存されるものはない。Ctrl+F はブラウザのページ内検索のまま
- 相対パス画像の表示（「フォルダを開く」使用時）
- GitHub と同じテーマ別画像: `![](a.png#gh-dark-mode-only)` / `#gh-light-mode-only` は合うテーマのときだけ表示し、`<picture><source media="(prefers-color-scheme: dark)" …>` は表示設定で選んだテーマ（OS 設定でないときも）に従う。印刷・PDF ではライト版を使用
- ローカルファイル更新の自動検知・再描画（1秒間隔、Chrome / Edge）
- フォルダ内の他の `.md` への相対リンク移動
- パンくず: ツールバーに開いたフォルダからの階層（`sample/ / docs / setup.md`。拡張機能の `file://` ページでは一覧の起点から）を表示。フォルダをクリックするとサイドバーでそのフォルダを展開。狭い画面ではファイル名だけ表示
- ファイル一覧のサイドバーはフォルダを閉じた状態で表示し、開いている文書のあるフォルダだけ展開（自分で開いたフォルダは一覧の更新後も開いたまま）
- ファイル一覧のサイドバーはキーボードでも操作できる（↑↓・Home・End で移動、→ でフォルダを開く / 中へ、← で閉じる / 親フォルダへ、Enter でファイルを開く / フォルダを開閉）
- ファイル一覧のサイドバーから不要なフォルダを隠せる（フォルダ名の右の 👁 ボタン。隠したフォルダは読み込まないので走査も速くなる。一覧の下の「非表示のフォルダ」から再表示。設定はフォルダごとにこの PC のブラウザ内だけに保存）
- お気に入り: ファイル一覧の各行の右の ☆ で、よく開く文書を一覧の上の「お気に入り」に固定（クイック切り替え ⌘/Ctrl+P でも最近開いたものより先に表示）。フォルダごとにこの PC のブラウザ内だけに保存（file:// のページは起点フォルダの URL、Web 版・ビューアーはフォルダ名。同期しない）
- フォルダを開くとき、`.` で始まる名前と `node_modules`・`bower_components`・`vendor`・`dist`・`build`・`out`・`target`・`coverage`・`venv`・`__pycache__` は除外（Web 版・拡張機能共通）
- 表示設定（ツールバーの歯車ボタン）: テーマ（OS 設定 / ライト / ダーク）、文字サイズ、本文幅、画像・図のサイズ（元の大きさの 50〜200%。本文幅を超えない）、本文・コードのフォント名。拡張機能は `chrome.storage.sync`、Web 版は `localStorage` に保存し、他のタブにも即時反映
- カスタム CSS（表示設定の中）: 本文の見た目を上書きする CSS を書ける。入力しながら反映され、`@scope (.content)` で本文に限定されるのでツールバーや設定パネルは壊れない（裏返しに、ページの背景や `@font-face` には届かない）。「適用する」で一時的にオフ、「HTML エクスポートに含める」で保存した HTML にも同じ CSS が入る。`url(https://…)` を書けばブラウザがその URL にアクセスする。この PC のブラウザ内だけに保存し（拡張機能は `chrome.storage.local`、Web 版は `localStorage`）、同期しない
- フォルダ CSS（拡張で `file://` の文書を開いているとき。既定オフ）: 文書のフォルダ（無ければファイル一覧の起点フォルダ）に置いた `.md-browser.css` を文書に適用する。表示設定のカスタム CSS の節にある「フォルダの `.md-browser.css` を適用する」で有効にする（全タブ共通、同期）。カスタム CSS と同じく `@scope (.content)` で本文に限定され、カスタム CSS より前に入るので、重なったところは自分の CSS が勝つ。既定でオフなのは、そのファイルを書くのがフォルダの作者であり、`url(https://…)` があればブラウザがその URL にアクセスするため。ファイルの変更はページを開き直したときに反映される。Web 版とビューアーでは使えない
- 印刷 / PDF（表示設定の中）: 用紙（A4 / レター）・向き・余白に加え、「リンクの後に URL を書く」「1 ページ目に目次を出力」「h1 ごとに改ページ」を選べる。「PDF として保存」とブラウザの印刷（⌘/Ctrl+P）の両方に効き、ほかの表示設定と同じ場所に保存される
- 画像・図ごとのサイズ変更: ホバー（またはキーボードでフォーカス）すると右上に「− / n% / +」を表示（25〜300%。「n%」で表示設定のサイズに戻す。タッチ操作の端末では常に表示）。文書ごとにこの PC のブラウザ内だけに保存（`file://` のページはファイルの URL、Web 版・ビューアーは開いたフォルダ名 + パスごと。同期しない）
- 印刷 / PDF 出力（ツールバーや目次を除き、白背景・ライト配色で出力）
- エクスポート（表示設定 ⚙ の「エクスポート」）: 表示中の文書を、スタイル・図・画像を埋め込んだ 1 ファイルの HTML として保存（文字サイズ・幅はいまの表示のまま。file:// のページでは、ファイル一覧の起点フォルダの下にある画像を拡張のバックグラウンド経由で読んで埋め込み、起点の外の画像はローカルのパスのまま）。オプション: テーマ（いまの表示 / ライト固定。ライト固定では図とテーマ別画像もライト版になる）、先頭の目次（折りたたみ式の `<details>`。JS 不要）、数式のフォント埋め込み（文書が使う KaTeX の woff2 だけを data: URL で埋め込む。オフにすると閲覧側のフォントで代用）。「PDF として保存」はブラウザの印刷ダイアログを開く
- エディタで開く（拡張機能の `file://` ページのみ）: 表示設定 ⚙ の「エディタ」で VS Code / Cursor / カスタム URL（`{path}` `{line}` を置換。例 `idea://open?file={path}&line={line}`）を選ぶとツールバーにボタンが出て、画面上端に表示中の行でそのファイルを開く。既定はオフ（外部アプリを起動するため。起動前にブラウザが確認する）
- 再読み込み後に前回のファイル / フォルダを復元（Web 版・ビューアー）。開く前の画面に「最近開いたもの」（最大10件、×で削除・「クリア」で全削除）を表示し、権限が切れていてもクリックで開き直せる
- PlantUML 図（` ```plantuml ` / `puml` / `uml`。公式のブラウザ版エンジンを同梱し、使うときだけ遅延ロード。図のソースを外部に送ることはない）。UML 各種のほか `@startjson` / `@startyaml` / `@startmindmap` / `@startwbs` / `@startgantt` に対応（[sample/docs/plantuml.md](sample/docs/plantuml.md)）。レイアウトは同梱の Smetana（Graphviz は同梱しない）。クリックで拡大表示し、SVG / PNG で保存可能
- PlantUML の標準ライブラリ（`!include <C4/…>`、`<awslib/…>`、`<kubernetes/…>` など）は同梱していない。表示設定の「PlantUML」で取得先（公式ホスト `https://plantuml.github.io/plantuml/js-plantuml/` など）を指定すると、図が include したライブラリ 1 つ分だけをその取得先から取得して描く。取得したファイルはスクリプトとして実行せず、データとして読み込む。取得先には図のソースではなくライブラリ名（`c4.min.js` など）だけが渡る。未指定なら何も取得しない。絵文字（`<:…:>`）は非対応
- PlantUML のローカルファイルの `!include`（`!include ./inc/common.iuml`、`!includesub`、`!theme X from dir` など）は、拡張で `file://` の文書を開いているときに使える。パスは文書のフォルダ基準（include したファイルの中からは、そのファイルのフォルダ基準）で解決し、ファイル一覧の起点フォルダの下にある `.puml` / `.plantuml` / `.iuml` / `.pu` だけを拡張のバックグラウンド経由で読む。起点の外や他の種類のファイルは「cannot include」になる（理由はコンソールに出る）。Web 版とビューアーでは使えない。include したファイルの変更は、文書が描き直されるときに反映される

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

#### GitHub との表示比較

`tests/fixtures/gfm/*.md` は記法ごとの小さな Markdown で、GitHub Markdown API が返した HTML を隣の `*.github.html` に保存してある。単体テスト `tests/unit/gfm-compat.test.ts` は両方を正規化（class・id・`dir` などの見た目の属性や GitHub 固有の包みを除く。`tests/unit/gfm-normalize.ts`）して構造を比べるので、落ちた項目がそのまま GitHub との差分になる。既知の差は同テストの `GAPS` に理由つきで登録し、直したら登録を外す。意図した差（`style` 属性や `<abbr>` を残す、PlantUML を図にする、危険な HTML を文字列でなく除去する）は正規化の中でコメントつきで吸収している。

fixture を書き換えたら GitHub 側を取り直す（ネットに出るのはこのコマンドだけ。CI は保存済みのファイルを使う）:

```sh
npm run gfm:fetch              # 変更した fixture だけ取得（無認証は 60 回/時。gh auth token があれば使う）
npm run gfm:fetch -- --force   # 全部取り直す（GitHub 側の出力が変わったとき）
```

API の `markdown` モードは README の表示と同じだが、アラート・タスクリスト・数式は github.com 側で後から付くため変換されない。それらの fixture は先頭行に `<!-- gfm-fixture mode: gfm -->` を書いて `gfm` モード（コメント欄と同じ変換。改行が `<br>` になり見出しのアンカーが付かない）で取得する。

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
- バックグラウンドが読むのは、依頼元のタブ自身が開いている `.md` ファイルと、ページが起点からの相対パスで指名した起点の下のファイルだけ（`..` や絶対パスは拒否。任意のファイルは読まない）。指名できるのは、全文検索のための `.md`、HTML エクスポートで埋め込む画像（拡張子が png / jpg / jpeg / gif / webp / svg / avif / bmp のもの。data: URL として返す。20 MB まで）、PlantUML 図が `!include` するファイルとフォルダ CSS の `.md-browser.css`（拡張子が puml / plantuml / iuml / pu / css のもの。テキストとして返す。2 MB まで）。それ以外の種類のファイルは名前の段階で拒否する
- ファイル一覧も、依頼元のタブが最初に開いたファイルのフォルダとその下だけを Chrome のフォルダ一覧ページから読む（サイドバーでサブフォルダに移っても同じ一覧のまま。親フォルダは読まない。深さ 4 階層・500 ファイル・200 フォルダまで）。除外するフォルダと、ユーザーが隠したフォルダは一覧ページ自体を読まない。隠す / 再表示の依頼も同じタブ確認のうえ、ページからは起点からの相対パスだけを受け取る

## 構成

```
src/
├── core/          # 描画コア（Web 版・拡張で共用）
│   ├── render.ts    Markdown → サニタイズ済み HTML + 目次
│   ├── diagrams.ts  Mermaid 描画
│   ├── assets.ts    相対パス解決・画像差し替え
│   └── toc.ts       目次サイドバー（クリック移動・スクロール連動・折りたたみ）
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
