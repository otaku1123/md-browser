<!-- リリース PR（develop → main）用。gh pr create --base main --template release.md -->

## X.Y.Z

### 新機能
-

### 改善
-

### 不具合の修正
-

### 開発・ドキュメント
- バージョンを X.Y.Z に上げた（#）

## リリース前の確認

CI の `test`（単体・E2E・スクリーンショット）と `release-check`（バージョン・manifest の権限面・zip のサイズ・ストア文面）が通っていることに加えて、手で確認する項目:

- [ ] `develop` の Pages（/dev/）で主要な変更を一通り触った
- [ ] `npm run build:ext` した `dist-extension/` を Chrome に読み込み直し、file:// の `.md` を開いて表示・自動更新・サイドバーを確認した
- [ ] 拡張機能の更新時に権限の警告が出ない（manifest の `permissions` / `content_scripts` を変えていない）。変えた場合は PR に `store-permissions` ラベルを付け、`docs/store/listing.md` の権限説明と `privacy.html` を更新した
- [ ] ストアの説明文（`docs/store/listing.md`）とプライバシーポリシー（`public/privacy.html`）が今回の変更と一致している
- [ ] `release-check` のジョブサマリーで zip のサイズ差を見た

## マージ後の作業

- `main` に `vX.Y.Z` タグを push する。Release ワークフローが zip を作り、GitHub Release に添付し、ストアの審査に提出する
  ```sh
  git fetch && git tag -a vX.Y.Z origin/main -m "Release X.Y.Z" && git push origin vX.Y.Z
  ```
- ストアの説明文を変えた場合は、デベロッパー ダッシュボードで `docs/store/listing.md` の内容に合わせる
