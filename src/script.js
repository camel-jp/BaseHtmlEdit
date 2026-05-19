/**
 * BaseHtmlEdit / script.js
 *
 * 役割:
 *   1. 元素キューブ LP コンテンツを CDN から fetch して DOM に注入
 *   2. 注入後に LP 内のインタラクション（タブ・アコーディオン・在庫表示など）を初期化
 *   3. 商品ページ共通: bxSlider / colorbox / mCustomScrollbar の初期化
 *   4. BASEアイコン（カート・BASE）をLP ナビに移動
 *
 * 依存: jQuery（template.html の head で読み込み済み）
 *       bxSlider / colorbox / mCustomScrollbar（template.html の {block:ItemPage} 内で読み込み済み）
 *       window.BASE_ITEM = { id, price, stock }  ← template.html の <script> で設定済み
 */

(function ($) {
  'use strict';

  // ---- 元素キューブ商品 ID ----
  var ELEMENT_CUBE_IDS = [87999715, 115127926, 115127875];

  // ---- LP ファイルの取得先 ----
  var LP_BASE = location.hostname === 'localhost'
    ? ''
    : 'https://cdn.jsdelivr.net/gh/camel-jp/BaseHtmlEdit@gh-pages';

  // ============================================================
  // 1. 商品ページ共通スライダー / カラーボックス / スクロールバー
  // ============================================================
  function initSlider() {
    if (!$('#slideImg').length) return;
    $(window).on('load', function () {
      $('#slideImg').bxSlider({
        controls: false,
        pagerCustom: '#slideImgPager',
        adaptiveHeight: true,
        mode: 'fade'
      });
      $('.ajax').on('click', function (e) { e.preventDefault(); });
      $('.ajax').colorbox({ className: 'itemCb', maxWidth: '90%', maxHeight: '90%', current: false });
      $('#slideImgPager').mCustomScrollbar({ axis: 'y', theme: 'inset-dark' });
    });
  }

  // ============================================================
  // 2. LP コンテンツ注入
  // ============================================================
  function loadLP(itemId) {
    var preMountPoint  = document.getElementById('lp-pre-purchase');
    var postMountPoint = document.getElementById('lp-post-purchase');
    if (!preMountPoint && !postMountPoint) return;

    fetch(LP_BASE + '/lp/element-cube.html')
      .then(function (r) {
        if (!r.ok) throw new Error('LP fetch failed: ' + r.status);
        return r.text();
      })
      .then(function (html) {
        var tmp = document.createElement('div');
        tmp.innerHTML = html;

        var preEl  = tmp.querySelector('.lp-pre');
        var postEl = tmp.querySelector('.lp-post');

        function mount(el, target) {
          if (!el || !target) return;
          var wrapper = document.createElement('div');
          wrapper.className = 'product-' + itemId;
          wrapper.appendChild(el);
          target.appendChild(wrapper);
        }

        mount(preEl,  preMountPoint);
        mount(postEl, postMountPoint);

        initStockIndicator(window.BASE_ITEM ? window.BASE_ITEM.stock : 0);
        initTabs();
        initAccordion();
        initElementsGrid();
        initPurchaseButton();
      })
      .catch(function (err) {
        console.warn('[LP]', err.message);
      });
  }

  // ============================================================
  // 3. 在庫インジケーター
  // ============================================================
  function initStockIndicator(stock) {
    var LOW_STOCK = 30;
    var MAX_STOCK = 200;

    document.querySelectorAll('.stock-indicator-bar').forEach(function (bar) {
      var statusEl = bar.querySelector('.status-text');
      var qtyEl    = bar.querySelector('.js-stock-qty');
      var barEl    = bar.querySelector('.js-stock-bar');

      if (!statusEl || !qtyEl || !barEl) return;

      if (stock <= 0) {
        bar.classList.add('out-of-stock');
        statusEl.textContent = '在庫なし';
        qtyEl.textContent = '---';
        barEl.style.width = '0%';
      } else if (stock <= LOW_STOCK) {
        bar.classList.add('low-stock');
        statusEl.textContent = '残りわずか';
        qtyEl.textContent = stock;
        barEl.style.width = Math.max(0, (stock / MAX_STOCK) * 100) + '%';
      } else {
        bar.classList.add('in-stock');
        statusEl.textContent = '在庫あり';
        qtyEl.textContent = stock;
        barEl.style.width = Math.min(100, (stock / MAX_STOCK) * 100) + '%';
      }
    });
  }

  // ============================================================
  // 4. タブ切り替え
  // ============================================================
  function initTabs() {
    document.querySelectorAll('.tab-button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tabId = this.getAttribute('data-tab');
        var container = this.closest('.tabs');
        if (!container) return;

        container.querySelectorAll('.tab-button').forEach(function (b) { b.classList.remove('active'); });
        container.querySelectorAll('.tab-pane').forEach(function (p) { p.classList.remove('active'); });

        this.classList.add('active');
        var pane = container.querySelector('#' + tabId);
        if (pane) pane.classList.add('active');
      });
    });
  }

  // ============================================================
  // 5. アコーディオン
  // ============================================================
  function initAccordion() {
    document.querySelectorAll('.accordion-header').forEach(function (header) {
      header.addEventListener('click', function () {
        var item = this.parentElement;
        item.classList.toggle('active');
        var icon = this.querySelector('.accordion-icon');
        if (icon) icon.textContent = item.classList.contains('active') ? '-' : '+';
      });
    });
  }

  // ============================================================
  // 6. 元素グリッド IntersectionObserver
  // ============================================================
  function initElementsGrid() {
    var grid       = document.querySelector('.elements-grid');
    var elements   = document.querySelectorAll('.element');
    var indicators = document.querySelectorAll('.element-indicator');
    if (!grid || !elements.length) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var sym = entry.target.dataset.symbol;
          indicators.forEach(function (ind) {
            ind.classList.toggle('active', ind.dataset.symbol === sym);
          });
        }
      });
    }, { root: grid, threshold: 0.6 });

    elements.forEach(function (el) { observer.observe(el); });

    indicators.forEach(function (ind) {
      ind.addEventListener('click', function () {
        var target = document.querySelector('.element[data-symbol="' + this.dataset.symbol + '"]');
        if (target) target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      });
    });
  }

  // ============================================================
  // 7. 購入ボタンに価格を表示
  // ============================================================
  function initPurchaseButton() {
    if (!window.BASE_ITEM) return;
    var price = window.BASE_ITEM.price;

    function updateButtons(qty) {
      var priceNum = parseInt(price.replace(/[^0-9]/g, ''), 10);
      var total = priceNum * qty;
      var formatted = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', minimumFractionDigits: 0 }).format(total);
      var suffix = qty > 1 ? ' / ' + qty + '個' : '';
      document.querySelectorAll('.purchaseButton .purchaseButton__btn').forEach(function (el) {
        el.textContent = '購入する ' + formatted + suffix;
      });
    }

    updateButtons(1);

    var sel = document.getElementById('amountSelect');
    if (sel) {
      sel.addEventListener('change', function () {
        updateButtons(Number(this.value) || 1);
      });
    }
  }

  // ============================================================
  // 8. BASE アイコンを LP ナビに移動
  // ============================================================
  function initBaseIconMove() {
    if (!document.getElementById('shopDetailPage')) return;
    var navList = document.querySelector('#shopDetailPage .header .container .nav ul');
    var base = document.querySelector('body #baseMenu .base');
    var cart = document.querySelector('body #baseMenu .cart');
    if (navList && base && cart) {
      navList.appendChild(base);
      navList.appendChild(cart);
    }
    var baseImg = document.querySelector('.base img');
    var cartImg = document.querySelector('.cart img');
    if (baseImg) baseImg.style.height = '13px';
    if (cartImg) cartImg.style.height = '13px';
  }

  // ============================================================
  // エントリーポイント
  // ============================================================
  $(function () {
    var itemId = window.BASE_ITEM ? window.BASE_ITEM.id : null;

    // 商品ページ共通
    initSlider();

    // 元素キューブ商品のみ LP を読み込む
    if (itemId && ELEMENT_CUBE_IDS.indexOf(itemId) !== -1) {
      // body に product-XXXXX クラスを付与（CSS セレクタ用）
      document.body.classList.add('product-' + itemId);
      loadLP(itemId);
      initBaseIconMove();
    }
  });

}(jQuery));
