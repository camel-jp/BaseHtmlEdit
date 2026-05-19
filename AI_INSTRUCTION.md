# BaseHtmlEdit プロジェクト AI 用開発ガイド

このドキュメントは、BASE カスタムテーマ開発プロジェクト「BaseHtmlEdit」を編集するAIや開発者に向けた重要なガイドラインとTipsです。

## 1. プロジェクト構成とビルドの仕組み

当プロジェクトは保守性を高めるため、ソースコードを分離し、ビルドスクリプトで1つのHTMLに書き出す構成（分離設計）をとっています。

- `src/template.html`: BASEのベースとなるHTMLファイル。
- `src/style.scss`: カスタムCSS。ビルド時にコンパイルされます。
- `src/script.js`: カスタムJavaScript。
- `src/lp/`: 商品ごとのLPフラグメント等の外部HTML。
- `scripts/build.js`: 上記のファイルを結合・コンパイルするスクリプト。
- `dist/`: ビルドの出力先。このフォルダ内の `template.html` をBASE管理画面に貼り付けます。

**⚠️ 重要なルール:**
ビルド後、CSSとJS、LPのHTMLは **GitHub 上のファイルを参照し、jsDelivr (CDN) を経由して読み込まれます**。
そのため、ローカルで作業して `dist/template.html` だけをBASEに貼り付けても、変更したCSS/JS/HTMLは **GitHub の main ブランチに Push しないと本番環境（BASE）には反映されません**。（さらに、CDNの強力なキャッシュにより反映に時間がかかることもあります）

## 2. `{ItemId}` を利用した商品ごとの表示・非表示制御

BASEの仕様上、特定の商品の時だけ特定のコンテンツやLPを表示させたい場合、`{ItemId}` タグを活用して CSS で出し分けを行います。

### 確実な表示制御の手法（CDNキャッシュやJSエラーの回避）

商品固有のクリティカルな CSS 制御（表示・非表示）は、外部 CSS (`style.scss`) ではなく、**`src/template.html` の最後（`</body>` 直前）にインライン `<style>` として記述** してください。

**理由:**
1. **キャッシュ問題の回避:** 外部CSSに書くと、CDNキャッシュによって最新の表示設定がユーザーに届かないリスクがあります。
2. **外部CSSの上書き回避:** 外部のCSSファイルが `template.html` の途中で読み込まれた場合、セレクタの詳細度によっては後から上書きされてしまいます。HTMLの最下部に `!important` 付きで書くことで、あらゆるスタイルに打ち勝ちます。
3. **JSエラーへの耐性:** JavaScript で動的にクラスを付与する手法は、BASEのプレビュー画面等で他の拡張機能起因のJSエラーが起きた場合に処理が停止し、表示が崩れるリスクがあります。

**実装例:**
```html
<!-- src/template.html の </body> 直前に記述する例 -->
<style type="text/css">
    /* 1. デフォルトではすべて非表示にする（キャッシュ対策で強制隠蔽） */
    .content-for-elemnt-cube,
    .set9, .set16, .set25 { display: none !important; }

    /* 2. 商品別ラッパーがある場合のみ強制表示 */
    .product-115127875 .set9  { display: block !important; }
    .product-87999715  .set16 { display: block !important; }
    .product-115127926 .set25 { display: block !important; }
</style>
```

## 3. コーディング上の注意点（フォーマッターの罠）

BASEの独自タグ（例: `{ItemId}`, `{ItemPrice}`）は、波括弧の中にスペースが入ると**BASE側でタグとして認識されず、そのままの文字列として出力されてしまいます**。

- ❌ 失敗例: `window.BASE_ITEM = { id: { ItemId } };`
- ⭕ 成功例: `window.BASE_ITEM = { id: {ItemId} };`

VS Code などのコードフォーマッター（Prettierなど）が、保存時に自動的に `{ ItemId }` のようにスペースを挿入してしまうことがあります。
これが `<script>` タグ内で起きると、`ItemId is not defined` といった致命的な JavaScript エラー（ReferenceErrorなど）を引き起こし、ページ全体の処理が止まってLPが消えるなどの原因になります。
フォーマット実行時にはBASEタグが破壊されていないか十分注意してください。
