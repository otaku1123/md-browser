# PlantUML の図の種類

同梱のエンジン（Smetana レイアウト）で描ける図の例。`@start…` の行で種類を選ぶ。

## JSON

```plantuml
@startjson
{
  "name": "md-browser",
  "renders": ["Markdown", "Mermaid", "PlantUML"],
  "offline": true
}
@endjson
```

## YAML

```plantuml
@startyaml
name: md-browser
renders:
  - Markdown
  - PlantUML
@endyaml
```

## マインドマップ

```plantuml
@startmindmap
* 文書
** 見出し
*** 本文
** 図
*** Mermaid
*** PlantUML
@endmindmap
```

## WBS（作業分解）

```plantuml
@startwbs
* プロジェクト
** 設計
** 実装
*** 単体テスト
*** 結合テスト
@endwbs
```

## ガントチャート

```plantuml
@startgantt
[設計] lasts 5 days
[実装] lasts 10 days
[実装] starts at [設計]'s end
@endgantt
```

## 標準ライブラリ（取得先を設定したときだけ）

`!include <C4/…>` などの標準ライブラリは同梱していない。表示設定（⚙）の「PlantUML」でライブラリの取得先を指定すると、図が include したライブラリだけを取得して描く。指定がなければ、このブロックはエラー表示になる。

```plantuml
!include <C4/C4_Context>
Person(user, "利用者")
System(md, "MD Browser")
Rel(user, md, "読む")
```
