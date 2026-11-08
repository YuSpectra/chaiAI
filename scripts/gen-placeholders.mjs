/* 生成站内全部占位图（纯 SVG，离线可用、无外部依赖）
 * 风格：浅色简约 —— 柔和几何 + 大留白 + 单一沉静强调色，无网格/扫描线/光斑/霓虹。
 * 运行：node scripts/gen-placeholders.mjs
 * 替换真实图片时，同名覆盖 assets/img/ 下的文件即可，无需改动任何页面代码。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'assets', 'img');
mkdirSync(out, { recursive: true });

const palettes = [
  ['#1c6b64'], // 深青绿
  ['#4a6b8a'], // 雾蓝
  ['#8a7358'], // 暖褐
  ['#5b6680'], // 灰蓝
  ['#7a5f6b'], // 灰紫
  ['#3f6f6a'], // 松绿
];

function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function art({ w, h, seed, label, sub, index }) {
  const [c1] = palettes[index % palettes.length];
  const r = rand(seed);
  const cx = Math.round(w * (0.58 + r() * 0.08));
  const cy = Math.round(h * (0.40 + r() * 0.08));
  const radius = Math.round(Math.min(w, h) * 0.30);
  const en = "'Space Grotesk',Arial,sans-serif";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label} 示例封面">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fcfdfe"/><stop offset="1" stop-color="#edf1f4"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <circle cx="${cx}" cy="${cy}" r="${radius}" fill="${c1}" opacity="0.10"/>
  <circle cx="${cx}" cy="${cy}" r="${Math.round(radius * 0.72)}" fill="none" stroke="${c1}" stroke-opacity="0.28" stroke-width="2"/>
  <rect x="64" y="${Math.round(h * 0.16)}" width="${Math.round(w * 0.14)}" height="3" rx="1.5" fill="${c1}" opacity="0.85"/>
  <rect x="64" y="36" width="${w - 128}" height="${h - 72}" rx="12" fill="none" stroke="#1c2431" stroke-opacity="0.06"/>
  <text x="${w - 64}" y="76" text-anchor="end" fill="#98a1ae" font-family="${en}" font-size="18" letter-spacing="1">YUSPECTRA / ${label}</text>
</svg>`;
}

/* 虚拟二维码：外观是二维码点阵 + 三个定位角，但中央与底部明确标注 DEMO / 暂不可扫码。
 * 上线前把 data.js 里的路径换成真实二维码图片即可。 */
function qr(title, sub, color) {
  const r = rand(9137);
  const cn = "'Microsoft YaHei','PingFang SC','Noto Sans SC',Arial,sans-serif";
  const en = "'Space Grotesk',Arial,sans-serif";
  const cells = [];
  const n = 21, unit = 20, pad = 60;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const isFinder = (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
      const isLogo = x >= 6 && x <= 17 && y >= 8 && y <= 16;
      if (isFinder || isLogo) continue;
      const isTiming = x === 6 || y === 6;
      const on = isTiming ? (x + y) % 2 === 0 : r() > 0.5;
      if (!on) continue;
      cells.push(`<rect x="${pad + x * unit}" y="${pad + y * unit}" width="${unit - 3}" height="${unit - 3}" rx="2" fill="#1c2431" opacity="0.9"/>`);
    }
  }
  const finder = (x, y) => `<g><rect x="${x}" y="${y}" width="140" height="140" rx="12" fill="#1c2431"/><rect x="${x + 20}" y="${y + 20}" width="100" height="100" rx="8" fill="#ffffff"/><rect x="${x + 40}" y="${y + 40}" width="60" height="60" rx="6" fill="${color}"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600" role="img" aria-label="${title} 虚拟二维码（演示用，不可扫码）">
  <rect width="600" height="600" rx="20" fill="#ffffff"/>
  <rect x="20" y="20" width="560" height="560" rx="14" fill="none" stroke="#d4d9e1" stroke-width="2"/>
  ${cells.join('')}
  ${finder(pad, pad)}${finder(pad + (n - 7) * unit, pad)}${finder(pad, pad + (n - 7) * unit)}
  <rect x="186" y="230" width="228" height="140" rx="12" fill="#ffffff"/>
  <rect x="186" y="230" width="228" height="140" rx="12" fill="none" stroke="#e5e8ed" stroke-width="2"/>
  <text x="300" y="282" text-anchor="middle" fill="#1c2431" font-family="${cn}" font-size="30" font-weight="600">虚拟二维码</text>
  <text x="300" y="316" text-anchor="middle" fill="#6b7482" font-family="${en}" font-size="15">DEMO · NOT SCANNABLE</text>
  <text x="300" y="346" text-anchor="middle" fill="${color}" font-family="${en}" font-size="14" letter-spacing="2">YUSPECTRA</text>
  <text x="300" y="512" text-anchor="middle" fill="#1c2431" font-family="${cn}" font-size="24" font-weight="600">${title}</text>
  <text x="300" y="544" text-anchor="middle" fill="#6b7482" font-family="${cn}" font-size="16">${sub}</text>
</svg>`;
}

const files = [];
/* 文章 / 视频 / 影像封面现已使用真实图片（assets/img/*.jpg），这里只生成二维码、OG 图与 favicon。 */
files.push(['qr-official-placeholder.svg', qr('公众号 · 观子喻知（演示）', '虚拟二维码 · 暂不可扫码，上线前替换', '#1c6b64')]);
files.push(['qr-channel-placeholder.svg', qr('视频号 · 观子喻知（演示）', '虚拟二维码 · 暂不可扫码，上线前替换', '#4a6b8a')]);
files.push(['og-cover.svg', art({ w: 1200, h: 630, seed: 999, label: 'YUSPECTRA', sub: '观子喻知 · 向外体察，读懂万象，启思创造，拥抱探索', index: 0 })]);
files.push(['favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1c6b64"/><circle cx="32" cy="32" r="17" fill="none" stroke="#ffffff" stroke-width="3"/><circle cx="32" cy="32" r="5" fill="#ffffff"/></svg>`]);

for (const [name, content] of files) writeFileSync(join(out, name), content, 'utf8');
console.log(`Generated ${files.length} placeholder assets in assets/img/`);
