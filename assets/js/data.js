/* ============================================================
 * 观子喻知 YuSpectra — 全站示例数据（唯一内容源）
 * ------------------------------------------------------------
 * 想改内容，只改这个文件即可，所有页面会自动更新。
 * 当前为「演示状态」：二维码是虚拟的（不可扫码），微信外链全部指向本站，
 * 自我介绍即「关于我们」中英文文案。上线前替换项用 TODO(替换) 标注，详见 README.md。
 * ============================================================ */

/* 「关于我们」中英文：品牌文案与自我介绍共用同一份，避免两处文案分叉 */
var ABOUT_ZH = '欢迎来到【观子喻知】。向外体察，读懂万象，启思创造，拥抱探索。内容持续更新，邀你一同探寻。';
var ABOUT_EN = 'Welcome to YuSpectra. To observe, to understand, to create, to embrace. New content is posted here, and you are welcome to explore with us.';

window.SITE = {
  brandZh: '观子喻知',
  brandEn: 'YuSpectra',
  sloganZh: '向外体察，读懂万象，启思创造，拥抱探索。',
  sloganEn: 'To observe, to understand, to create, to embrace.',
  aboutZh: ABOUT_ZH,
  aboutEn: ABOUT_EN,

  /* 站点域名（已指向线上地址）。换域名时把全站的 https://chai.aibay.asia 一起替换。 */
  domain: 'https://chai.aibay.asia',

  /* 自我介绍 = 「关于我们」中英文内容；不填虚构的身份、城市或邮箱。
   * displayName 仅作为品牌署名（文章作者 / 结构化数据使用）。 */
  profile: {
    displayName: '观子喻知',
    intro: ABOUT_ZH,
    introEn: ABOUT_EN,
    focus: ['AI 生成内容', '读书笔记', '影像与视频实验', '视觉设计'],
  },

  /* 演示状态：两张二维码为「虚拟二维码」（外观像二维码但不可扫码，图上已标注 DEMO），
   * 所有公众号 / 视频号外链先指向本站页面，不再出现假的微信域名。
   * TODO(替换)：上线前把 officialQr / channelQr 换成真实二维码图片，
   * 并把 officialUrl / officialArticleUrl / channelUrl 换成真实绝对地址（会自动新窗口打开）。 */
  wechat: {
    demo: true,
    officialName: '公众号 · 观子喻知',
    officialDesc: '长文、读书笔记与创作复盘，第一时间更新。',
    officialQr: 'assets/img/qr-official-placeholder.svg',   // 虚拟二维码
    officialUrl: 'index.html',          // 演示链接 → 本站首页
    officialArticleUrl: 'notes.html',   // 演示链接 → 本站观测笔记
    channelName: '视频号 · 观子喻知',
    channelDesc: '视频日志、AI 生成影像与创作现场。',
    channelQr: 'assets/img/qr-channel-placeholder.svg',     // 虚拟二维码
    channelUrl: 'videos.html',          // 演示链接 → 本站视频
    qrHint: '虚拟二维码 · 演示用，暂不可扫码',
    hint: '当前为演示状态：二维码不可扫码，按钮与外链均指向本站 · 微信内打开更佳',
  },

  /* 微信相关入口先指向本站；GitHub 是真实仓库链接，保留 */
  social: [
    { label: 'GitHub', url: 'https://github.com/YuSpectra/chaiAI' },
    { label: '公众号', url: 'index.html' },
    { label: '视频号', url: 'videos.html' },
    { label: 'RSS', url: 'rss.xml' },
  ],

  copyright: '© 2026 观子喻知 YuSpectra · 向外体察，读懂万象，启思创造，拥抱探索。',
};

/* 首屏内容标签 */
window.TICKER = ['AI 读书笔记', '影像实验', '视频日志', '创造现场', 'AI 生成', '城市观察', 'Open to explore'];

/* 四个关键词 */
window.KEYWORDS = [
  { en: 'Observe', zh: '体察', num: '01', desc: '把视线投向外部世界，从细节里收集第一手的好奇。', color: 'cyan', tag: '观察' },
  { en: 'Understand', zh: '读懂', num: '02', desc: '拆解一本书、一个工具、一次经验，找到它真正的结构。', color: 'purple', tag: '理解' },
  { en: 'Create', zh: '创造', num: '03', desc: '用文字、影像与 AI 把理解变成看得见的新东西。', color: 'yellow', tag: '创作' },
  { en: 'Embrace', zh: '拥抱', num: '04', desc: '保持开放，拥抱探索本身，也拥抱尚未成形的答案。', color: 'orange', tag: '探索' },
];

window.TAGS = [
  '读书笔记', '观察随笔', 'AI 创作思考', '视频日志文字版',
  'AI 生成', '摄影', '视觉实验', '城市', '提示词', '影像实验',
];

/* ---------------- 6 篇示例文章 ---------------- */
window.NOTES = [
  {
    slug: 'map-of-a-book',
    title: '把一本书拆成一张可执行的地图',
    category: '读书笔记',
    excerpt: '读书笔记不必复述全书。把作者的论证拆成「问题—证据—行动」，一张纸就能带走一本书。',
    cover: 'assets/img/note-01.svg',
    tags: ['读书笔记', '理解', '方法论'],
    date: '2026-10-28',
    readTime: '6 分钟',
    body: [
      '<p>很多读书笔记的问题不是记得太少，而是记得太像目录。我们习惯于按顺序抄下章节标题，却很少问一句：这本书到底想解决什么问题？</p>',
      '<h2>先找问题，再找答案</h2>',
      '<p>我给自己定了一个很小的规则：读任何一本书，先在扉页写下一句「作者到底在跟什么较劲」。这一句写不出来，就说明还没进入书里。写出来了，后面的论据、案例、反例才有了各自的位置。</p>',
      '<h2>三栏笔记：问题 / 证据 / 行动</h2>',
      '<p>把一页纸分成三栏。左栏放问题，中栏放作者给出的证据，右栏只写一件我明天就能做的小事。右栏是最容易被忽略、也最值钱的一栏——它把「读懂」变成了「可用」。</p>',
      '<blockquote>读懂一本书的标志，不是能复述它，而是能把它用在一个作者没写过的场景里。</blockquote>',
      '<h2>让 AI 做陪练，而不是代笔</h2>',
      '<p>读完一章，我会让模型扮演一个持反对意见的读者，专门挑中栏里的证据漏洞。它常常问出我没想到的反问。但右栏永远由我自己写：行动需要承担责任，而模型不承担。</p>',
      '<p>这套方法不追求完整，只追求能带走。一本书最后留下一张纸、一个改变，就已经足够。</p>',
    ],
  },
  {
    slug: 'first-frame-last-frame',
    title: 'AI 生成的第一帧，和我拍下的最后一帧',
    category: '观察随笔',
    excerpt: '同一场黄昏，一次由提示词生成，一次由快门记录。两者的差别不在画质，而在「我在不在场」。',
    cover: 'assets/img/note-02.svg',
    tags: ['观察随笔', 'AI 生成', '摄影'],
    date: '2026-10-21',
    readTime: '5 分钟',
    body: [
      '<p>那天傍晚我做了个有点较真的实验：先用一句话生成一张「城市黄昏、路灯刚亮、雨后地面反光」的图，然后带着相机下楼，在同一个街区拍下真实的最后一帧光。</p>',
      '<h2>生成图里没有意外</h2>',
      '<p>模型给了一张几乎完美的图：构图稳、色彩漂亮、反光恰到好处。它太符合预期了，以至于我盯着看了很久也没记住什么。完美的反面不是丑，而是没有钩子。</p>',
      '<h2>照片里全是意外</h2>',
      '<p>真实的那张有歪掉的路牌、被风吹糊的树影、一个刚好走过的骑车人。技术参数上它输得彻底，但它带着「我在那里」的证据：我等了十分钟，才等来那束光擦过玻璃幕墙。</p>',
      '<blockquote>生成帮我看见可能性，拍摄帮我确认在场。</blockquote>',
      '<h2>把两者放在同一条工作流里</h2>',
      '<p>现在的习惯是：先用生成图做「视觉预演」，找色调和构图方向；再带着这个方向去现场，允许现实把它推翻。AI 负责拓宽想象，快门负责留下痕迹。</p>',
      '<p>这两帧我都留着。一张提醒我可以要什么，一张提醒我实际得到了什么。</p>',
    ],
  },
  {
    slug: 'a-window-in-the-prompt',
    title: '在提示词里给自己留一扇窗',
    category: 'AI 创作思考',
    excerpt: '把提示词写得越满，结果越像指令的复印件。留出不确定，创作才有呼吸的缝隙。',
    cover: 'assets/img/note-03.svg',
    tags: ['AI 创作思考', '提示词', 'AI 生成'],
    date: '2026-10-14',
    readTime: '7 分钟',
    body: [
      '<p>刚开始用生成工具时，我写提示词像写需求文档：主体、风格、光线、镜头、色彩、排除项，一条不落。结果确实稳定，稳定到连我自己都猜得到下一张长什么样。</p>',
      '<h2>确定性是一种隐形天花板</h2>',
      '<p>当提示词把每个变量都钉死，模型只剩下执行，没有解释。而创作里最有趣的部分，往往来自解释的偏差。后来我试着只保留三类信息：情绪、约束、一个不该出现的词，其余全部交给它。</p>',
      '<h2>留白清单</h2>',
      '<ul><li>写情绪，不写具体物件（「清晨刚醒来的城市」，而不是「有高楼和太阳的街道」）；</li><li>写一条硬约束，比如「不要出现人」，让边界清晰；</li><li>留一个开放位，例如「一个我没提过的细节」，给意外留门。</li></ul>',
      '<blockquote>好的提示词更像邀请，不像工单。</blockquote>',
      '<h2>人的工作转移到了选择</h2>',
      '<p>生成变便宜之后，判断变贵了。一轮出二十张，真正花时间的是挑出那张「说不清为什么但对」的图，并追问自己被什么击中。这个过程没法外包，也不该外包。</p>',
      '<p>所以现在写提示词，我都会故意少写一句。那一句空着的地方，就是留给自己的窗。</p>',
    ],
  },
  {
    slug: 'city-at-night-log',
    title: '城市夜行日志：光是另一种语言',
    category: '视频日志文字版',
    excerpt: '一支三分钟夜拍视频的文字版：关于灯光、反射，以及为什么我总在天黑之后才出门。',
    cover: 'assets/img/note-04.svg',
    tags: ['视频日志文字版', '城市', '摄影'],
    date: '2026-10-06',
    readTime: '4 分钟',
    body: [
      '<p>这是《城市夜行》那支视频的文字版。镜头里没有解说，只有环境声，所以把当时的想法补在这里。</p>',
      '<h2>21:10 / 天桥</h2>',
      '<p>白天的城市是信息，晚上的城市是情绪。灯牌把街道切成一段一段的色块，人走过的时候，颜色会在身上短暂地停一下。</p>',
      '<h2>21:40 / 雨后的路面</h2>',
      '<p>最喜欢拍水洼，因为它把竖着的灯牌横过来放。世界被折了一次，熟悉的招牌突然变得不认识。相机不需要滤镜，只需要蹲低一点。</p>',
      '<blockquote>拍摄不是记录光，是记录光落在什么东西上。</blockquote>',
      '<h2>22:15 / 收工</h2>',
      '<p>回看素材时发现，最满意的一帧是手抖的那半秒。技术上是废片，情绪上却刚好。以后大概还会继续在天黑之后出门。</p>',
    ],
  },
  {
    slug: 'tools-shape-us',
    title: '读《技术物的政治》：工具也在塑造我们',
    category: '读书笔记',
    excerpt: '我们以为自己在用工具，其实也在被工具的默认设置重新安排注意力与判断。',
    cover: 'assets/img/note-05.svg',
    tags: ['读书笔记', 'AI 创作思考', '观察随笔'],
    date: '2026-09-29',
    readTime: '8 分钟',
    body: [
      '<p>这本书最扎人的一句大意是：技术物从来不是中立的，它带着设计者的选择，并把这些选择变成了使用者的常识。</p>',
      '<h2>默认值就是立场</h2>',
      '<p>一个把「续写」放在最顺手位置的编辑器，会让人更愿意顺着写；一个把「重写」放在首位的，会鼓励人推翻自己。功能排序不说话，但它一直在投票。</p>',
      '<h2>把默认设置翻出来看</h2>',
      '<p>读完我给自己做了个小练习：列出每天用的三个 AI 工具，写下它们各自的默认动作、默认语气、默认长度，再标出哪些其实并不符合我的习惯。结果有点尴尬——我一直在适应它们，而不是反过来。</p>',
      '<blockquote>意识到默认值的存在，是拿回主动权的第一步。</blockquote>',
      '<h2>体察，然后调整</h2>',
      '<p>现在会先花十分钟改配置：关掉自动补全、把语气调成中性、把输出长度改成由我指定。改动很小，但写出来的东西重新像自己了。</p>',
      '<p>向外体察不只是看世界，也包括看清自己正被什么悄悄塑造。</p>',
    ],
  },
  {
    slug: 'teach-model-uncertainty',
    title: '让模型学会「不确定」：一次失败的实验',
    category: 'AI 创作思考',
    excerpt: '我想让模型在没把握时说「我不知道」，结果它学会了把每句话都包装得更像不知道。',
    cover: 'assets/img/note-06.svg',
    tags: ['AI 创作思考', '提示词', '实验记录'],
    date: '2026-09-18',
    readTime: '6 分钟',
    body: [
      '<p>起因很小：做读书问答时，模型总把没读过的书也答得头头是道。我想加一层「不确定就别答」的约束。</p>',
      '<h2>第一版：直接要求</h2>',
      '<p>提示词里加一句「不确定时请回答：我没有足够信息」。有效，但只对明显离谱的问题有效；对似是而非的问题，它依然会流畅地编。</p>',
      '<h2>第二版：要求给出置信度</h2>',
      '<p>让它同时输出置信度分数，结果更糟——分数普遍偏高，反而给错误答案盖了个章。数字看起来客观，其实只是把猜测翻译了一遍。</p>',
      '<h2>第三版：换成选择题</h2>',
      '<p>把开放回答改成「有依据 / 部分依据 / 无依据」三选一，并要求无依据时列出缺的那条信息。这一版终于稳了些：结构限制比语气恳求管用得多。</p>',
      '<blockquote>它学到的不是「不确定」，而是「怎样把话说得像不确定」——直到我把输出空间收窄。</blockquote>',
      '<h2>失败留下的东西</h2>',
      '<p>这次实验没有达成最初的目标，但换来一条更实用的经验：与其要求模型拥有某种品质，不如设计一个让那种品质更容易出现的结构。也算是一次「读懂」。</p>',
    ],
  },
];

/* ---------------- 4 个示例视频 ----------------
 * TODO(替换)：videoUrl 全部为占位符，替换成真实视频地址（mp4 或平台嵌入链接） */
window.VIDEOS = [
  {
    slug: 'colorize-old-footage',
    title: '给一段旧影像上色：AI 修复实验',
    cover: 'assets/img/video-01.svg',
    platform: '视频号',
    duration: '03:24',
    date: '2026-10-30',
    featured: true,
    videoUrl: 'REPLACE_VIDEO_URL', // TODO(替换)
    intro: '拿一段十年前的家庭影像做上色与补帧实验，记录哪些细节被模型「合理地想象」了出来，以及我为什么保留了几处明显的瑕疵。',
  },
  {
    slug: 'three-minutes-book-skeleton',
    title: '三分钟读懂一本书的骨架',
    cover: 'assets/img/video-02.svg',
    platform: '视频号',
    duration: '02:58',
    date: '2026-10-24',
    featured: true,
    videoUrl: 'REPLACE_VIDEO_URL', // TODO(替换)
    intro: '把「问题—证据—行动」三栏笔记法拍成一支短片，用一本随手抽到的书现场演示。',
  },
  {
    slug: 'neon-city-walk',
    title: '城市夜行 · 夜拍 log',
    cover: 'assets/img/video-03.svg',
    platform: '视频号',
    duration: '04:12',
    date: '2026-10-06',
    featured: false,
    videoUrl: 'REPLACE_VIDEO_URL', // TODO(替换)
    intro: '无解说环境声，只有天桥、雨后路面和收工时手抖的那半秒。文字版在观测笔记里。',
  },
  {
    slug: 'one-line-storyboard',
    title: '用一句话生成一段分镜',
    cover: 'assets/img/video-04.svg',
    platform: 'B 站',
    duration: '05:06',
    date: '2026-09-26',
    featured: false,
    videoUrl: 'REPLACE_VIDEO_URL', // TODO(替换)
    intro: '从一句情绪描述出发，生成四格分镜，再逐格检查哪些画面是提示词给的、哪些是模型补的。',
  },
];

/* ---------------- 8 张示例图片 ----------------
 * TODO(替换)：src 指向的 SVG 为占位图，替换成真实图片（同名覆盖或改路径） */
window.IMAGES = [
  { id: 'img-01', title: '城市断面 No.01', src: 'assets/img/img-01.svg', tags: ['AI 生成', '视觉实验'], date: '2026-10-27', ratio: 'tall', desc: '以柔和色块与线条构成的一次构图练习。' },
  { id: 'img-02', title: '雨夜反射', src: 'assets/img/img-02.svg', tags: ['摄影', '城市'], date: '2026-10-22', ratio: 'wide', desc: '雨后路面把竖着的灯牌折成了横向的色带。' },
  { id: 'img-03', title: '光谱练习 A', src: 'assets/img/img-03.svg', tags: ['视觉实验', 'AI 生成'], date: '2026-10-19', ratio: 'square', desc: '把几种柔和色压进同一个圆形的试验。' },
  { id: 'img-04', title: '窗外 21:40', src: 'assets/img/img-04.svg', tags: ['摄影', '城市'], date: '2026-10-12', ratio: 'tall', desc: '天桥上等了十分钟，只为了一束擦过玻璃幕墙的光。' },
  { id: 'img-05', title: '线条之城', src: 'assets/img/img-05.svg', tags: ['AI 生成', '视觉实验'], date: '2026-10-08', ratio: 'wide', desc: '用简洁线条勾勒一座不存在的城市天际线。' },
  { id: 'img-06', title: '错位花束', src: 'assets/img/img-06.svg', tags: ['AI 生成', '视觉实验'], date: '2026-10-03', ratio: 'square', desc: '轻微错位带来的层次感，控制在柔和的范围内。' },
  { id: 'img-07', title: '黄昏最后一帧', src: 'assets/img/img-07.svg', tags: ['摄影', '城市'], date: '2026-09-30', ratio: 'tall', desc: '真实拍摄的那一帧，与生成图放在一起做了对照。' },
  { id: 'img-08', title: '留白之间', src: 'assets/img/img-08.svg', tags: ['视觉实验', 'AI 生成'], date: '2026-09-25', ratio: 'wide', desc: '提示词里少写一句之后，模型自己补上的那处细节。' },
];

/* 站点导航（与页脚复用） */
window.NAV = [
  { label: '首页', href: 'index.html' },
  { label: '观测笔记', href: 'notes.html' },
  { label: '影像', href: 'gallery.html' },
  { label: '视频', href: 'videos.html' },
  { label: '关于', href: 'about.html' },
  { label: '连接', href: 'connect.html' },
];
