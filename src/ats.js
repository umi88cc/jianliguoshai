// 简历过筛 ResumePass — 确定性 ATS 评分引擎（不调 AI，纯规则，毫秒级）
// 公式：S = clamp(0, 100, Σ w_i × d_i + Q)
// 权重（中文版）：d1 格式 .15 / d2 关键词 .35 / d3 完整度 .15 / d4 经历 .15 / d5 教育 .05 / d6 量化 .15
// 无 JD 时 d2 不计入，其余 5 项按权重归一化（和仍为 1.00）；页数 >2 只在 d1 扣一次，Q 里不重复扣。

const WEIGHTS = { d1: 0.15, d2: 0.35, d3: 0.15, d4: 0.15, d5: 0.05, d6: 0.15 };

const STOPWORDS = new Set([
  '的', '了', '和', '与', '及', '等', '对', '为', '在', '有', '是', '负责', '团队', '沟通', '能力',
  '经验', '相关', '熟悉', '了解', '掌握', '熟练', '精通', '优先', '加分', '要求', '岗位', '工作',
  '公司', '我们', '你', '您', '以及', '或者', '并', '以上', '以下', '包括', '进行', '通过',
  '具备', '良好', '较强', '一定', '一年', '两年', '三年', '本科', '以上学历',
  'the', 'and', 'or', 'of', 'to', 'in', 'for', 'with', 'you', 'your', 'our', 'are', 'will',
  'this', 'that', 'have', 'has', 'from', 'years', 'year', 'experience', 'work', 'team', 'skills',
  'ability', 'good', 'strong', 'plus', 'preferred', 'required', 'job', 'role',
]);

// 常见技能/工具/岗位词表（JD 关键词抽取用；命中即计入，不在表里的词靠高频双字词补）
const VOCAB = [
  'Python', 'Java', 'JavaScript', 'TypeScript', 'Go', 'Golang', 'C++', 'C#', 'PHP', 'Ruby', 'Rust',
  'SQL', 'MySQL', 'PostgreSQL', 'Redis', 'MongoDB', 'Elasticsearch', 'Kafka', 'RabbitMQ',
  'React', 'Vue', 'Angular', 'Node.js', 'Spring', 'Spring Boot', 'Django', 'Flask', 'Laravel',
  'Docker', 'Kubernetes', 'K8s', 'Jenkins', 'Git', 'Linux', 'Nginx', 'AWS', '阿里云', '腾讯云',
  'HTML', 'CSS', 'HTML5', 'CSS3', 'Sass', 'Less', 'Webpack', 'Vite',
  'Spark', 'Hadoop', 'Hive', 'Flink', 'Airflow', 'Tableau', 'Power BI', 'Excel', 'PPT',
  'Figma', 'Sketch', 'Axure', 'Photoshop', 'PS', 'AI', 'AIGC', 'LLM', '大模型', '机器学习',
  '深度学习', 'NLP', '自然语言处理', '计算机视觉', 'CV', '数据挖掘', '数据分析', '数据仓库',
  'ETL', 'BI', 'AB测试', 'AB Test', '增长黑客', '用户增长', '拉新', '留存', '转化率', 'GMV', 'DAU', 'MAU',
  'SEO', 'SEM', '投放', '信息流', '私域', '社群运营', '内容运营', '新媒体', '短视频', '直播',
  '产品经理', 'PM', '项目经理', '运营', '市场营销', '销售', '客服', '人事', 'HR', '行政', '财务', '会计', '出纳', '法务',
  '前端', '后端', '全栈', '测试', 'QA', '运维', 'DBA', '架构师', '算法工程师', '数据工程师', '安全工程师',
  'UI设计', 'UX设计', '视觉设计', '平面设计', '交互设计', '工业设计',
  '供应链', '采购', '物流', '仓储', '风控', '合规', '审计', '投融资', '证券', '银行', '保险', '基金',
  'CPA', 'CFA', 'PMP', '英语六级', 'CET-6', 'CET-4', '雅思', '托福', '普通话',
  'Jira', 'Confluence', 'Notion', '飞书', '钉钉', '企业微信', 'CRM', 'ERP', 'SAP', 'Salesforce',
  '微服务', '分布式', '高并发', '缓存', '消息队列', 'CI/CD', 'DevOps', '敏捷开发', 'Scrum',
  'Axure', '墨刀', '蓝湖', '即时设计', 'MasterGo',
];

// 真同义词（算 0.8 折的部分命中）；SQL 与 MySQL/PostgreSQL 不等同，分开标
const SYNONYMS = {
  'js': 'javascript', 'ts': 'typescript', 'h5': 'html5', 'vue.js': 'vue', 'react.js': 'react',
  'k8s': 'kubernetes', 'golang': 'go', 'pb': 'power bi', 'ps': 'photoshop',
  '数据挖掘': '数据分析', '用户运营': '运营', '内容运营': '运营', '新媒体运营': '运营',
};

const CN_VERBS = [
  '负责', '主导', '推动', '优化', '搭建', '提升', '实现', '完成', '设计', '开发', '管理',
  '协调', '策划', '执行', '落地', '带领', '建立', '改进', '降低', '提高', '增长', '拓展',
  '维护', '分析', '调研', '制定', '组织', '培训', '审核', '跟进', '解决', '支持', '参与',
  '协助', '打造', '开拓', '运营', '统筹', '规划', '编写', '撰写', '输出', '沉淀', '复盘',
  '引入', '推广', '孵化', '操盘', '对接', '整合', '梳理', '重构', '升级', '迭代', '交付',
];
const EN_VERBS = [
  'led', 'built', 'managed', 'improved', 'designed', 'developed', 'created', 'delivered',
  'increased', 'reduced', 'optimized', 'launched', 'drove', 'owned', 'coordinated', 'implemented',
  'established', 'achieved', 'grew', 'scaled', 'automated', 'streamlined', 'mentored', 'analyzed',
];

const SECTION_HEADERS = [
  '工作经历', '项目经历', '教育背景', '教育经历', '专业技能', '技能', '技能特长', '证书', '证书与奖项',
  '自我评价', '个人总结', '个人评价', '实习经历', '校园经历', '获奖', '获奖经历', '语言能力', '语言',
  '求职意向', '期望岗位', '工作经验', '项目经验', '实践经历', '科研经历', '培训经历',
];

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function isCJK(ch) { return /[\u4e00-\u9fa5]/.test(ch); }

// ---------- 简历解析 ----------
export function parseResume(text) {
  const raw = (text || '').replace(/\r\n/g, '\n').trim();
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  const charCount = raw.replace(/\s/g, '').length;

  const phone = (raw.match(/1[3-9]\d{9}/) || [])[0] || '';
  const email = (raw.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) || [])[0] || '';
  const name = lines.length > 0 && lines[0].length <= 12 && !/经历|背景|技能|简历|RESUME|CV/i.test(lines[0])
    ? lines[0].replace(/^(姓名[：:]\s*)?/, '')
    : '';

  // 章节切分
  const sections = {};
  let current = 'other';
  const sectionLines = { other: [] };
  for (const line of lines) {
    const header = SECTION_HEADERS.find((h) => line === h || line === h + '：' || line === h + ':' || line.startsWith(h + ' ') || line.startsWith(h + '：'));
    if (header) { current = header; sectionLines[current] = sectionLines[current] || []; continue; }
    (sectionLines[current] = sectionLines[current] || []).push(line);
  }
  for (const [k, v] of Object.entries(sectionLines)) sections[k] = v;

  const expLines = [
    ...(sectionLines['工作经历'] || []), ...(sectionLines['工作经验'] || []),
    ...(sectionLines['项目经历'] || []), ...(sectionLines['项目经验'] || []),
    ...(sectionLines['实习经历'] || []), ...(sectionLines['实践经历'] || []),
  ];
  const eduLines = [...(sectionLines['教育背景'] || []), ...(sectionLines['教育经历'] || [])];
  const skillLines = [...(sectionLines['技能'] || []), ...(sectionLines['专业技能'] || []), ...(sectionLines['技能特长'] || [])];

  // bullet：以 • - * · ○ 数字. 开头，或经历区内的非空行
  // 注意：数字序号只认 1-2 位（1. / 12.），4 位年份开头的日期行（2018.09-2022.06）不是 bullet
  const bulletRe = /^([•\-*·○●■▶►]|\d{1,2}[.、）)]|（\d+）)\s*/;
  const bullets = [];
  for (const line of lines) {
    if (bulletRe.test(line)) bullets.push(line.replace(bulletRe, ''));
  }
  if (bullets.length === 0) {
    for (const line of expLines) if (line.length > 8) bullets.push(line);
  }
  if (bullets.length === 0) {
    for (const line of lines) if (line.length > 12 && !SECTION_HEADERS.includes(line)) bullets.push(line);
  }

  // 教育四项
  const eduText = eduLines.join(' ') + ' ' + raw.slice(0, 600);
  const degree = /(博士|硕士|研究生|本科|学士|大专|专科|高中|中专)/.exec(eduText)?.[1] || '';
  const hasSchool = /(大学|学院|学校|University|College)/.test(eduText);
  const hasMajor = /(专业[：:]\s*\S+|主修[：:]\s*\S+|[\u4e00-\u9fa5]{2,6}(工程|科学|技术|管理|学|设计|经济|金融|法律|医学|文学|教育))/ .test(eduText);
  const gradTime = /\d{4}[./年-]\d{1,2}/.test(eduText);

  // 格式信号
  const specialChars = (raw.match(/[^\u4e00-\u9fa5A-Za-z0-9\s.,;:：；，。、%％\-–—()（）/\\]/g) || []).length;
  const specialRatio = charCount ? specialChars / charCount : 0;
  const upperLines = lines.filter((l) => /^[A-Z\s]{6,}$/.test(l)).length;
  const bulletSymbols = new Set(lines.map((l) => (l.match(/^([•\-*·○●■▶►])/) || [])[1]).filter(Boolean)).size;
  const dateMatches = raw.match(/\d{4}[./年-]\d{1,2}/g) || [];
  const badDates = (raw.match(/\d{4}[./年]\d{1,2}[./月]?\s*[-–—~至]\s*(\d{4}[./年]\d{1,2}|\S{0,4})/g) || []).length;
  const nonStdHeaders = lines.filter((l) => l.length <= 8 && /^(.*)(经历|背景|技能|情况|介绍)$/.test(l) && !SECTION_HEADERS.includes(l)).length;

  return {
    raw, lines, charCount, phone, email, name,
    sections: Object.keys(sectionLines).filter((k) => k !== 'other'),
    expLines, eduLines, skillLines, bullets,
    degree, hasSchool, hasMajor, gradTime,
    specialRatio, upperLines, bulletSymbols, dateCount: dateMatches.length,
    badDateCount: Math.max(0, (raw.match(/\d{2,4}[./-]\d{1,2}[./-]\d{1,2}/g) || []).length - dateMatches.length),
    nonStdHeaders,
    hasWork: expLines.length > 0, hasEdu: eduLines.length > 0 || !!degree,
    hasSkills: skillLines.length > 0,
  };
}

// ---------- JD 关键词抽取 ----------
export function extractKeywords(jdText) {
  const jd = (jdText || '').trim();
  if (!jd) return [];
  const lower = jd.toLowerCase();

  // 分段定 Tier：任职要求/必须段 Tier 1；优先/加分段 Tier 2；其余按频次
  // 按段落标题切片（跨行取整段），不是按单行取
  const sectionSlice = (startRe, endRe, maxLen = 2000) => {
    const m = jd.match(startRe);
    if (!m) return '';
    let rest = jd.slice(m.index, m.index + maxLen);
    const end = rest.search(endRe);
    if (end > 0) rest = rest.slice(0, end);
    return rest;
  };
  const tier1Text = sectionSlice(/(任职要求|任职资格|必须|必备|required|must have|requirements?)/i, /(优先|加分|preferred|nice to have|plus|岗位职责|工作内容|公司介绍|福利待遇)/i);
  const tier2Text = sectionSlice(/(优先|加分|preferred|nice to have|plus)/i, /(岗位职责|工作内容|公司介绍|福利待遇)/i);
  const tier1Lower = tier1Text.toLowerCase();
  const tier2Lower = tier2Text.toLowerCase();

  const found = new Map(); // term(lower) -> {term, freq, tier}
  const addTerm = (term, tier) => {
    if (!term || term.length < 2) return;
    if (STOPWORDS.has(term.toLowerCase())) return;
    const key = term.toLowerCase();
    const cur = found.get(key);
    if (cur) { cur.freq += 1; cur.tier = Math.min(cur.tier, tier); }
    else found.set(key, { term, freq: 1, tier });
  };

  // 词表命中
  for (const v of VOCAB) {
    const idx = lower.indexOf(v.toLowerCase());
    if (idx === -1) continue;
    const re = new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const count = (lower.match(re) || []).length;
    const tier = tier1Lower.includes(v.toLowerCase()) ? 1
      : tier2Lower.includes(v.toLowerCase()) ? 2 : 3;
    for (let i = 0; i < count; i++) addTerm(v, tier);
  }

  // 英文单词（3+ 字母，含 + # . /）
  for (const m of lower.matchAll(/[a-z][a-z0-9+#./-]{2,}/g)) {
    const w = m[0].replace(/[./-]+$/, '');
    if (w.length < 3 || STOPWORDS.has(w)) continue;
    const tier = tier1Lower.includes(w) ? 1 : tier2Lower.includes(w) ? 2 : 3;
    addTerm(m[0], tier);
  }

  // 中文高频双字词（出现 ≥2 次的 2 字词，补词表外的领域词）
  // 过滤噪声：含单字停用词（者/的/了…）的不要；落在词表词中间位置（非词首）的不要（如“品经”⊂产品经理）
  const singleStop = new Set(['者', '的', '了', '和', '与', '及', '等', '对', '为', '在', '有', '是', '个', '以', '或', '并']);
  const vocabLower = VOCAB.map((v) => v.toLowerCase());
  const isMidVocab = (bg) => vocabLower.some((v) => { const i = v.indexOf(bg); return i > 0; });
  const cjkRuns = jd.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  const bigramCount = new Map();
  const bigramBoundary = new Map();
  for (const run of cjkRuns) {
    for (let i = 0; i + 2 <= run.length; i++) {
      const bg = run.slice(i, i + 2);
      if (STOPWORDS.has(bg)) continue;
      if (singleStop.has(bg[0]) || singleStop.has(bg[1])) continue;
      if (isMidVocab(bg)) continue;
      bigramCount.set(bg, (bigramCount.get(bg) || 0) + 1);
      // 词界出现：位于 CJK 连续段的首尾（前后是非中文字符），排除“长方”这类跨词拼接
      if (i === 0 || i + 2 === run.length) bigramBoundary.set(bg, (bigramBoundary.get(bg) || 0) + 1);
    }
  }
  for (const [bg, c] of bigramCount) {
    if (c >= 2 && (bigramBoundary.get(bg) || 0) >= 1 && !found.has(bg)) {
      const tier = tier1Text.includes(bg) ? 1 : tier2Text.includes(bg) ? 2 : 3;
      found.set(bg, { term: bg, freq: c, tier });
    }
  }

  // Tier 3 但频次 ≥2 的升 Tier 3 不变；去重后按 tier + freq 排序
  return [...found.values()]
    .filter((k) => k.freq >= 1 && k.term.length >= 2)
    .sort((a, b) => a.tier - b.tier || b.freq - a.freq)
    .slice(0, 60);
}

// ---------- 评分 ----------
export function scoreResume(resumeText, jdText, lang = 'zh') {
  const r = parseResume(resumeText);
  const keywords = extractKeywords(jdText);
  const hasJD = keywords.length > 0;
  const resumeLower = r.raw.toLowerCase();
  const norm = (s) => s.toLowerCase().replace(/\s+/g, '');

  // ---- d1 格式（100 起扣；粘贴版无法检测版式：多栏/表格/图片三项跳过并提示）----
  let d1 = 100;
  const d1Notes = [];
  if (r.charCount > 1500) { d1 -= 5; d1Notes.push('页数超过 2 页（按字数估算），扣 5 分'); }
  if (r.charCount < 150) { d1 -= 10; d1Notes.push('总字数不足 150 字，扣 10 分'); }
  if (r.charCount > 1500) { d1 -= 3; d1Notes.push('总字数超过 1500 字，扣 3 分'); }
  if (r.specialRatio > 0.05) { d1 -= 8; d1Notes.push('特殊字符占比超过 5%，扣 8 分'); }
  if (r.upperLines > 3) { d1 -= 3; d1Notes.push('全大写行超过 3 行，扣 3 分'); }
  if (r.bulletSymbols > 2) { d1 -= 2; d1Notes.push('bullet 符号超过 2 种，扣 2 分'); }
  d1 = clamp(d1, 0, 100);

  // ---- d2 关键词 ----
  let d2 = 100; let matched = []; let partial = []; let missing = [];
  if (hasJD) {
    for (const k of keywords) {
      const t = k.term.toLowerCase();
      const inResume = resumeLower.includes(t);
      const syn = SYNONYMS[t];
      const partialHit = !inResume && syn && resumeLower.includes(syn);
      const subHit = !inResume && !partialHit && r.bullets.some((b) => norm(b).includes(t.replace(/\s/g, '')) && t.length >= 3);
      if (inResume) matched.push(k);
      else if (partialHit || subHit) partial.push(k);
      else missing.push(k);
    }
    d2 = Math.min(100, Math.round(((matched.length + 0.8 * partial.length) / keywords.length) * 100));
  }

  // ---- d3 章节完整度（100 起扣）----
  let d3 = 100;
  const d3Notes = [];
  const miss = (label, pts) => { d3 -= pts; d3Notes.push(`缺${label}，扣 ${pts} 分`); };
  if (!r.name) miss('姓名', 20);
  if (!r.phone) miss('电话', 20);
  if (!r.hasWork) miss('工作/项目经历', 20);
  if (!r.email) miss('邮箱', 15);
  if (!r.hasEdu) miss('教育背景', 15);
  if (!r.hasSkills) miss('技能', 10);
  const dateBad = r.badDateCount;
  if (dateBad > 0) { const p = Math.min(15, dateBad * 3); d3 -= p; d3Notes.push(`日期格式不规范 ${dateBad} 处，扣 ${p} 分`); }
  d3 = clamp(d3, 0, 100);

  // ---- d4 经历相关性：动词开头 40% + JD 词命中 35% + 最近经历 25% ----
  const verbs = lang === 'en' ? EN_VERBS : CN_VERBS;
  const totalBullets = r.bullets.length;
  let verbPct = 0; let jdHitPct = 0; let recentPct = 0;
  if (totalBullets > 0) {
    const verbCount = r.bullets.filter((b) => {
      const s = b.trim();
      if (lang === 'en') return verbs.some((v) => s.toLowerCase().startsWith(v));
      return verbs.some((v) => s.startsWith(v));
    }).length;
    verbPct = (verbCount / totalBullets) * 100;
    if (hasJD) {
      const jdTerms = keywords.map((k) => k.term.toLowerCase());
      const hitCount = r.bullets.filter((b) => jdTerms.some((t) => b.toLowerCase().includes(t))).length;
      jdHitPct = (hitCount / totalBullets) * 100;
    }
    // 最近一份工作：经历区前 1/3 行的字符占比，30% 为满分线
    const expChars = r.expLines.join('').length || r.bullets.join('').length;
    const recentChars = r.expLines.slice(0, Math.max(1, Math.ceil(r.expLines.length / 3))).join('').length;
    const recentRatio = expChars ? recentChars / expChars : 0;
    recentPct = Math.min(100, (recentRatio / 0.3) * 100);
  }
  let d4;
  if (hasJD) d4 = Math.round(0.4 * verbPct + 0.35 * jdHitPct + 0.25 * recentPct);
  else d4 = totalBullets > 0 ? Math.round((0.4 * verbPct + 0.25 * recentPct) / 0.65) : 0;
  d4 = clamp(d4, 0, 100);

  // ---- d5 教育：学历 40 / 学校 20 / 专业 20 / 毕业时间 20 ----
  let d5 = 0;
  const d5Parts = [];
  if (r.degree) { d5 += 40; d5Parts.push('学历 40'); }
  if (r.hasSchool) { d5 += 20; d5Parts.push('学校 20'); }
  if (r.hasMajor) { d5 += 20; d5Parts.push('专业 20'); }
  if (r.gradTime) { d5 += 20; d5Parts.push('毕业时间 20'); }

  // ---- d6 量化：含数字 bullet / 总 bullet ----
  let d6 = 0;
  if (totalBullets > 0) {
    const numCount = r.bullets.filter((b) => /[0-9]/.test(b) && /(%|％|万|元|人|个|倍|\+|提升|增长|降低|减少|节省|缩短)/.test(b)).length;
    const anyNum = r.bullets.filter((b) => /\d/.test(b)).length;
    d6 = Math.floor((Math.max(numCount, Math.floor(anyNum * 0.5)) / totalBullets) * 100);
  }

  // ---- Q 怪癖扣分（页数 >2 只在 d1 扣一次，Q 里不重复扣）----
  let Q = 0;
  const qNotes = [];
  if (r.nonStdHeaders > 2) { Q -= 5; qNotes.push('非标准标题超过 2 个，扣 5 分'); }
  if (hasJD) {
    const jdSkillCount = keywords.filter((k) => matched.includes(k)).length;
    if (jdSkillCount < 5) { Q -= 10; qNotes.push('JD 相关技能命中不足 5 个，扣 10 分'); }
  }
  const missingSections = ['姓名', '电话', '工作/项目经历', '邮箱', '教育背景', '技能'].filter((_, i) =>
    [!r.name, !r.phone, !r.hasWork, !r.email, !r.hasEdu, !r.hasSkills][i]).length;
  if (missingSections > 1) { Q -= 8; qNotes.push(`缺 ${missingSections} 个必填章节，扣 8 分`); }

  // ---- 总分 ----
  const dims = { d1, d2: hasJD ? d2 : null, d3, d4, d5, d6 };
  let total;
  if (hasJD) {
    total = WEIGHTS.d1 * d1 + WEIGHTS.d2 * d2 + WEIGHTS.d3 * d3 + WEIGHTS.d4 * d4 + WEIGHTS.d5 * d5 + WEIGHTS.d6 * d6 + Q;
  } else {
    const wSum = WEIGHTS.d1 + WEIGHTS.d3 + WEIGHTS.d4 + WEIGHTS.d5 + WEIGHTS.d6; // 0.65
    total = (WEIGHTS.d1 * d1 + WEIGHTS.d3 * d3 + WEIGHTS.d4 * d4 + WEIGHTS.d5 * d5 + WEIGHTS.d6 * d6) / wSum + Q;
  }
  total = clamp(Math.round(total), 0, 100);
  const band = total >= 85 ? 'excellent' : total >= 70 ? 'good' : 'weak';

  // ---- 逐行点评 ----
  const lineReview = r.bullets.slice(0, 30).map((b) => {
    const checks = [];
    const s = b.trim();
    const startsVerb = lang === 'en'
      ? EN_VERBS.some((v) => s.toLowerCase().startsWith(v))
      : CN_VERBS.some((v) => s.startsWith(v));
    checks.push({ key: 'verb', ok: startsVerb, msg: startsVerb ? '动词开头' : '建议用动词开头（负责/主导/推动…）' });
    const hasNum = /\d/.test(s);
    checks.push({ key: 'number', ok: hasNum, msg: hasNum ? '含有数字' : '建议加上量化成果（人数/金额/提升幅度）' });
    if (hasJD) {
      const hasJd = keywords.some((k) => s.toLowerCase().includes(k.term.toLowerCase()));
      checks.push({ key: 'jd', ok: hasJd, msg: hasJd ? '命中 JD 关键词' : '未命中 JD 关键词' });
    }
    if (s.length > 60) checks.push({ key: 'long', ok: false, msg: '超过 60 字，建议拆成两条' });
    return { text: s.length > 80 ? s.slice(0, 80) + '…' : s, checks };
  });

  return {
    total, band,
    dims: { d1, d2: hasJD ? d2 : null, d3, d4, d5, d6 },
    weights: hasJD ? { ...WEIGHTS } : { d1: 0.15 / 0.65, d3: 0.15 / 0.65, d4: 0.15 / 0.65, d5: 0.05 / 0.65, d6: 0.15 / 0.65 },
    hasJD,
    qDeduction: Q,
    notes: { d1: d1Notes, d3: d3Notes, q: qNotes, d5Parts },
    gaps: {
      matched: matched.map((k) => ({ term: k.term, tier: k.tier })),
      partial: partial.map((k) => ({ term: k.term, tier: k.tier })),
      missing: missing.map((k) => ({ term: k.term, tier: k.tier })),
    },
    keywordCount: keywords.length,
    lineReview,
    parsed: {
      name: r.name, phone: !!r.phone, email: !!r.email, charCount: r.charCount,
      bullets: totalBullets, degree: r.degree,
    },
    pasteNote: '粘贴版无法检测版式（多栏/表格/图片），上传 PDF/Word 原文件后可检测',
  };
}
