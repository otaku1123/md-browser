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

詳しい説明（操作方法、ショートカット、設定の保存場所、制限）は [docs/features.md](docs/features.md) にある。

**表示**

- GFM 相当の Markdown（表・タスクリスト・約 120 言語のコードハイライト）、アラート記法、Front matter、脚注、絵文字ショートコード
- Mermaid / PlantUML 図と KaTeX 数式。すべてブラウザ内で描画し、クリックで拡大、SVG / PNG で保存
- 相対パスの画像とリンク、GitHub と同じテーマ別画像、ファイル保存時の自動再描画（Chrome / Edge）

**ナビゲーション**

- 目次サイドバー（スクロール連動、節の折りたたみ）とファイル一覧サイドバー（フォルダの開閉・非表示、お気に入り、パンくず、キーボード操作）
- クイック切り替え（⌘/Ctrl+P）とフォルダ内の全文検索（⌘/Ctrl+Shift+F）
- 見出しリンクのコピー、コードのコピー、Markdown ソース表示（⌘/Ctrl+Shift+M）

**表示設定（⚙）**

- テーマ・文字サイズ・本文幅・フォント・画像サイズ（画像や図ごとの調整も）
- カスタム CSS、フォルダの `.md-browser.css`（拡張機能のみ、既定オフ）
- 印刷 / PDF の設定、1 ファイルの HTML エクスポート、エディタで開く（拡張機能のみ）

**その他**

- 再読み込み後の復元と「最近開いたもの」（Web 版・ビューアー）
- 日本語 / 英語 UI。処理はすべてブラウザ内で、ファイルをアップロードしない

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
- 同じフォルダとサブフォルダの Markdown ファイルを左のサイドバーに一覧表示（2 件以上あるとき。除外するフォルダと、フォルダを隠す設定は [docs/features.md](docs/features.md)）
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

手で読み込む代わりに、ビルドした拡張を使い捨てプロファイルの Chromium（Playwright のもの）で開いて目で確かめることもできる:

```sh
npm run ext:try                      # build:ext してから sample/README.md を開く
npm run ext:try -- ~/notes/memo.md   # 別の文書を開く
npm run ext:try -- --watch           # ソースを変えるたびに再ビルドし、Chromium を同じタブで起動し直す（型チェックはしない）
```

ファイル URL へのアクセスは自動で許可される。ウィンドウを閉じるか Ctrl+C で終了し、プロファイルは消える。Chrome 137 以降の製品版 Chrome は `--load-extension` を無視するので、Chromium で開く。

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
| コードを変更したのに反映されない | `npm run build:ext` の後、`chrome://extensions` で拡張の更新ボタンを押す（`npm run ext:try -- --watch` なら再ビルドのたびに起動し直す） |

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
