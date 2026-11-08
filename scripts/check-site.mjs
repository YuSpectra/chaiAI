/* 站点自检：本地资源引用、SEO 元信息、占位资源清单
 * 运行：node scripts/check-site.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlFiles = readdirSync(root).filter((f) => f.endsWith('.html')).sort();
const errors = [];
const warnings = [];
let refCount = 0;

for (const file of htmlFiles) {
  const html = readFileSync(join(root, file), 'utf8');
  if (!/<title>[\s\S]+?<\/title>/.test(html)) errors.push(`${file}: 缺少 <title>`);
  if (!/name="description"/.test(html)) errors.push(`${file}: 缺少 meta description`);
  if (!/rel="canonical"/.test(html)) errors.push(`${file}: 缺少 canonical`);
  if (!/property="og:title"/.test(html)) errors.push(`${file}: 缺少 og:title`);
  if (!/assets\/js\/data\.js/.test(html) || !/assets\/js\/site\.js/.test(html)) errors.push(`${file}: 未引入 data.js / site.js`);
  if (!/data-page="/.test(html)) errors.push(`${file}: 缺少 data-page`);

  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  for (const ref of refs) {
    if (/^(https?:|mailto:|\/\/|data:|#)/.test(ref)) continue;
    const clean = ref.split(/[?#]/)[0];
    if (!clean) continue;
    refCount++;
    if (!existsSync(resolve(root, clean))) errors.push(`${file}: 引用了不存在的资源 ${ref}`);
  }
}

const data = readFileSync(join(root, 'assets/js/data.js'), 'utf8');
const imgRefs = [...data.matchAll(/'([^'\n]*assets\/img\/[^'\n]+)'/g)].map((m) => m[1]);
for (const ref of new Set(imgRefs)) {
  if (!existsSync(resolve(root, ref))) errors.push(`data.js: 引用了不存在的图片 ${ref}`);
}

const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
for (const loc of locs) {
  const path = loc.replace(/^https?:\/\/[^/]+\//, '').split('?')[0];
  if (path && !existsSync(resolve(root, path))) errors.push(`sitemap.xml: 指向不存在的页面 ${loc}`);
}

const rss = readFileSync(join(root, 'rss.xml'), 'utf8');
if (!/<rss version="2\.0"/.test(rss)) errors.push('rss.xml: 不是有效的 RSS 2.0 占位文件');

if (/REPLACE_VIDEO_URL/.test(data)) warnings.push('VIDEOS 中仍有 REPLACE_VIDEO_URL 占位（上线前替换）');
if (/example\.com/.test(data + sitemap + rss)) warnings.push('仍使用 https://chai.aibay.asia 占位域名（上线前替换）');
if (/mp\.weixin\.qq\.com|channels\.weixin\.qq\.com/.test(data)) warnings.push('仍存在微信域名的假链接（上线前替换）');
if (/demo:\s*true/.test(data)) warnings.push('当前为演示状态：虚拟二维码 + 指向本站的演示外链（按需求保留）');

console.log(`页面 ${htmlFiles.length} 个 · HTML 本地引用 ${refCount} 条 · data.js 图片 ${new Set(imgRefs).size} 张 · sitemap ${locs.length} 条`);
console.log(`\n错误：${errors.length}`);
errors.forEach((e) => console.log('  ✗ ' + e));
console.log(`\n待替换提示：${warnings.length}`);
warnings.forEach((w) => console.log('  ! ' + w));
process.exit(errors.length ? 1 : 0);
