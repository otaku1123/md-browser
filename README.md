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

## 構成

```
src/
├── core/          # 描画コア（Chrome 拡張でも流用予定）
│   ├── render.ts    Markdown → サニタイズ済み HTML + 目次
│   ├── diagrams.ts  Mermaid 描画
│   └── assets.ts    相対パス解決・画像差し替え
├── workspace.ts   # 開いたファイル/フォルダの抽象化（読み込み・変更検知）
├── main.ts        # UI・イベント・ポーリング
└── style.css
sample/            # 動作確認用の Markdown
```
