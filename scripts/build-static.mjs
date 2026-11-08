/* 把根目录的静态站点整理到 dist/，供 GitHub Pages 发布。
 * 只用 Node 内置模块，不需要 npm install，也不依赖 fs.cpSync。
 * 运行：node scripts/build-static.mjs
 */
import { rmSync, mkdirSync, readdirSync, copyFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const rootFiles = ['sitemap.xml', 'rss.xml', 'robots.txt'];
const htmlFiles = readdirSync(root).filter(function (f) { return f.endsWith('.html'); });

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const from = join(src, name);
    const to = join(dest, name);
    if (statSync(from).isDirectory()) copyDir(from, to);
    else copyFileSync(from, to);
  }
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

for (const f of htmlFiles) copyFileSync(join(root, f), join(dist, f));
for (const f of rootFiles) {
  const src = join(root, f);
  if (existsSync(src)) copyFileSync(src, join(dist, f));
}
copyDir(join(root, 'assets'), join(dist, 'assets'));

console.log('dist ready: ' + htmlFiles.length + ' pages, ' + rootFiles.length + ' SEO files, assets/');
