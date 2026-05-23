# BaseHtmlEdit プロジェクト AI 用開発ガイド

このドキュメントは、BASE カスタムテーマ開発プロジェクト「BaseHtmlEdit」を編集するAIや開発者に向けたガイドラインです。

## 1. プロジェクト構成

ビルドパイプラインはなく、ファイルをルートに直接置いてそのまま GitHub Pages で配信します。

```
style.css          ← カスタムCSS（直接編集可）
script.js          ← カスタムJS（直接編集可、minify済み）
template.html      ← BASEのテンプレート（BASE管理画面に貼り付ける）
lp/                ← 商品ごとのLPフラグメント（fetchで動的注入）
element-cube-details/ ← 元素解説ページ（静的サイト）
```

**変更の反映方法:** ファイルを編集して main ブランチに push するだけ。GitHub Pages が main ブランチのルートを配信するため、自動で反映されます。

`template.html` を変更した場合は BASE 管理画面から手動で貼り付け直しが必要です。

## 2. GitHub Pages URL と参照関係

- 配信元: `https://camel-jp.github.io/BaseHtmlEdit/`
- `template.html` 内で以下の URL をハードコード参照:
  - `https://camel-jp.github.io/BaseHtmlEdit/style.css`
  - `https://camel-jp.github.io/BaseHtmlEdit/script.js`
  - LP フェッチ先: `https://camel-jp.github.io/BaseHtmlEdit/lp/{ファイル名}`

ローカルで開発する場合、`script.js` の `LP_BASE` は `localhost` のとき空文字になるので、`lp/` フォルダをローカルサーバのルートに置けば動作確認できます。

## 3. 元素キューブ商品のLP読み込みの仕組み

`script.js` は `window.BASE_ITEM.id` を見て、対象商品IDなら対応するLPファイルをフェッチして DOM に注入します。

### 商品ID と LP ファイルの対応

| 商品 | ID | LP ファイル |
|---|---|---|
| 16種セット | 87999715 | `lp/element-cube-16.html` |
| 25種セット | 115127926 | `lp/element-cube-25.html` |
| 9種セット | 115127875 | `lp/element-cube-9.html` |
| 15種セット | 145129583 | `lp/element-cube-15.html` |

新商品を追加する場合は `script.js` の `ELEMENT_CUBE_IDS` と `LP_MAP` の両方に追加が必要です（minify済みのため直接編集、または元ソースから再ビルド）。

### 注入先

`template.html` の `#lp-pre-purchase`（購入ボタン上）と `#lp-post-purchase`（購入ボタン下）に、`<div class="product-{id}">` で包まれて挿入されます。

## 4. `ec-content` による表示制御

`class="ec-content"` を持つ要素は、デフォルトで `display: none !important` に設定されています。`template.html` 末尾のインライン `<style>` で対象商品IDのときだけ表示します。

```html
<!-- template.html </body> 直前のインラインスタイル -->
.ec-content { display: none !important; }
.product-87999715 .ec-content,
.product-115127926 .ec-content,
.product-115127875 .ec-content,
.product-145129583 .ec-content { display: block !important; }
```

**なぜインラインに書くか:** 外部 CSS は GitHub Pages のキャッシュが効くため、表示制御が遅れることがある。インライン `!important` で必ず最優先にする。

`ec-hidden` は逆で、元素キューブ商品のとき `display: none` になる要素（ショップヘッダーなど）に使います。

## 5. セット間ナビゲーション（set-nav）の hide-on-X パターン

各LPの `<nav class="set-nav">` には全セットのボタンが並んでいます。「今見ているページのボタン」だけを隠すために `hide-on-{セット名}` クラスを使います。

- ボタンはデフォルトで表示
- `style.css` に `.product-XXXXX .hide-on-{セット名} { display: none !important; }` を定義
- 新セットを追加したら `style.css` と全 LP ファイルの set-nav 両方を更新

## 6. `{ItemId}` を含む BASE タグのフォーマッター問題

BASE 独自タグは波括弧内にスペースがあるとタグとして認識されず文字列になります。

- ❌ 失敗: `{ ItemId }`, `{ ItemPrice }`
- ⭕ 正解: `{ItemId}`, `{ItemPrice}`

Prettier 等のフォーマッターが `<script>` タグ内の `{ItemId}` を `{ ItemId }` に変換すると `ReferenceError` になりLPが消えます。`template.html` の編集時はフォーマット後に必ず確認してください。
