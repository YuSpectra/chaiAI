/* 把一封润色好的回信笔记追加到 data.js 的 NOTES 最前面，并重新生成 rss.xml。
 *
 * 用法：
 *   node scripts/add-letter.mjs 来信.json            # 写入 data.js 并更新 rss.xml
 *   node scripts/add-letter.mjs 来信.json --dry-run  # 只预览，不改文件
 *
 * 来信.json 格式（页面只展示笔记，不要放来信原文与来信人）：
 * {
 *   "slug": "daodejing-workplace",       // 英文短标识，唯一
 *   "title": "《道德经》好在哪：复杂职场里的三个用法",
 *   "date": "2026-11-09",
 *   "readTime": "7 分钟",
 *   "excerpt": "一句话说清这封回信讲了什么",
 *   "tags": ["读者来信", "道德经"],
 *   "cover": "assets/img/note-06.jpg",  // 选填
 *   "body": ["<p>开头先交代：前阵子收到一位读者的来信，TA 在困惑什么……</p>", "<h2>…</h2>"]
 * }
 *
 * 写入后还需要提交部署，线上才会出现。不愿意公开的来信不要用这个脚本。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'assets/js/data.js');

const args = process.argv.slice(2);
const jsonPath = args.find(a => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');

if (!jsonPath) {
  console.error('用法：node scripts/add-letter.mjs 来信.json [--dry-run]');
  process.exit(2);
}

const letter = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const required = ['slug', 'title', 'date', 'readTime', 'excerpt', 'body'];
const missing = required.filter(k => !letter[k] || (Array.isArray(letter[k]) && !letter[k].length));
if (missing.length) {
  console.error('来信.json 缺少字段：' + missing.join(', '));
  process.exit(2);
}
if (!Array.isArray(letter.body)) {
  console.error('body 必须是 HTML 字符串数组');
  process.exit(2);
}
if (!/^[a-z0-9-]+$/.test(letter.slug)) {
  console.error('slug 只能用小写字母、数字、连字符');
  process.exit(2);
}

const src = fs.readFileSync(DATA, 'utf8');
const marker = 'window.NOTES = [';
const at = src.indexOf(marker);
if (at < 0) {
  console.error('data.js 里找不到 window.NOTES');
  process.exit(2);
}
if (src.includes("slug: '" + letter.slug + "'") || src.includes('"slug": "' + letter.slug + '"')) {
  console.error('slug 已存在：' + letter.slug);
  process.exit(2);
}

const note = {
  slug: letter.slug,
  title: letter.title,
  category: '读者来信',
  excerpt: letter.excerpt,
  cover: letter.cover || 'assets/img/og-cover.svg',
  tags: Array.isArray(letter.tags) && letter.tags.length ? letter.tags : ['读者来信'],
  date: letter.date,
  readTime: letter.readTime,
  body: letter.body,
};
const entry = '  ' + JSON.stringify(note, null, 2).replace(/\n/g, '\n  ') + ',\n';
const out = src.slice(0, at + marker.length) + '\n' + entry + src.slice(at + marker.length);

if (dryRun) {
  console.log('[dry-run] 将写入的条目：\n');
  console.log(entry);
  console.log('data.js 未改动。');
  process.exit(0);
}

fs.writeFileSync(DATA, out, 'utf8');
console.log('已把「' + letter.title + '」加入 NOTES 最前面（读者来信分类）。');

execFileSync(process.execPath, [path.join(ROOT, 'scripts/gen-rss.mjs')], { stdio: 'inherit' });

console.log('\n下一步：提交并部署后，线上 letters.html、note.html 和 rss.xml 才会更新。');
console.log('提示：发布前再读一遍正文，确认没有来信原文、没有个人信息。');
