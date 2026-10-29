# Chrome ウェブストアへの自動提出

`v<version>` タグを push すると、Release ワークフロー（`.github/workflows/release.yml`）が次を自動で行う。

1. 拡張機能の zip をビルドし、GitHub Release に添付する（`release` job）
2. その zip を Chrome Web Store API でアップロードし、審査に提出する（`store` job）。承認されると自動で公開される（`publishType: DEFAULT_PUBLISH`）

`store` job は、下記のリポジトリ変数が設定されるまではスキップされる。認証には Workload Identity Federation（WIF）を使うため、GitHub に秘密情報（鍵やトークン）は置かない。

ストアの説明文・スクリーンショット・権限の説明などの**掲載情報は対象外**。変更があるリリースでは、タグを push する前にダッシュボードで更新しておく（[listing.md](listing.md)）。

## 前提条件

- `gcloud` CLI が使え、ストアのアイテムを所有する Google アカウントでログインしている（`gcloud auth login`）
- 課金設定は不要（使う API は無料）
- Chrome ウェブストアのデベロッパー ダッシュボードにログインできる

## 初期設定（一度だけ）

### 1. GCP プロジェクトと API

```sh
PROJECT_ID=md-browser-release   # 既存のプロジェクトでもよい
gcloud projects create "$PROJECT_ID"   # 既存を使う場合は不要
gcloud services enable chromewebstore.googleapis.com iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com --project "$PROJECT_ID"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
```

### 2. サービスアカウント

```sh
gcloud iam service-accounts create cws-publisher --display-name "Chrome Web Store publisher" --project "$PROJECT_ID"
SA="cws-publisher@$PROJECT_ID.iam.gserviceaccount.com"
```

### 3. GitHub Actions からの WIF

このリポジトリのワークフローだけが、サービスアカウントの権限を借りられるようにする。

```sh
gcloud iam workload-identity-pools create github --location=global --project "$PROJECT_ID"
gcloud iam workload-identity-pools providers create-oidc md-browser \
  --location=global --workload-identity-pool=github --project "$PROJECT_ID" \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping='google.subject=assertion.sub,attribute.repository=assertion.repository' \
  --attribute-condition="assertion.repository == 'otaku1123/md-browser'"
gcloud iam service-accounts add-iam-policy-binding "$SA" --project "$PROJECT_ID" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/otaku1123/md-browser"
```

### 4. ダッシュボードにサービスアカウントを登録

デベロッパー ダッシュボード → **アカウント**（Account）→ サービスアカウントの欄に `$SA` のメールアドレスを追加する。登録できるサービスアカウントは、パブリッシャーごとに 1 つだけ。

同じ画面の **パブリッシャー > 設定**（Publisher > Settings）で、パブリッシャー ID を確認する。

### 5. リポジトリ変数

いずれも秘密情報ではないので、Secrets ではなく Variables に入れる。

```sh
gh variable set CWS_WIF_PROVIDER --body "projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/md-browser"
gh variable set CWS_SERVICE_ACCOUNT --body "$SA"
gh variable set CWS_PUBLISHER_ID --body "<パブリッシャー ID>"
gh variable set CWS_ITEM_ID --body "infhmmggjagaoiiogbjkffelfdgfdkop"
```

## リリース時の手順

1. リリース PR（`develop` → `main`）をマージする
2. `main` にタグを付けて push する
   ```sh
   git fetch && git tag -a v<version> origin/main -m "Release <version>" && git push origin v<version>
   ```
3. Actions の Release ワークフローで、`release` と `store` の 2 つの job が成功したことを確認する

### 期待する結果

- `store` job のログに `upload succeeded` と `submitted for review: ...` が出る
- ダッシュボードで、新しいバージョンが「審査待ち」になっている
- 承認されると自動で公開される

## トラブルシューティング

| 症状 | 原因と対処 |
|---|---|
| プールの作成が `Permission 'iam.workloadIdentityPools.create' denied` で失敗 | IAM API（`iam.googleapis.com`）が有効になっていない。手順 1 の `services enable` に入っているか確認する。プロジェクトを作った直後は、権限の反映を数分待つ |
| `store` job がスキップされる | `CWS_WIF_PROVIDER` が未設定。手動実行（workflow_dispatch）では `store` にチェックを入れないと動かない |
| auth ステップが `Permission 'iam.serviceAccounts.getAccessToken' denied` で失敗 | 手順 3 の `add-iam-policy-binding` の member（リポジトリ名やプロジェクト番号）が間違っている。反映に数分かかることもある |
| アップロードが 401 / 403 で失敗 | 手順 4 でダッシュボードに登録したサービスアカウントと `CWS_SERVICE_ACCOUNT` が違う、または `CWS_PUBLISHER_ID` が違う |
| アップロードが 400 で失敗し、バージョンについてのエラーが出る | ストアにある版よりバージョンが上がっていない。同じバージョンの再提出はできない |
| 公開（publish）が失敗する | ダッシュボードで公開設定（公開範囲など）を手動で変えた場合、一度ダッシュボードから手動で公開しないと API で公開できない |
| 審査に出した後で取り消したい | ダッシュボードで審査を取り消す |

既存のタグで、ストアへの提出だけをやり直す場合:

```sh
gh workflow run release.yml --ref main -f tag=v<version> -f store=true
```
