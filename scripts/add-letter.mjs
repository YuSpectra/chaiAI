/* 把一封读者来信（已润色好的回信笔记）追加到 data.js 的 LETTERS 最前面，并重新生成 rss.xml。
 *
 * 用法：
 *   node scripts/add-letter.mjs 来信.json            # 写入 data.js 并更新 rss.xml
 *   node scripts/add-letter.mjs 来信.json --dry-run  # 只预览，不改文件
 *
 * 来信.json 格式：
 * {
 *   "slug": "longchang-ai-anxiety",           // 英文短标识，唯一
 *   "title": "龙场悟道，给 AI 焦虑时代的三样东西",
 *   "question": "来信里问的原话（会被转述）",
 *   "from": "一位读者",
 *   "date": "2026-11-08",
 *   "readTime": "8 分钟",
 *   "excerpt": "一句话摘要",
 *   "tags": ["读者来信"],
 *   "body": ["<p>第一段…</p>", "<h2>…</h2>"]
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
const required = ['slug', 'title', 'question', 'from', 'date', 'readTime', 'excerpt', 'body'];
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
const marker = 'window.LETTERS = [';
const at = src.indexOf(marker);
if (at < 0) {
  console.error('data.js 里找不到 window.LETTERS');
  process.exit(2);
}
if (src.includes("slug: '" + letter.slug + "'") || src.includes('"slug": "' + letter.slug + '"')) {
  console.error('slug 已存在：' + letter.slug);
  process.exit(2);
}

const entry = '  ' + JSON.stringify(letter, null, 2).replace(/\n/g, '\n  ') + ',\n\n';
const out = src.slice(0, at + marker.length) + '\n' + entry + src.slice(at + marker.length);

if (dryRun) {
  console.log('[dry-run] 将写入的条目：\n');
  console.log(entry);
  console.log('data.js 未改动。');
  process.exit(0);
}

fs.writeFileSync(DATA, out, 'utf8');
console.log('已把「' + letter.title + '」加入 LETTERS 最前面。');

// 重新生成 RSS（含新来信）
execFileSync(process.execPath, [path.join(ROOT, 'scripts/gen-rss.mjs')], { stdio: 'inherit' });

console.log('\n下一步：提交并部署后，线上 letters.html 和 rss.xml 才会更新。');
console.log('提示：发布前最好再读一遍正文，确认没有问题原文、没有个人信息。');
