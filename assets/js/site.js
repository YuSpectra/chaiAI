/* ============================================================
 * 观子喻知 YuSpectra — 全站公共逻辑 + 页面渲染
 * 依赖：data.js（先加载），无第三方库、无构建步骤
 * ============================================================ */
(function () {
  'use strict';

  var S = window.SITE;
  var NOTES = window.NOTES || [];
  var VIDEOS = window.VIDEOS || [];
  var IMAGES = window.IMAGES || [];
  var TAGS = window.TAGS || [];
  var KEYWORDS = window.KEYWORDS || [];
  var TICKER = window.TICKER || [];
  var NAV = window.NAV || [];

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var dateLabel = function (d) { return String(d || '').replace(/-/g, '.'); };
  var params = new URLSearchParams(window.location.search);
  var noteHref = function (n) { return 'note.html?slug=' + encodeURIComponent(n.slug); };
  var videoHref = function (v) { return 'video.html?slug=' + encodeURIComponent(v.slug); };
  var extAttr = 'target="_blank" rel="noopener noreferrer"';
  var isExternal = function (u) { return /^https?:\/\//.test(u || ''); };
  // 演示状态下微信外链指向站内相对路径：同窗口打开、箭头用「→」；真实绝对地址才新窗口打开
  var linkAttr = function (u) { return isExternal(u) ? ' ' + extAttr : ''; };
  var linkArrow = function (u) { return /^mailto:/.test(u || '') ? '' : (isExternal(u) ? ' ↗' : ' →'); };
  var absUrl = function (u) { try { return new URL(u, window.location.href).href; } catch (e) { return u; } };
  var isPlaceholder = function (u) { return !u || u.indexOf('REPLACE_') === 0 || u === '#'; };

  var ICON = {
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  };

  /* ---------------- 头部 / 页脚 / 浮层 ---------------- */
  function mountHeader() {
    var host = $('#site-header');
    if (!host) return;
    var page = document.body.dataset.page;
    var activeMap = { home: 'index.html', notes: 'notes.html', note: 'notes.html', videos: 'videos.html', video: 'videos.html', gallery: 'gallery.html', about: 'about.html', connect: 'connect.html' };
    var active = activeMap[page] || '';
    var links = NAV.map(function (n) {
      return '<a href="' + n.href + '"' + (n.href === active ? ' class="is-active" aria-current="page"' : '') + '>' + esc(n.label) + '</a>';
    }).join('');
    var mobileLinks = NAV.map(function (n) {
      return '<a href="' + n.href + '"' + (n.href === active ? ' class="is-active"' : '') + '>' + esc(n.label) + '</a>';
    }).join('');
    host.innerHTML =
      '<header class="site-header" id="topbar"><div class="container nav-wrap">' +
        '<a class="brand" href="index.html" aria-label="观子喻知 YuSpectra 首页">' +
          '<span class="brand__mark">观</span><span class="brand__text"><span class="brand__zh">' + esc(S.brandZh) + '</span><span class="brand__en">' + esc(S.brandEn) + '</span></span>' +
        '</a>' +
        '<nav class="nav-links" aria-label="主导航">' + links + '</nav>' +
        '<div class="nav-actions">' +
          '<a class="icon-btn icon-btn--search-lg" href="search.html" aria-label="搜索全站">' + ICON.search + '</a>' +
          '<a class="btn btn--primary nav-cta" href="connect.html">Connect</a>' +
          '<button class="icon-btn hamburger" id="hamburger" aria-label="打开菜单" aria-expanded="false" aria-controls="mobile-menu">' + ICON.menu + '</button>' +
        '</div>' +
      '</div></header>' +
      '<nav class="mobile-menu" id="mobile-menu" aria-label="移动端导航">' + mobileLinks +
        '<div class="mobile-menu__divider"></div>' +
        '<a href="tags.html">标签索引</a><a href="search.html">全站搜索</a>' +
        '<a href="connect.html" style="color:var(--accent)">Connect · 连接我 →</a>' +
      '</nav>';
  }

  function mountFooter() {
    var host = $('#site-footer');
    if (!host) return;
    var navCol = NAV.map(function (n) { return '<a href="' + n.href + '">' + esc(n.label) + '</a>'; }).join('');
    var moreCol = '<a href="tags.html">标签索引</a><a href="search.html">全站搜索</a><a href="rss.xml">RSS 订阅</a><a href="sitemap.xml">站点地图</a>';
    var socialCol = S.social.map(function (s) {
      return '<a href="' + esc(s.url) + '"' + linkAttr(s.url) + '>' + esc(s.label) + linkArrow(s.url) + '</a>';
    }).join('');
    host.innerHTML =
      '<footer class="site-footer"><div class="container"><div class="footer-grid">' +
        '<div class="footer-brand"><a class="brand" href="index.html"><span class="brand__mark">观</span><span class="brand__text"><span class="brand__zh">' + esc(S.brandZh) + '</span><span class="brand__en">' + esc(S.brandEn) + '</span></span></a>' +
          '<p class="footer-brand__slogan">' + esc(S.sloganZh) + '</p><p class="footer-brand__slogan-en">' + esc(S.sloganEn) + '</p></div>' +
        '<div class="footer-col"><h4>Explore</h4>' + navCol + '</div>' +
        '<div class="footer-col"><h4>More</h4>' + moreCol + '</div>' +
        '<div class="footer-col footer-col--social"><h4>Connect</h4>' + socialCol + '</div>' +
      '</div><div class="footer-bottom"><span>' + esc(S.copyright) + '</span><span>' + esc(S.sloganEn) + '</span></div></div></footer>';
  }

  function mountChrome() {
    var back = document.createElement('button');
    back.className = 'back-to-top';
    back.id = 'back-to-top';
    back.setAttribute('aria-label', '回到顶部');
    back.innerHTML = ICON.up;

    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.id = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    var lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.id = 'lightbox';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', '图片预览');
    lb.innerHTML =
      '<button class="lightbox__close" data-lb-close aria-label="关闭预览">✕</button>' +
      '<button class="lightbox__nav lightbox__nav--prev" data-lb-prev aria-label="上一张">‹</button>' +
      '<button class="lightbox__nav lightbox__nav--next" data-lb-next aria-label="下一张">›</button>' +
      '<figure class="lightbox__figure"><img id="lightbox-img" src="" alt=""><figcaption class="lightbox__cap" id="lightbox-cap"></figcaption></figure>';
    document.body.appendChild(back);
    document.body.appendChild(toast);
    document.body.appendChild(lb);
  }

  var toastTimer;
  function showToast(msg) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-visible'); }, 2200);
  }

  /* ---------------- 结构化数据 / meta ---------------- */
  function setMeta(o) {
    if (o.title) document.title = o.title;
    var desc = $('meta[name="description"]');
    if (desc && o.description) desc.setAttribute('content', o.description);
    var ogTitle = $('meta[property="og:title"]');
    if (ogTitle && o.title) ogTitle.setAttribute('content', o.title);
    var ogDesc = $('meta[property="og:description"]');
    if (ogDesc && o.description) ogDesc.setAttribute('content', o.description);
    var ogImg = $('meta[property="og:image"]');
    if (ogImg && o.image) ogImg.setAttribute('content', S.domain.replace(/\/$/, '') + '/' + o.image.replace(/^\//, ''));
    var canonical = $('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', S.domain.replace(/\/$/, '') + '/' + o.path);
  }

  function injectJSONLD(obj) {
    var s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = JSON.stringify(obj);
    document.head.appendChild(s);
  }

  /* ---------------- 组件 ---------------- */
  function keywordCard(k) {
    return '<article class="glass keyword keyword--' + k.color + ' reveal">' +
      '<span class="keyword__num">' + k.num + ' / ' + esc(k.tag) + '</span>' +
      '<span class="keyword__en">' + esc(k.en) + '</span>' +
      '<span class="keyword__zh">' + esc(k.zh) + '</span>' +
      '<p class="keyword__desc">' + esc(k.desc) + '</p>' +
      '<span class="keyword__bar"></span></article>';
  }

  function noteCard(n) {
    return '<a class="glass note-card reveal" href="' + noteHref(n) + '">' +
      '<div class="note-card__media"><img src="' + esc(n.cover) + '" alt="' + esc(n.title) + ' 配图" loading="lazy"></div>' +
      '<div class="note-card__body">' +
        '<div class="note-card__meta"><span class="tag tag--cyan">' + esc(n.category) + '</span><span>' + dateLabel(n.date) + '</span><i class="dot"></i><span>' + esc(n.readTime) + '</span></div>' +
        '<h3>' + esc(n.title) + '</h3><p>' + esc(n.excerpt) + '</p>' +
        '<div class="note-card__foot"><span>阅读全文 →</span><span class="tag-row">' + n.tags.slice(0, 2).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</span></div>' +
      '</div></a>';
  }

  function videoCard(v, big) {
    return '<a class="video-card ' + (big ? 'video-card--big' : 'video-card--small') + ' reveal" href="' + videoHref(v) + '">' +
      '<img src="' + esc(v.cover) + '" alt="' + esc(v.title) + ' 视频封面" loading="lazy">' +
      '<span class="video-card__shade"></span>' +
      '<span class="video-card__play">' + ICON.play + '</span>' +
      '<span class="video-card__info"><h3>' + esc(v.title) + '</h3>' +
        '<span class="video-card__meta"><span class="platform">' + esc(v.platform) + '</span><span>' + esc(v.duration) + '</span><span>' + dateLabel(v.date) + '</span></span></span>' +
    '</a>';
  }

  function galleryTile(im, index) {
    return '<div class="masonry__item"><button class="gallery-tile reveal" data-lightbox="' + index + '" aria-label="放大预览：' + esc(im.title) + '">' +
      '<img src="' + esc(im.src) + '" alt="' + esc(im.title) + '：' + esc(im.desc) + '" loading="lazy">' +
      '<span class="gallery-tile__zoom">＋</span>' +
      '<span class="gallery-tile__cap"><strong>' + esc(im.title) + '</strong><span>' + esc(im.tags.join(' · ')) + ' · ' + dateLabel(im.date) + '</span></span>' +
    '</button></div>';
  }

  function qrCard(kind) {
    var w = S.wechat;
    var isOfficial = kind === 'official';
    var name = isOfficial ? w.officialName : w.channelName;
    var desc = isOfficial ? w.officialDesc : w.channelDesc;
    var qr = isOfficial ? w.officialQr : w.channelQr;
    var link = isOfficial ? w.officialUrl : w.channelUrl;
    var btn = isOfficial ? '前往公众号' : '前往视频号';
    return '<article class="glass qr-card reveal">' +
      '<div class="qr-card__img"><img src="' + esc(qr) + '" alt="' + esc(name) + '的虚拟二维码（演示用，不可扫码）" loading="lazy">' +
        (w.demo ? '<span class="qr-card__badge">DEMO · 虚拟</span>' : '') + '</div>' +
      '<div class="qr-card__body"><h3>' + esc(name) + '</h3><p>' + esc(desc) + '</p>' +
        '<p class="qr-card__hint">' + esc(w.qrHint || w.hint) + '</p>' +
        '<div class="btn-row"><a class="btn btn--primary btn--sm" href="' + esc(link) + '"' + linkAttr(link) + '>' + btn + linkArrow(link) + '</a>' +
        '<button class="btn btn--ghost btn--sm" data-copy="' + esc(absUrl(link)) + '">复制链接</button></div>' +
      '</div></article>';
  }

  function contactCard() {
    var c = S.contact || {};
    return '<article class="glass contact-card reveal">' +
      '<div class="contact-card__main"><span class="eyebrow">Say hello / 连接我</span>' +
        '<h3>' + esc(c.name || S.brandZh) + '</h3>' +
        '<p>' + esc(c.note || '') + '</p></div>' +
      '<div class="contact-card__actions">' +
        '<a class="btn btn--primary" href="connect.html#letter">写一封信给我</a>' +
      '</div></article>';
  }

  function timeline() {
    var items = [];
    NOTES.forEach(function (n) { items.push({ kind: '笔记', date: n.date, title: n.title, desc: n.excerpt, thumb: n.cover, href: noteHref(n) }); });
    VIDEOS.forEach(function (v) { items.push({ kind: '视频', date: v.date, title: v.title, desc: v.intro, thumb: v.cover, href: videoHref(v) }); });
    IMAGES.forEach(function (im, i) { items.push({ kind: '影像', date: im.date, title: im.title, desc: im.desc, thumb: im.src, href: 'gallery.html', index: i }); });
    items.sort(function (a, b) { return b.date.localeCompare(a.date); });
    return items.slice(0, 6).map(function (it) {
      var open = it.kind === '影像' ? 'data-lightbox="' + it.index + '"' : 'href="' + it.href + '"';
      var tag = it.kind === '影像' ? 'button' : 'a';
      return '<' + tag + ' class="timeline__item reveal" ' + open + '>' +
        '<span class="timeline__card"><img class="timeline__thumb" src="' + esc(it.thumb) + '" alt="" loading="lazy">' +
        '<span class="timeline__text"><strong>' + esc(it.title) + '</strong><span>' + dateLabel(it.date) + ' · ' + esc(it.desc) + '</span></span>' +
        '<span class="timeline__kind">' + it.kind + '</span></span></' + tag + '>';
    }).join('');
  }

  /* ---------------- 全局交互 ---------------- */
  function initGlobal() {
    var topbar = $('#topbar');
    var back = $('#back-to-top');
    var onScroll = function () {
      var y = window.scrollY || document.documentElement.scrollTop;
      if (topbar) topbar.classList.toggle('is-scrolled', y > 12);
      if (back) back.classList.toggle('is-visible', y > 420);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    var burger = $('#hamburger');
    var menu = $('#mobile-menu');
    if (burger && menu) {
      burger.addEventListener('click', function () {
        var open = menu.classList.toggle('is-open');
        burger.setAttribute('aria-expanded', String(open));
        burger.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
        burger.innerHTML = open ? ICON.close : ICON.menu;
      });
      menu.addEventListener('click', function (e) {
        if (e.target.closest('a')) { menu.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); burger.innerHTML = ICON.menu; }
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && menu.classList.contains('is-open')) { menu.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); burger.innerHTML = ICON.menu; }
      });
    }

    if (back) back.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

    // 外链默认新窗口打开
    $$('a[href^="http"]').forEach(function (a) {
      if (a.host && a.host !== window.location.host) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); }
    });

    // 复制链接
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-copy]');
      if (!btn) return;
      var value = btn.getAttribute('data-copy');
      if (!value || value === 'current') value = window.location.href;
      var done = function () { showToast('链接已复制 ✓'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(done, function () { fallbackCopy(value, done); });
      } else { fallbackCopy(value, done); }
    });

    // 灯箱
    var lb = $('#lightbox');
    var current = 0;
    function renderLB(i) {
      current = (i + IMAGES.length) % IMAGES.length;
      var im = IMAGES[current];
      $('#lightbox-img').src = im.src;
      $('#lightbox-img').alt = im.title + '：' + im.desc;
      $('#lightbox-cap').innerHTML = '<strong>' + esc(im.title) + '</strong><span>' + esc(im.desc) + ' · ' + dateLabel(im.date) + ' · ' + (current + 1) + ' / ' + IMAGES.length + '</span>';
    }
    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('[data-lightbox]');
      if (trigger) {
        e.preventDefault();
        renderLB(parseInt(trigger.getAttribute('data-lightbox'), 10) || 0);
        lb.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        var closeBtn = $('[data-lb-close]');
        if (closeBtn) closeBtn.focus();
        return;
      }
      if (e.target.closest('[data-lb-close]') || (lb.classList.contains('is-open') && e.target === lb)) { closeLB(); return; }
      if (e.target.closest('[data-lb-prev]')) { renderLB(current - 1); return; }
      if (e.target.closest('[data-lb-next]')) { renderLB(current + 1); return; }
    });
    function closeLB() { lb.classList.remove('is-open'); document.body.style.overflow = ''; }
    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('is-open')) return;
      if (e.key === 'Escape') closeLB();
      if (e.key === 'ArrowLeft') renderLB(current - 1);
      if (e.key === 'ArrowRight') renderLB(current + 1);
    });
  }

  function fallbackCopy(value, done) {
    var input = document.createElement('textarea');
    input.value = value;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    try { document.execCommand('copy'); done(); } catch (err) { showToast('复制失败，请手动复制地址栏链接'); }
    document.body.removeChild(input);
  }

  function observeReveals() {
    var els = $$('.reveal');
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach(function (el) { el.classList.add('in-view'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add('in-view'); io.unobserve(entry.target); }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });
    els.forEach(function (el) {
      var r = el.getBoundingClientRect();
      // 首屏内元素立即显现，避免出现观察器回调尚未触发时的空白
      if (r.top < window.innerHeight - 30 && r.bottom > 0) el.classList.add('in-view');
      else io.observe(el);
    });
  }

  /* ---------------- 页面渲染 ---------------- */
  var pages = {};

  pages.home = function () {
    injectJSONLD({
      '@context': 'https://schema.org', '@type': 'WebSite',
      name: S.brandZh + ' ' + S.brandEn, url: S.domain,
      description: S.sloganZh, inLanguage: 'zh-CN',
      potentialAction: { '@type': 'SearchAction', target: S.domain + '/search.html?q={search_term_string}', 'query-input': 'required name=search_term_string' }
    });
    var k = $('#keywords-grid'); if (k) k.innerHTML = KEYWORDS.map(keywordCard).join('');
    var f = $('#featured-notes'); if (f) f.innerHTML = NOTES.slice(0, 3).map(noteCard).join('');
    var vw = $('#video-wall');
    if (vw) vw.innerHTML = VIDEOS.map(function (v) { return videoCard(v, !!v.featured); }).join('');
    var gp = $('#gallery-preview'); if (gp) gp.innerHTML = IMAGES.slice(0, 6).map(function (im, i) { return galleryTile(im, i); }).join('');
    var tl = $('#timeline-stream'); if (tl) tl.innerHTML = timeline();
    var cc = $('#connect-cards'); if (cc) cc.innerHTML = qrCard('official') + qrCard('channel');
    var coc = $('#connect-contact'); if (coc) coc.innerHTML = contactCard();
    var tk = $('#ticker-track');
    if (tk) {
      var group = '<div class="ticker__group">' + TICKER.map(function (t) { return '<span class="ticker__item">' + esc(t) + '</span>'; }).join('') + '</div>';
      tk.innerHTML = group;
    }
  };

  pages.notes = function () {
    var filters = $('#notes-filters');
    var grid = $('#notes-grid');
    var count = $('#notes-count');
    var empty = $('#notes-empty');
    var search = $('#notes-search');
    var state = { tag: params.get('tag') || '全部', q: '' };

    if (filters) {
      filters.innerHTML = ['全部'].concat(TAGS).map(function (t) {
        return '<button class="chip" data-tag="' + esc(t) + '">' + esc(t) + '</button>';
      }).join('');
      filters.addEventListener('click', function (e) {
        var chip = e.target.closest('[data-tag]');
        if (!chip) return;
        state.tag = chip.getAttribute('data-tag');
        render();
        var url = new URL(window.location.href);
        if (state.tag === '全部') url.searchParams.delete('tag'); else url.searchParams.set('tag', state.tag);
        history.replaceState(null, '', url);
      });
    }
    if (search) search.addEventListener('input', function () { state.q = search.value.trim().toLowerCase(); render(); });

    function render() {
      var list = NOTES.filter(function (n) {
        var tagOk = state.tag === '全部' || n.tags.indexOf(state.tag) > -1 || n.category === state.tag;
        var qOk = !state.q || (n.title + n.excerpt + n.tags.join('') + n.category).toLowerCase().indexOf(state.q) > -1;
        return tagOk && qOk;
      });
      if (filters) $$('[data-tag]', filters).forEach(function (c) { c.classList.toggle('is-active', c.getAttribute('data-tag') === state.tag); });
      if (count) count.textContent = '共 ' + list.length + ' 篇笔记' + (state.tag === '全部' ? '' : ' · 标签「' + state.tag + '」');
      if (grid) grid.innerHTML = list.map(noteCard).join('');
      if (empty) empty.hidden = list.length > 0;
      observeReveals();
    }
    render();
  };

  pages.note = function () {
    var host = $('#note-detail');
    var n = NOTES.filter(function (x) { return x.slug === params.get('slug'); })[0] || NOTES[0];
    var path = 'note.html?slug=' + encodeURIComponent(n.slug);
    setMeta({
      title: n.title + ' · 观测笔记 | ' + S.brandZh + ' ' + S.brandEn,
      description: n.excerpt, image: n.cover, path: path
    });
    injectJSONLD({
      '@context': 'https://schema.org', '@type': 'BlogPosting',
      headline: n.title, description: n.excerpt, image: S.domain.replace(/\/$/, '') + '/' + n.cover,
      datePublished: n.date, dateModified: n.date, inLanguage: 'zh-CN',
      author: { '@type': 'Person', name: S.profile.displayName },
      publisher: { '@type': 'Organization', name: S.brandZh + ' ' + S.brandEn },
      mainEntityOfPage: S.domain.replace(/\/$/, '') + '/' + path,
      keywords: n.tags.join(', ')
    });
    var idx = NOTES.indexOf(n);
    var prev = NOTES[idx - 1], next = NOTES[idx + 1];
    var related = NOTES.filter(function (x) { return x !== n; }).slice(0, 3);
    // 分享出去的链接用当前页面的真实地址
    var shareUrl = encodeURIComponent(absUrl(path));
    host.innerHTML =
      '<div class="container--narrow"><div class="breadcrumb"><a href="index.html">首页</a> / <a href="notes.html">观测笔记</a> / <span>' + esc(n.category) + '</span></div>' +
      '<header class="article-hero"><span class="eyebrow">' + esc(n.category) + '</span>' +
        '<h1>' + esc(n.title) + '</h1>' +
        '<p class="article-hero__excerpt">' + esc(n.excerpt) + '</p>' +
        '<div class="note-card__meta" style="margin-top:22px"><span>' + dateLabel(n.date) + '</span><i class="dot"></i><span>阅读约 ' + esc(n.readTime) + '</span><i class="dot"></i><span>' + esc(S.profile.displayName) + '</span></div>' +
        '<div class="tag-row" style="margin-top:16px">' + n.tags.map(function (t) { return '<a class="tag" href="notes.html?tag=' + encodeURIComponent(t) + '">#' + esc(t) + '</a>'; }).join('') + '</div>' +
      '</header>' +
      '<div class="article-cover reveal"><img src="' + esc(n.cover) + '" alt="' + esc(n.title) + ' 配图"></div>' +
      '<article class="prose reveal">' + n.body.join('') + '</article>' +
      '<div class="article-foot"><div class="tag-row">' + n.tags.map(function (t) { return '<a class="tag" href="tags.html">#' + esc(t) + '</a>'; }).join('') + '</div>' +
        '<div class="share-row"><span style="color:var(--muted);font-size:13px">分享</span>' +
          '<button class="btn btn--ghost btn--sm" data-copy="current">复制链接</button>' +
          '<a class="btn btn--ghost btn--sm" href="https://twitter.com/intent/tweet?text=' + encodeURIComponent(n.title) + '&url=' + shareUrl + '" ' + extAttr + '>分享到 X ↗</a>' +
        '</div></div>' +
      '<nav class="article-foot" aria-label="上一篇 / 下一篇">' +
        (prev ? '<a class="text-link" href="' + noteHref(prev) + '">← ' + esc(prev.title) + '</a>' : '<span></span>') +
        (next ? '<a class="text-link" href="' + noteHref(next) + '">' + esc(next.title) + ' →</a>' : '<span></span>') +
      '</nav>' +
      '<section class="related"><div class="section-head"><div><span class="eyebrow">Keep reading</span><h2>继续观测</h2></div><a class="text-link" href="notes.html">全部笔记 →</a></div>' +
        '<div class="card-grid">' + related.map(noteCard).join('') + '</div></section></div>';
  };

  pages.videos = function () {
    var wall = $('#videos-wall');
    if (wall) wall.innerHTML = VIDEOS.map(function (v) { return videoCard(v, !!v.featured); }).join('');
    var list = $('#videos-list');
    if (list) list.innerHTML = VIDEOS.map(function (v) {
      return '<a class="search-result" href="' + videoHref(v) + '"><img src="' + esc(v.cover) + '" alt="" loading="lazy"><span><strong>' + esc(v.title) + '</strong><span>' + esc(v.platform) + ' · ' + esc(v.duration) + ' · ' + dateLabel(v.date) + '</span></span></a>';
    }).join('');
  };

  pages.video = function () {
    var host = $('#video-detail');
    var v = VIDEOS.filter(function (x) { return x.slug === params.get('slug'); })[0] || VIDEOS[0];
    var path = 'video.html?slug=' + encodeURIComponent(v.slug);
    setMeta({ title: v.title + ' · 视频 | ' + S.brandZh + ' ' + S.brandEn, description: v.intro, image: v.cover, path: path });
    injectJSONLD({
      '@context': 'https://schema.org', '@type': 'VideoObject',
      name: v.title, description: v.intro, thumbnailUrl: [S.domain.replace(/\/$/, '') + '/' + v.cover],
      uploadDate: v.date, duration: 'PT' + (parseInt(v.duration, 10) || 3) + 'M',
      publisher: { '@type': 'Organization', name: S.brandZh + ' ' + S.brandEn },
      contentUrl: isPlaceholder(v.videoUrl) ? undefined : v.videoUrl
    });
    var real = !isPlaceholder(v.videoUrl);
    var isFile = real && /\.(mp4|webm|ogg)(\?|$)/i.test(v.videoUrl);
    var player = isFile
      ? '<video class="player" controls poster="' + esc(v.cover) + '"><source src="' + esc(v.videoUrl) + '">你的浏览器不支持视频播放。</video>'
      : '<div class="player"><img src="' + esc(v.cover) + '" alt="' + esc(v.title) + ' 视频封面"><div class="player__inner"><div class="play-big">' + ICON.play + '</div><h2 style="font-size:20px;margin:0">视频链接待接入</h2><p>先看封面。替换 data.js 中该视频的 videoUrl 后即可播放或跳转。</p>' +
        (real ? '<a class="btn btn--primary btn--sm" style="margin-top:18px" href="' + esc(v.videoUrl) + '" ' + extAttr + '>前往' + esc(v.platform) + '观看 ↗</a>' : '<a class="btn btn--primary btn--sm" style="margin-top:18px" href="' + esc(S.wechat.channelUrl) + '"' + linkAttr(S.wechat.channelUrl) + '>' + (isExternal(S.wechat.channelUrl) ? '前往视频号' : '浏览本站视频') + linkArrow(S.wechat.channelUrl) + '</a>') +
        '</div></div>';
    var related = VIDEOS.filter(function (x) { return x !== v; });
    host.innerHTML =
      '<div class="container"><div class="breadcrumb"><a href="index.html">首页</a> / <a href="videos.html">视频</a> / <span>' + esc(v.title) + '</span></div>' +
      '<div class="container--narrow" style="width:100%"><header class="article-hero"><span class="eyebrow">' + esc(v.platform) + ' · ' + esc(v.duration) + '</span>' +
        '<h1>' + esc(v.title) + '</h1><p class="article-hero__excerpt">' + esc(v.intro) + '</p>' +
        '<div class="note-card__meta" style="margin-top:20px"><span>' + dateLabel(v.date) + '</span><i class="dot"></i><span>' + esc(v.platform) + '</span><i class="dot"></i><span>时长 ' + esc(v.duration) + '</span></div></header>' +
      player +
      '<div class="prose" style="margin-top:34px"><p>这是一支关于「' + esc(v.title) + '」的示例视频条目。视频链接、封面与平台信息都存放在 <code>assets/js/data.js</code> 的 VIDEOS 数组中，替换为真实地址即可上线。</p></div>' +
      '<div class="article-foot"><div class="tag-row"><span class="tag tag--cyan">' + esc(v.platform) + '</span><a class="tag" href="videos.html">全部视频</a></div>' +
        '<div class="share-row"><button class="btn btn--ghost btn--sm" data-copy="current">复制链接</button><a class="btn btn--ghost btn--sm" href="connect.html">查看连接方式 →</a></div></div>' +
      '</div>' +
      '<section class="related"><div class="section-head"><div><span class="eyebrow">More motion</span><h2>更多视频</h2></div><a class="text-link" href="videos.html">全部视频 →</a></div>' +
        '<div class="video-wall">' + related.map(function (x) { return videoCard(x, false); }).join('') + '</div></section></div>';
  };

  pages.gallery = function () {
    var grid = $('#gallery-grid');
    if (grid) grid.innerHTML = IMAGES.map(function (im, i) { return galleryTile(im, i); }).join('');
    var count = $('#gallery-count');
    if (count) count.textContent = '共 ' + IMAGES.length + ' 张影像 · 点击任意图片查看大图';
  };

  pages.about = function () {
    var host = $('#about-content');
    var p = S.profile;
    host.innerHTML =
      '<div class="about-grid">' +
        '<article class="glass about-card reveal"><span class="eyebrow">About us / 关于我们</span><h2>' + esc(S.brandZh + ' ' + S.brandEn) + '</h2>' +
          '<p>' + esc(p.intro) + '</p><p class="en">' + esc(p.introEn) + '</p>' +
          '<span class="eyebrow" style="display:block;margin-top:26px">Content / 内容方向</span>' +
          '<div class="focus-list">' + p.focus.map(function (f) { return '<div class="focus-item">' + esc(f) + '</div>'; }).join('') + '</div>' +
        '</article>' +
        '<aside class="glass about-card reveal"><span class="eyebrow">Positioning / 定位</span><h2>一个持续更新的个人内容品牌</h2>' +
          '<p>' + esc(S.brandZh) + ' ' + esc(S.brandEn) + ' 用来安放文章、读书笔记、视频、图片与视觉实验，同时连接微信公众号与视频号。</p>' +
          '<p>气质是年轻、好奇、有创造力、有探索感；呈现上追求简洁、清晰与留白，始终把阅读体验放在第一位。</p>' +
          '<a class="btn btn--primary btn--sm" href="connect.html">连接我 →</a>' +
        '</aside>' +
      '</div>' +
      '<div class="stat-strip reveal"><div class="stat"><b>' + NOTES.length + '</b><span>观测笔记</span></div><div class="stat"><b>' + VIDEOS.length + '</b><span>视频日志</span></div><div class="stat"><b>' + IMAGES.length + '</b><span>影像实验</span></div><div class="stat"><b>∞</b><span>持续更新</span></div></div>' +
      '<section class="section"><div class="section-head"><div><span class="eyebrow">Four keywords</span><h2>四个关键词</h2></div></div><div class="keyword-grid">' + KEYWORDS.map(keywordCard).join('') + '</div></section>' +
      '<div class="glass cta-banner reveal"><h2>一起向外体察</h2><p>' + esc(S.sloganZh) + '</p><div class="btn-row" style="justify-content:center"><a class="btn btn--primary" href="notes.html">读笔记</a><a class="btn btn--ghost" href="connect.html">连接我</a></div></div>';
  };

  pages.connect = function () {
    var cc = $('#connect-cards');
    if (cc) cc.innerHTML = qrCard('official') + qrCard('channel');
    var links = $('#connect-links');
    var w = S.wechat;
    if (links) links.innerHTML =
      '<div class="glass about-card reveal"><span class="eyebrow">Links / 演示外链</span><h2>公众号文章与视频号入口</h2>' +
      '<p>以下两条为演示链接，当前指向本站的观测笔记与视频页；拿到真实地址后在 <code>data.js</code> 中替换即可自动生效。二维码卡片同理。</p>' +
      '<div class="btn-row" style="margin-top:20px"><a class="btn btn--ghost btn--sm" href="' + esc(w.officialArticleUrl) + '"' + linkAttr(w.officialArticleUrl) + '>公众号文章链接' + linkArrow(w.officialArticleUrl) + '</a>' +
      '<a class="btn btn--ghost btn--sm" href="' + esc(w.channelUrl) + '"' + linkAttr(w.channelUrl) + '>视频号主页链接' + linkArrow(w.channelUrl) + '</a></div>' +
      '<p style="margin-top:18px;font-size:13px;color:var(--accent)">' + esc(w.hint) + '</p></div>';
    showLetterStatus();
  };

  /* 表单提交回跳（?sent=1）后给出明确反馈，避免读者以为没寄出 */
  function showLetterStatus() {
    var status = $('#letter-status');
    if (!status) return;
    var sent = window.location.search.indexOf('sent=1') > -1;
    if (sent) {
      status.hidden = false;
      status.textContent = '信已寄出。我会一封一封看完，留了邮箱的话会回到你的邮箱。';
      var form = $('#letter-form');
      if (form) form.querySelectorAll('input, textarea, select, button').forEach(function (el) { el.disabled = true; });
      var anchor = $('#letter');
      if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  pages.tags = function () {
    var cloud = $('#tag-cloud');
    if (cloud) cloud.innerHTML = TAGS.map(function (t) {
      var n = NOTES.filter(function (x) { return x.tags.indexOf(t) > -1 || x.category === t; }).length;
      var im = IMAGES.filter(function (x) { return x.tags.indexOf(t) > -1; }).length;
      return '<a href="notes.html?tag=' + encodeURIComponent(t) + '">#' + esc(t) + '<span>' + (n + im) + ' 条</span></a>';
    }).join('');
    var list = $('#tag-highlights');
    if (list) list.innerHTML = NOTES.slice(0, 3).map(noteCard).join('');
  };

  pages.search = function () {
    var input = $('#search-input');
    var host = $('#search-results');
    if (!host) return;
    function match(q, fields) { return !q || fields.join(' ').toLowerCase().indexOf(q) > -1; }
    function group(title, arr) {
      if (!arr.length) return '';
      return '<section class="search-group"><h2>' + title + ' <span style="color:var(--muted);font-size:13px">· ' + arr.length + ' 条</span></h2>' +
        arr.map(function (r) {
          return '<a class="search-result" href="' + r.href + '"><img src="' + esc(r.img) + '" alt="" loading="lazy"><span><strong>' + esc(r.title) + '</strong><span>' + esc(r.desc) + '</span></span></a>';
        }).join('') + '</section>';
    }
    function render() {
      var q = (input ? input.value : '').trim().toLowerCase();
      if (!q) {
        host.innerHTML = '<section class="search-group"><h2>试着搜点什么</h2><div class="tag-row">' + TAGS.slice(0, 8).map(function (t) { return '<button class="chip" data-suggest="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div>' +
          '<p style="color:var(--muted);margin-top:16px;font-size:14px">可搜索文章标题、摘要、标签、视频简介与影像说明。</p></section>' +
          group('最新笔记', NOTES.slice(0, 3).map(function (n) { return { title: n.title, desc: n.excerpt, img: n.cover, href: noteHref(n) }; }));
        return;
      }
      var notes = NOTES.filter(function (n) { return match(q, [n.title, n.excerpt, n.category, n.tags.join(' '), n.body.join('')]); })
        .map(function (n) { return { title: n.title, desc: n.category + ' · ' + dateLabel(n.date) + ' · ' + n.excerpt, img: n.cover, href: noteHref(n) }; });
      var videos = VIDEOS.filter(function (v) { return match(q, [v.title, v.intro, v.platform]); })
        .map(function (v) { return { title: v.title, desc: v.platform + ' · ' + v.duration, img: v.cover, href: videoHref(v) }; });
      var images = IMAGES.filter(function (im, i) { return match(q, [im.title, im.desc, im.tags.join(' ')]); })
        .map(function (im, i) { return { title: im.title, desc: im.desc, img: im.src, href: 'gallery.html' }; });
      var tags = TAGS.filter(function (t) { return match(q, [t]); })
        .map(function (t) { return { title: '#' + t, desc: '标签 · 查看相关内容', img: IMAGES[0].src, href: 'notes.html?tag=' + encodeURIComponent(t) }; });
      var total = notes.length + videos.length + images.length + tags.length;
      host.innerHTML = '<p class="result-count">「' + esc(q) + '」共找到 ' + total + ' 条结果</p>' +
        (total ? group('观测笔记', notes) + group('视频', videos) + group('影像', images) + group('标签', tags)
               : '<div class="empty-state"><h3>没有找到相关内容</h3><p>换个关键词试试，或去 <a class="text-link" href="notes.html">观测笔记</a> 逛逛。</p></div>');
    }
    if (input) {
      input.addEventListener('input', render);
      if (params.get('q')) input.value = params.get('q');
    }
    host.addEventListener('click', function (e) {
      var s = e.target.closest('[data-suggest]');
      if (s && input) { input.value = s.getAttribute('data-suggest'); render(); input.focus(); }
    });
    render();
  };

  pages.notfound = function () { /* 404 页为静态内容，全局交互已挂载 */ };

  /* ---------------- 启动 ---------------- */
  function boot() {
    if (!window.SITE) { console.error('data.js 未加载'); return; }
    mountHeader();
    mountFooter();
    mountChrome();
    initGlobal();
    var page = document.body.dataset.page || 'home';
    if (pages[page]) pages[page]();
    observeReveals();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
