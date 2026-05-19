/**
 * ローカルプレビューサーバー
 * BASE 独自タグをモックデータに置換して http://localhost:3000 で確認できる。
 *
 * クエリパラメータでページ切り替え:
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

// ----- モックデータ -----
const MOCK_SHOP_NAME = 'テストショップ';
const MOCK_ITEMS = [
  { title: 'サンプル商品 A', price: '¥1,200', url: '#', image: 'https://placehold.co/400x400/eee/999?text=A', stock: true  },
  { title: 'サンプル商品 B', price: '¥2,500', url: '#', image: 'https://placehold.co/400x400/eee/999?text=B', stock: true  },
  { title: 'サンプル商品 C（売切）', price: '¥980', url: '#', image: 'https://placehold.co/400x400/eee/999?text=C', stock: false },
  { title: 'サンプル商品 D', price: '¥3,800', url: '#', image: 'https://placehold.co/400x400/eee/999?text=D', stock: true  },
  { title: 'サンプル商品 E', price: '¥1,500', url: '#', image: 'https://placehold.co/400x400/eee/999?text=E', stock: true  },
  { title: 'サンプル商品 F', price: '¥4,200', url: '#', image: 'https://placehold.co/400x400/eee/999?text=F', stock: false },
];
const MOCK_ITEM = MOCK_ITEMS[0];

// ----- ブロックタグ処理 -----
function resolveBlocks(html, page) {
  const active = new Set(['HasLogo', 'HasItemStock', 'HasItemImages']);
  if (page === 'item')       active.add('ItemPage');
  else if (page === 'about') active.add('AboutPage');
  else                       active.add('IndexPage');

  return html.replace(/\{block:(\w+)\}([\s\S]*?)\{\/block:\1\}/g, (_, name, content) => {
    if (name === 'Items') {
      if (!active.has('IndexPage')) return '';
      return MOCK_ITEMS.map(item => {
        let c = content;
        c = c.replace(/\{block:HasNoItemStock\}[\s\S]*?\{\/block:HasNoItemStock\}/g,
          item.stock ? '' : '<span class="sold-out-badge">SOLD OUT</span>');
        c = c.replace(/\{block:HasItemStock\}([\s\S]*?)\{\/block:HasItemStock\}/g, item.stock ? '$1' : '');
        c = c.replace('{ItemTitle}',    item.title);
        c = c.replace('{ItemPrice}',    item.price);
        c = c.replace('{ItemURL}',      item.url);
        c = c.replace('{ItemImageURL}', item.image);
        return c;
      }).join('\n');
    }
    if (name === 'ItemImages') {
      return `<img src="${MOCK_ITEM.image}" alt="${MOCK_ITEM.title}">`;
    }
    return active.has(name) ? content : '';
  });
}

// ----- 変数タグ置換 -----
function resolveVars(html) {
  return html
    .replace('{FaviconTag}',         '')
    .replace('{GoogleAnalyticsTag}', '<!-- GoogleAnalyticsTag -->')
    .replace(/{ShopName}/g,          MOCK_SHOP_NAME)
    .replace('{LogoURL}',            'https://placehold.co/160x40/333/fff?text=LOGO')
    .replace('{ItemTitle}',          MOCK_ITEM.title)
    .replace('{ItemPrice}',          MOCK_ITEM.price)
    .replace('{ItemURL}',            MOCK_ITEM.url)
    .replace(/{ItemImageURL[a-z]*}/g, MOCK_ITEM.image)
    .replace('{ItemDetail}',         '<p>商品説明のサンプルテキストです。</p>')
    .replace('{AddToCartURL}',       '#')
    .replace('{ItemOrderMax}',       '10');
}

// ----- HTML ビルド -----
function buildHtml(page) {
  let html = fs.readFileSync(path.join(SRC, 'template.html'), 'utf-8');
  html = html.replace('%%CSS_URL%%', '/style.css').replace('%%JS_URL%%', '/script.js');
  html = resolveBlocks(html, page);
  html = resolveVars(html);
  // ライブリロード注入
  return html.replace('</body>', `<script>
    const _es = new EventSource('/__reload');
    _es.onmessage = () => location.reload();
  </script></body>`);
}

// ----- SSE ライブリロード -----
const reloadClients = new Set();
function notifyReload() {
  for (const res of reloadClients) res.write('data: reload\n\n');
  reloadClients.clear();
}
fs.watch(SRC, { recursive: true }, (_, filename) => {
  if (filename) { console.log(`[変更検知] ${filename} → リロード`); notifyReload(); }
});

// ----- HTTP サーバー -----
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
      console.error('[SCSS Error]', r.stderr);
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
