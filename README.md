# MD Browser

Markdown ファイルをブラウザでプレビューする静的 Web アプリ。

## 機能

- GFM 相当の Markdown 表示（表・タスクリスト・コードハイライト）
- 見出しのサイドバー表示（スクロール連動ハイライト）
- Mermaid 図（使うときだけ遅延ロード）
- 相対パス画像の表示（「フォルダを開く」使用時）
- ローカルファイル更新の自動検知・再描画（1秒間隔、Chrome / Edge）
- フォルダ内の他の `.md` への相対リンク移動
- PlantUML: 未対応（ソースをコードとして表示）

## 開発

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # 型チェック + dist/ へビルド
npm run preview    # ビルド結果の確認
```

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
- ツールバーのアイコンをクリックすると、Web 版と同じビューアーを拡張内で開く

### ビルドとインストール

```sh
npm run build:ext   # dist-extension/ に出力
```

1. Chrome で `chrome://extensions` を開く
2. 右上の「デベロッパー モード」を ON にする
3. 「パッケージ化されていない拡張機能を読み込む」で `dist-extension/` を選ぶ
4. MD Browser の「詳細」を開き、**「ファイルの URL へのアクセスを許可する」を ON にする**（必須）
5. Finder から `.md` ファイルを Chrome にドラッグする（または `file:///パス/README.md` を開く）

期待される結果: 目次付きで整形表示され、右上に「自動更新 ON」と表示される。

### トラブルシューティング

| 症状 | 確認すること |
|---|---|
| 生のテキストのまま表示される | 手順 4 の「ファイルの URL へのアクセス」が ON か。ON にした後は対象タブを再読み込みする |
| `.md` がダウンロードされてしまう | OS 側の MIME 設定の影響。ドラッグ&ドロップで開くか、ツールバーのビューアーを使う |
| 「自動更新 OFF」と表示される | 拡張を再読み込み（`chrome://extensions` の更新ボタン）してからタブを再読み込みする |
| コードを変更したのに反映されない | `npm run build:ext` の後、`chrome://extensions` で拡張の更新ボタンを押す |

### 仕組み

- `file://` のページは CORS 制限で自分自身を再読み込みできない。そのため、拡張のバックグラウンド（service worker）がファイルを読み、ページに返す
- バックグラウンドが読むのは、依頼元のタブ自身が開いている `.md` ファイルだけ（任意のファイルは読まない）

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
