/* 从 assets/js/data.js 自动生成 rss.xml（RSS 2.0）。
 * 以后新增/修改文章：改 data.js 里的 NOTES，然后运行 `node scripts/gen-rss.mjs` 即可。
 * 换域名：node scripts/gen-rss.mjs --base https://你的域名  （结尾不带斜杠）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const bi = args.indexOf('--base');
/* 默认用当前真实可访问的线上地址；chai.aibay.asia 解绑后可改回 */
const BASE = (bi >= 0 && args[bi + 1] ? args[bi + 1] : 'https://yuspectra.github.io/chaiAI').replace(/\/+$/, '');

/* 在沙箱里执行 data.js，取出 SITE / NOTES / VIDEOS */
const sandbox = { window: {} };
const src = fs.readFileSync(path.join(ROOT, 'assets/js/data.js'), 'utf8');
new Function('window', src)(sandbox.window);
const SITE = sandbox.window.SITE;
const NOTES = sandbox.window.NOTES || [];
const VIDEOS = sandbox.window.VIDEOS || [];

function escXml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function pad(n) { return String(n).padStart(2, '0'); }
function rfc822(t) {
  var u = new Date(t.getTime() + 8 * 3600 * 1000); // 让 UTC 取值等于 +08:00 的本地时间
  return DAYS[u.getUTCDay()] + ', ' + pad(u.getUTCDate()) + ' ' + MONS[u.getUTCMonth()] + ' ' +
    u.getUTCFullYear() + ' ' + pad(u.getUTCHours()) + ':' + pad(u.getUTCMinutes()) + ':' + pad(u.getUTCSeconds()) + ' +0800';
}
/* '2026-10-28' -> 'Wed, 28 Oct 2026 09:00:00 +0800' */
function pubDate(d) {
  return rfc822(new Date(d + 'T09:00:00+08:00'));
}

const items = [];

for (const n of NOTES) {
  const url = BASE + '/note.html?slug=' + n.slug;
  items.push(
    '    <item>\n' +
    '      <title>' + escXml(n.category === '读者来信' ? '[读者来信] ' + n.title : n.title) + '</title>\n' +
    '      <link>' + escXml(url) + '</link>\n' +
    '      <guid isPermaLink="true">' + escXml(url) + '</guid>\n' +
    '      <pubDate>' + pubDate(n.date) + '</pubDate>\n' +
    '      <category>' + escXml(n.category || '') + '</category>\n' +
    '      <description>' + escXml(n.excerpt || '') + '</description>\n' +
    '    </item>'
  );
}

for (const v of VIDEOS) {
  const url = BASE + '/video.html?slug=' + v.slug;
  items.push(
    '    <item>\n' +
    '      <title>' + escXml('[视频] ' + v.title) + '</title>\n' +
    '      <link>' + escXml(url) + '</link>\n' +
    '      <guid isPermaLink="true">' + escXml(url) + '</guid>\n' +
    '      <pubDate>' + pubDate(v.date) + '</pubDate>\n' +
    '      <category>视频</category>\n' +
    '      <description>' + escXml(v.intro || '') + '</description>\n' +
    '    </item>'
  );
}

/* 按日期倒序 */
items.sort(function (a, b) {
  const da = a.match(/<pubDate>(.*?)<\/pubDate>/)[1];
  const db = b.match(/<pubDate>(.*?)<\/pubDate>/)[1];
  return new Date(db) - new Date(da);
});

const xml =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<!-- 由 scripts/gen-rss.mjs 自动生成，请勿手改；更新内容请改 assets/js/data.js 后重新运行该脚本 -->\n' +
  '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n' +
  '  <channel>\n' +
  '    <title>' + escXml(SITE.brandZh + ' ' + SITE.brandEn) + '</title>\n' +
  '    <link>' + escXml(BASE) + '/</link>\n' +
  '    <description>' + escXml(SITE.aboutZh) + '</description>\n' +
  '    <language>zh-CN</language>\n' +
  '    <lastBuildDate>' + rfc822(new Date()) + '</lastBuildDate>\n' +
  '    <atom:link href="' + escXml(BASE) + '/rss.xml" rel="self" type="application/rss+xml"/>\n' +
  items.join('\n') + '\n' +
  '  </channel>\n' +
  '</rss>\n';

fs.writeFileSync(path.join(ROOT, 'rss.xml'), xml, 'utf8');
console.log('rss.xml 已生成：' + items.length + ' 个条目，BASE=' + BASE);
