/**
 * ローカルプレビューサーバー
 * BASE 独自タグをモックデータに置換して http://localhost:3000 で確認できる。
 *
 * ページ切り替え（クエリパラメータ）:
 *   http://localhost:3000/            → 商品一覧 (IndexPage)
 *   http://localhost:3000/?page=item  → 商品詳細 (ItemPage)
 *   http://localhost:3000/?page=about → ショップ紹介 (AboutPage)
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC  = path.join(ROOT, 'src');
const PORT = 3000;

// ============================================================
// モックデータ
// ============================================================
const SHOP = {
  name:          'テストショップ',
  introduction:  'ショップの説明文です。こちらに ABOUT ページの内容が表示されます。',
  url:           `http://localhost:${PORT}`,
  instagramId:   'test_shop',
};

const MOCK_ITEMS = [
  { title: 'サンプル商品 A', price: '¥1,200', stock: true  },
  { title: 'サンプル商品 B（売切）', price: '¥2,500', stock: false },
  { title: 'サンプル商品 C', price: '¥980',  stock: true  },
  { title: 'サンプル商品 D', price: '¥3,800', stock: true  },
  { title: 'サンプル商品 E', price: '¥1,500', stock: true  },
  { title: 'サンプル商品 F（売切）', price: '¥4,200', stock: false },
];

const MOCK_IMG = (text, size = 400) =>
  `https://placehold.co/${size}x${size}/e8e8e8/888?text=${encodeURIComponent(text)}`;

const LANG = {
  PreOrderItem:          '予約販売',
  LotteryItem:           '抽選販売',
  TakeoutItem:           'テイクアウト',
  CommunityLimitedItem:  'コミュニティ限定',
  Tweet:                 'ツイート',
  Privacy:               'プライバシーポリシー',
  Law:                   '特定商取引法に基づく表記',
  NoItemsMessage:        '商品がありません',
  NotShopPublicMessage:  'このショップは現在非公開です',
  ItemSearchResult:      '検索結果',
  IncludedTax:           '(税込)',
  SubscriptionInitialPrice: '初回価格',
  SubscriptionRepeatPrice:  '2回目以降',
};

// ============================================================
// ブロックタグの処理
// ============================================================

// ページごとの有効ブロック定義
function getActiveBlocks(page) {
  // 共通で常に有効なブロック
  const active = new Set([
    'NotLoadItemsPage',
    'ShopPublic',
    'NoIndexPageSearch',
    'NoIndexPageCategory',
    'ShopInstagramId',
    'ItemNowOnSale',
    'NoItemProperPrice',
    'NoSubscriptionInitialProperPrice',
    'NoSubscriptionInitialPrice',
    'PurchaseForm',
    'ItemImage1',
    'ItemImage2',
  ]);

  if (page === 'index') {
    active.add('IndexPage');
    active.add('HasItems');
    active.add('HasItemStock');
  } else if (page === 'item') {
    active.add('ItemPage');
    active.add('NotItemPage');
    active.add('HasItemStock');
    active.add('ItemImage1');
    active.add('ItemImage2');
  } else if (page === 'about') {
    active.add('AboutPage');
    active.add('NotItemPage');
  }

  return active;
}

// Items ループ内のサブブロック処理（在庫状況に応じて）
function resolveItemBlocks(content, item) {
  // NoItemStock / HasItemStock
  if (item.stock) {
    content = content.replace(/\{block:NoItemStock\}[\s\S]*?\{\/block:NoItemStock\}/g, '');
    content = content.replace(/\{block:HasItemStock\}([\s\S]*?)\{\/block:HasItemStock\}/g, '$1');
  } else {
    content = content.replace(/\{block:NoItemStock\}([\s\S]*?)\{\/block:NoItemStock\}/g, '$1');
    content = content.replace(/\{block:HasItemStock\}[\s\S]*?\{\/block:HasItemStock\}/g, '');
  }
  // ItemNowOnSale / ItemEndOfSale
  content = content.replace(/\{block:ItemNowOnSale\}([\s\S]*?)\{\/block:ItemNowOnSale\}/g, '$1');
  content = content.replace(/\{block:ItemEndOfSale\}[\s\S]*?\{\/block:ItemEndOfSale\}/g, '');
  content = content.replace(/\{block:ItemWatingForSale\}[\s\S]*?\{\/block:ItemWatingForSale\}/g, '');
  // Price
  content = content.replace(/\{block:NoItemProperPrice\}([\s\S]*?)\{\/block:NoItemProperPrice\}/g, '$1');
  content = content.replace(/\{block:HasItemProperPrice\}[\s\S]*?\{\/block:HasItemProperPrice\}/g, '');
  // Apps (非インストール)
  content = content.replace(/\{block:AppsItemLabel\}[\s\S]*?\{\/block:AppsItemLabel\}/g, '');
  content = content.replace(/\{block:ItemPreOrder\}[\s\S]*?\{\/block:ItemPreOrder\}/g, '');
  content = content.replace(/\{block:ItemLottery\}[\s\S]*?\{\/block:ItemLottery\}/g, '');
  content = content.replace(/\{block:ItemTakeout\}[\s\S]*?\{\/block:ItemTakeout\}/g, '');
  content = content.replace(/\{block:ItemCommunityLimited\}[\s\S]*?\{\/block:ItemCommunityLimited\}/g, '');
  // NoItemImage
  content = content.replace(/\{block:ItemImage1\}([\s\S]*?)\{\/block:ItemImage1\}/g, '$1');
  content = content.replace(/\{block:NoItemImage1\}[\s\S]*?\{\/block:NoItemImage1\}/g, '');
  return content;
}

// メインブロック処理
function resolveBlocks(html, page) {
  const active = getActiveBlocks(page);

  // Items ループ（特殊処理）
  html = html.replace(/\{block:Items\}([\s\S]*?)\{\/block:Items\}/g, (_, tpl) => {
    if (!active.has('IndexPage')) return '';
    return MOCK_ITEMS.map((item, i) => {
      let c = resolveItemBlocks(tpl, item);
      c = c.replace(/{ItemTitle}/g,        item.title);
      c = c.replace(/{ItemPrice}/g,        item.price);
      c = c.replace(/{ItemPageURL}/g,      `/?page=item`);
      c = c.replace(/{ItemImage1URL-\d+}/g, MOCK_IMG(String.fromCharCode(65 + i)));
      c = c.replace(/{ItemNoImageURL}/g,   MOCK_IMG('no image'));
      return c;
    }).join('\n');
  });

  // その他すべてのブロックを処理（内側から順に / 繰り返し適用）
  let prev;
  do {
    prev = html;
    html = html.replace(/\{block:(\w+)\}([\s\S]*?)\{\/block:\1\}/g, (_, name, content) => {
      return active.has(name) ? content : '';
    });
  } while (html !== prev);

  return html;
}

// ============================================================
// 変数タグの置換
// ============================================================
function resolveVars(html, page) {
  const detail = MOCK_ITEMS[0];
  const img500 = MOCK_IMG('商品画像', 500);
  const img76  = MOCK_IMG('', 76);

  return html
    // BASE システムタグ（空に）
    .replace(/\{FaviconTag\}/g,              '')
    .replace(/\{CanonicalTag\}/g,            '')
    .replace(/\{BackgroundTag\}/g,           '')
    .replace(/\{GoogleAnalyticsTag\}/g,      '')
    .replace(/\{BASEMenuTag\}/g,             '')
    .replace(/\{MetaItemInfoTag\}/g,         '')
    .replace(/\{MetaShopInfoTag\}/g,         '')
    .replace(/\{HeadLinkNextPrevTag\}/g,     '')
    .replace(/\{ItemBnplBannerTag\}/g,       '')
    .replace(/\{ItemAttentionTag\}/g,        '')
    .replace(/\{ItemSelectTag\}/g,           '<select><option>1</option></select>')
    .replace(/\{PurchaseButton\}/g,          '<button class="purchaseButton__btn" type="button">カートに入れる</button>')
    .replace(/\{SocialButtonTag\}/g,         '')
    .replace(/\{EmbedWidgetTag\}/g,          '')
    .replace(/\{IllegalReportTag\}/g,        '')
    .replace(/\{IllegalReportMessageTag\}/g, '')
    .replace(/\{PageContents\}/g,            '')
    .replace(/\{AppsAgeVerificationWarningTag\}/g, '')
    .replace(/\{CommunityPurchaseButton\}/g, '')
    .replace(/\{ItemSaleStatusTag\}/g,       'COMING SOON')
    // ショップ情報
    .replace(/{ShopName}/g,         SHOP.name)
    .replace(/{PageTitle}/g,        SHOP.name)
    .replace(/{ShopURL}/g,          SHOP.url)
    .replace(/{ShopRedirectUrl}/g,  SHOP.url)
    .replace(/{ShopIntroduction}/g, SHOP.introduction)
    .replace(/{ShopInstagramId}/g,  SHOP.instagramId)
    .replace(/{LogoTag}/g,          SHOP.name)
    // URL
    .replace(/{IndexPageURL}/g,   '/')
    .replace(/{AboutPageURL}/g,   '/?page=about')
    .replace(/{ContactPageURL}/g, '#')
    .replace(/{PrivacyPageURL}/g, '#')
    .replace(/{LawPageURL}/g,     '#')
    .replace(/{SearchPageURL}/g,  '#')
    .replace(/{BlogPageURL}/g,    '#')
    // ページネーション
    .replace(/{MaxPageNumber}/g,       '1')
    .replace(/{NextPageNumber}/g,      '2')
    .replace(/{LoadItemsPageURL}/g,    '#')
    .replace(/{LoadItemsPageURLParams}/g, '')
    .replace(/{UpdateTime}/g,          '1')
    .replace(/{IndexPageSearch}/g,     '')
    // BASEURL（画像・CSS パスのベース）
    .replace(/{BASEURL}/g, 'https://thebase.in')
    // 商品詳細
    .replace(/{ItemTitle}/g,          detail.title)
    .replace(/{ItemPrice}/g,          detail.price)
    .replace(/{ItemProperPrice}/g,    '¥2,000')
    .replace(/{ItemDiscountRate}/g,   '10%OFF')
    .replace(/{ItemDetail}/g,         'サンプル商品の説明文です。ここに商品の詳細が入ります。')
    .replace(/{ItemPageURL}/g,        '/?page=item')
    .replace(/{ItemRedirectUrl}/g,    '/?page=item')
    .replace(/{AddToCartURL}/g,       '#')
    .replace(/{ItemNoImageURL}/g,     MOCK_IMG('no image'))
    .replace(/{ItemImage1URL-origin}/g, img500)
    .replace(/{ItemImage1URL-500}/g,    img500)
    .replace(/{ItemImage1URL-300}/g,    MOCK_IMG('商品画像', 300))
    .replace(/{ItemImage1URL-76}/g,     img76)
    .replace(/{ItemImage2URL-origin}/g, MOCK_IMG('画像2', 500))
    .replace(/{ItemImage2URL-500}/g,    MOCK_IMG('画像2', 500))
    .replace(/{ItemImage2URL-76}/g,     MOCK_IMG('2', 76))
    .replace(/{ItemImage3URL-origin}/g, MOCK_IMG('画像3', 500))
    .replace(/{ItemImage3URL-500}/g,    MOCK_IMG('画像3', 500))
    .replace(/{ItemImage3URL-76}/g,     MOCK_IMG('3', 76))
    .replace(/{ItemImage4URL-[^}]+}/g,  MOCK_IMG('画像4', 400))
    .replace(/{ItemImage5URL-[^}]+}/g,  MOCK_IMG('画像5', 400))
    // {Counter} はスライダーのインデックス（既に静的に 0-4 に書き換え済み）
    .replace(/{Counter}/g, '0')
    // SNS
    .replace(/{TwitterDataHashtags}/g, '')
    .replace(/{TwitterDataVia}/g,      '')
    // lang タグ
    .replace(/\{lang:(\w+)\}/g, (_, key) => LANG[key] || key);
}

// ============================================================
// HTML ビルド
// ============================================================
function buildHtml(page) {
  let html = fs.readFileSync(path.join(SRC, 'template.html'), 'utf-8');

  // CSS / JS をローカルに差し替え
  html = html.replace('%%CSS_URL%%', '/style.css').replace('%%JS_URL%%', '/script.js');

  html = resolveBlocks(html, page);
  html = resolveVars(html, page);

  // ライブリロード
  return html.replace('</body>', `<script>
    const _es = new EventSource('/__reload');
    _es.onmessage = () => location.reload();
  </script></body>`);
}

// ============================================================
// SSE ライブリロード
// ============================================================
const reloadClients = new Set();
function notifyReload() {
  for (const res of reloadClients) res.write('data: reload\n\n');
  reloadClients.clear();
}
fs.watch(SRC, { recursive: true }, (_, filename) => {
  if (filename) { console.log(`[変更検知] ${filename} → リロード`); notifyReload(); }
});

// ============================================================
// HTTP サーバー
// ============================================================
http.createServer((req, res) => {
  const { pathname, query } = url.parse(req.url, true);
  const page = query.page || 'index';

  if (pathname === '/__reload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    res.write(': connected\n\n');
    reloadClients.add(res);
    req.on('close', () => reloadClients.delete(res));
    return;
  }

  if (pathname === '/style.css') {
    const scssPath = path.join(SRC, 'style.scss');
    const r = spawnSync(`sass "${scssPath}" --style=expanded --no-source-map`, { encoding: 'utf8', shell: true });
    if (r.status !== 0) {
      res.writeHead(500, { 'Content-Type': 'text/css' });
      res.end(`/* SCSS Error:\n${r.stderr} */`);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/css' });
      res.end(r.stdout);
    }
    return;
  }

  if (pathname === '/script.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(fs.readFileSync(path.join(SRC, 'script.js'), 'utf-8'));
    return;
  }

  try {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buildHtml(page));
  } catch (err) {
    console.error('[Preview Error]', err.message);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Error: ${err.message}`);
  }

}).listen(PORT, () => {
  console.log(`\nプレビューサーバー起動: http://localhost:${PORT}`);
  console.log('  商品一覧     → http://localhost:' + PORT + '/');
  console.log('  商品詳細     → http://localhost:' + PORT + '/?page=item');
  console.log('  ショップ紹介  → http://localhost:' + PORT + '/?page=about');
  console.log('\nsrc/ を編集するとブラウザが自動リロードします。Ctrl+C で停止\n');
});
