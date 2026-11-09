// 简历过筛 — AI 改写引擎（第 2 周，规划 §3.4 / §3.5 / §17）
// 铁律：绝不编造。公司名、职位、时间、数字不许凭空变，没有的就不写；
// 缺数字用 [待补充：___] 占位。改写前后做防编造检查（数字/公司/时间三项比对），
// 变了就拦截并标注、保留原文。改写强度只影响措辞力度，不影响事实。
// AI 不可用时走确定性规则改写（动词强化 + JD 用词对齐 + 总结模板），
// 标记 source:'rules'，保证闭环不断；AI 通时标记 source:'ai'。
import { parseResume, extractKeywords, scoreResume} from './ats.js';
import { callChatModel, getRules} from './ai.js';

const BULLET_RE = /^([•\-*·○●■▶►]|\d{1,2}[.、）)]|（\d+）)\s*/; // 数字序号只认 1-2 位，年份日期行（2018.09-…）不是 bullet

// 敬称/泛指的“公司”不是真实雇主名，不参与编造检查（如求职信里必写的“贵公司”）
// 注意：只排除整词或以敬称结尾的词（如“我关注到贵公司”），
// 不排除以“贵”开头的真实公司名（如“贵州茅台集团”）
const HONORIFIC_COMPANIES = new Set([
'贵公司', '贵集团', '贵司', '贵单位', '贵校', '贵院',
'我公司', '本公司', '我司', '贵方', '我方',
]);
function isHonorificCompany(name) {
return [...HONORIFIC_COMPANIES].some((h) => name === h || String(name || '').endsWith(h));
}

// ---------- 事实抽取（防编造检查用） ----------
export function extractFacts(text) {
const t = String(text || '');
// 日期：YYYY.MM / YYYY年MM月 / YYYY-MM，归一化成 YYYYMM，同时记年份 YYYY；
// 裸年份 YYYY年、年份区间 YYYY-YYYY 也只记年份，不记数字。
// 月份必须 1-12，否则不是日期（如年份区间 2022-2025 里的“20”）。
const dates = new Set();
for (const m of t.matchAll(/(\d{4})[./年-](\d{1,2})/g)) {
const mo = Number(m[2]);
if (mo < 1 || mo > 12) continue;
dates.add(`${m[1]}${String(mo).padStart(2, '0')}`);
dates.add(m[1]);
}
for (const m of t.matchAll(/(\d{4})年/g)) dates.add(m[1]);
for (const m of t.matchAll(/(\d{4})\s*[-–—~至]\s*(\d{4})/g)) {
dates.add(m[1]);
dates.add(m[2]);
}
// 数字：归一化（去逗号/空格，％→%，万/元/人等单位保留在数值串里比对时去掉单位只比数字本身）
// 日期的一部分不算数字：YYYY.MM 整体、YYYY年MM月 / YYYY-MM 的年和月、
// 裸年份 YYYY年、年份区间 YYYY-YYYY 的两端——这些都在 dates 里比对，
// 否则简历写 2023.07、信里写 2023年7月会被拆成 2023 和 7 双双判违规。
const numbers = new Set();
for (const m of t.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(?:%|％|万|元|人|个|倍|k|K|w|亿)?/g)) {
const n = m[1].replace(/,/g, '');
if (!n) continue;
const start = m.index;
const end = start + m[1].length;
const before = t.slice(Math.max(0, start - 8), start);
const after = t.slice(end, end + 5).trimStart();
if (/^\d{4}\.\d{1,2}$/.test(n)) {
const mo = Number(n.split('.')[1]);
if (mo >= 1 && mo <= 12) continue; // YYYY.MM 日期整体
}
if (/^(?:19|20)\d{2}$/.test(n)) {
// 年份：后面跟 年 / 分隔符+月份数字，或前面是 年份+分隔符（区间后段）
if (/^年/.test(after) || /^[./–—~至-]+\s*\d/.test(after)) continue;
if (/(?:19|20)\d{2}\s*[./年–—~至-]+\s*$/.test(before)) continue;
}
if (/^\d{1,2}$/.test(n) && /(?:19|20)\d{2}\s*[./年-]\s*$/.test(before)) continue; // 月份
numbers.add(n);
}
// 公司：含组织后缀的词 + 经历区“日期段 + 公司名”表头的公司名（如“2022.07-至今 字节跳动 高级产品经理”）
const companies = new Set();
for (const m of t.matchAll(/[\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9·]{1,15}(公司|科技|集团|有限公司|工作室|银行|证券|大学|学院|医院|事务所)/g)) {
if (isHonorificCompany(m[0])) continue;
companies.add(m[0]);
}
for (const line of t.split('\n')) {
const m = line.match(/^\s*\d{4}[./年-]\d{1,2}\s*[-–—~至]\s*(?:\d{4}[./年-]\d{1,2}|至今|现在|目前)?\s+([^\s，,。；;]{2,20})/);
if (m) {
const c = m[1].replace(/(高级|资深|初级|产品经理|工程师|主管|经理|总监|实习生|助理).*$/, '').trim();
if (c && !isHonorificCompany(c)) companies.add(c);
}
}
return { numbers, companies, dates};
}

function stripPlaceholders(text) {
// [待补充：___] / [X] 占位符里的内容不参与编造检查
return String(text || '').replace(/\[[^\]]*\]/g, '');
}

// 防编造检查：改写文本里的数字/公司/日期必须在原文里出现过
// 返回 { ok, violations: [{type, value}]}
export function checkFabrication(originalText, rewrittenText) {
const orig = extractFacts(originalText);
const rw = extractFacts(stripPlaceholders(rewrittenText));
const violations = [];
for (const n of rw.numbers) {
if (!orig.numbers.has(n)) violations.push({ type: 'number', value: n});
}
for (const c of rw.companies) {
if (isHonorificCompany(c)) continue;
if (!orig.companies.has(c) &&!String(originalText).includes(c)) {
violations.push({ type: 'company', value: c});
}
}
for (const d of rw.dates) {
if (!orig.dates.has(d)) violations.push({ type: 'date', value: d});
}
return { ok: violations.length === 0, violations};
}

// 求职信专用防编造检查：白名单是 简历 + JD + 目标公司名 三者并集。
// 求职信提示词明确要求结合 JD 和公司名写：JD 里的数字（如“3 年以上”）和公司名
// 本来就是合法事实，不能按改写的“只认简历原文”判编造。
// 公司名允许加组织后缀的形态（如白名单是“字节跳动”，信里写“字节跳动有限公司”）。
// 底线不变：三者之外的公司、数字、日期照样拦截。
export function checkCoverLetterFabrication(resumeText, jdText, company, letter) {
const sources = [resumeText, jdText, company].filter(Boolean).join('\n');
const orig = extractFacts(sources);
const companyName = String(company || '').trim();
if (companyName) orig.companies.add(companyName);
const rw = extractFacts(stripPlaceholders(letter));
const violations = [];
for (const n of rw.numbers) {
if (!orig.numbers.has(n)) violations.push({ type: 'number', value: n});
}
for (const c of rw.companies) {
if (isHonorificCompany(c)) continue;
if (orig.companies.has(c)) continue;
if (sources.includes(c)) continue;
if ([...orig.companies].some((oc) => c.includes(oc) || oc.includes(c))) continue;
violations.push({ type: 'company', value: c});
}
for (const d of rw.dates) {
if (!orig.dates.has(d)) violations.push({ type: 'date', value: d});
}
return { ok: violations.length === 0, violations};
}

export function detectTextLang(text) {
const t = String(text || '');
const cjk = (t.match(/[\u4e00-\u9fa5]/g) || []).length;
const total = t.replace(/\s/g, '').length || 1;
return cjk / total > 0.3? 'zh': 'en';
}

// ---------- 确定性改写（AI 不可用时的兜底 + 免费试看） ----------
const CN_VERB_UPGRADE = [
[/^负责/, '主导'],
[/^参与/, '参与并推动'],
[/^协助/, '协同推进'],
[/^做/, '完成'],
];
const EN_VERB_UPGRADE = [
[/^helped/i, 'Supported'],
[/^worked on/i, 'Delivered'],
[/^responsible for/i, 'Owned'],
];

// JD 用词对齐：bullet 里有同义/部分事实时，换成 JD 原词（只换词，不加新事实）
const TERM_SWAP = {
'数据挖掘': ['数据分析', '数据', '挖掘'],
'用户增长': ['拉新', '增长', '用户'],
'AB测试': ['AB Test', 'AB', '测试'],
'转化率': ['转化', '下单率', '点击率'],
'数据分析': ['数据挖掘', '数据', '分析'],
};

export function deterministicRewrite(resumeText, jdText, lang = 'zh', intensity = 'standard') {
const parsed = parseResume(resumeText);
const keywords = extractKeywords(jdText);
const missing = [];
const resumeLower = resumeText.toLowerCase();
for (const k of keywords) {
if (!resumeLower.includes(k.term.toLowerCase())) missing.push(k.term);
}
const bullets = [];
for (const b of parsed.bullets.slice(0, 12)) {
let rw = b.trim();
const reasons = [];
// 1) 动词强化
const upgrades = lang === 'en'? EN_VERB_UPGRADE: CN_VERB_UPGRADE;
for (const [re, rep] of upgrades) {
if (re.test(rw)) { rw = rw.replace(re, rep); reasons.push(lang === 'en'? 'Stronger action verb': '动词强化'); break;}
}
// 2) JD 用词对齐（只在 bullet 已有相关事实时换词）
if (lang === 'zh') {
for (const [jdTerm, synonyms] of Object.entries(TERM_SWAP)) {
if (keywords.some((k) => k.term === jdTerm) &&!rw.includes(jdTerm)) {
const syn = synonyms.find((s) => s!== jdTerm && rw.includes(s));
if (syn) { rw = rw.replace(syn, jdTerm); reasons.push(`对齐 JD 用词：${jdTerm}`);}
}
}
}
// 3) 激进档：过长 bullet 拆短（只截断表述，不删事实）
if (intensity === 'aggressive' && rw.length > 60) {
const cut = rw.lastIndexOf('，', 60);
if (cut > 30) { rw = rw.slice(0, cut) + '。'; reasons.push('过长 bullet 精简');}
}
bullets.push({
original: b.trim(),
rewritten: rw,
change_reason: reasons.length? reasons.join('；'): (lang === 'en'? 'Already well written': '已符合规范，未改动'),
flagged: false,
});
}
// 总结：模板生成（只用原文事实）
const name = parsed.name || '';
const topBullet = parsed.bullets.find((x) => /\d/.test(x)) || parsed.bullets[0] || '';
const skills = parsed.skillLines.join('、').slice(0, 60);
const summary = lang === 'en'
? `${name? `${name} — `: ''}${topBullet? `proven track record: ${topBullet.slice(0, 120)}`: 'Experienced professional'}${skills? ` Core skills: ${skills}.`: ''}`
: `${name? `${name}，`: ''}${parsed.degree? `${parsed.degree}学历，`: ''}${topBullet? `代表经历：${topBullet.slice(0, 80)}。`: ''}${skills? `核心技能：${skills}。`: ''}`;
const scoreTips = [];
if (parsed.bullets.filter((x) =>!/\d/.test(x)).length > 0) {
scoreTips.push(lang === 'en'? 'Add numbers to bullets without metrics to raise the quantification score.': '没有数字的 bullet 建议补上量化成果，可提升量化分数。');
}
if (missing.length > 0) {
scoreTips.push(lang === 'en'
? `Missing JD keywords: ${missing.slice(0, 5).join(', ')}. Add them only where you have real experience.`
: `缺失的 JD 关键词：${missing.slice(0, 5).join('、')}。只在你真实做过的地方补，不要硬贴。`);
}
return {
source: 'rules',
summary: summary.slice(0, 300),
bullets,
missing_keywords: missing.slice(0, 10),
score_tips: scoreTips,
note: lang === 'en'
? 'AI model is not configured yet — this is a rule-based rewrite. Results improve once the owner adds an AI key.'
: 'AI 模型尚未配置，本次为规则改写；站长补好 Key 后改写效果会更好。',
};
}

// ---------- AI 改写 ----------
function buildUserPrompt({ resumeText, jdText, lang, intensity}) {
const jobTitle = (jdText.split('\n').find((l) => l.trim()) || '').trim().slice(0, 60);
const intensityNote = lang === 'en'
? { conservative: 'Conservative: only polish wording and align JD terms; do not merge or delete bullets.',
standard: 'Standard: restructure each bullet with STAR, strengthen verbs, put quantified results first.',
aggressive: 'Aggressive: on top of standard, merge duplicate bullets and drop bullets clearly irrelevant to the JD.'}[intensity] || ''
: { conservative: '保守档：只做措辞微调和 JD 用词对齐，不合并、不删减 bullet，不改结构。',
standard: '标准档：按 STAR 重组每条 bullet，动词强化，量化成果前置。',
aggressive: '激进档：在标准档基础上合并重复 bullet、删减与 JD 明显无关的 bullet、重写个人总结。'}[intensity] || '';
return lang === 'en'
? `${jobTitle}\n\n${jdText}\n\n${resumeText}\n\n1. List the 5 most important JD keywords and note which ones the resume misses or weakens.\n2. Rewrite the most relevant bullets (up to 8), each with original/rewritten/change_reason.\n3. Flag bullets clearly irrelevant to the role and suggest removing or moving them.\n4. Write a 60-80 word summary, first sentence containing the exact target role title.\n${intensityNote}`
: `${jobTitle}\n\n${jdText}\n\n${resumeText}\n\n1. 先列出 JD 中最重要的 5 个关键词，指出简历缺失/弱化的词及原因。\n2. 重写最相关的 bullet（最多 8 条），每条给 original/rewritten/change_reason。\n3. 标出与目标岗位明显无关的 bullet，建议删除或下移。\n4. 最后给一段 60-80 字个人总结，首句放目标岗位 exact 名称，不用“热爱/激情/抗压”等空话。\n${intensityNote}`;
}

function parseAiJson(content) {
let s = String(content || '').trim();
s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
const start = s.indexOf('{');
const end = s.lastIndexOf('}');
if (start === -1 || end === -1 || end <= start) throw new Error('no JSON object in model response');
return JSON.parse(s.slice(start, end + 1));
}

function sanitizeBullets(data, resumeText, lang) {
const raw = Array.isArray(data?.bullets)? data.bullets: [];
const out = [];
for (const b of raw.slice(0, 12)) {
const original = String(b?.original || '').trim();
let rewritten = String(b?.rewritten || '').trim();
if (!original ||!rewritten) continue;
// 防编造检查：逐条过；有问题就保留原文并标注
const check = checkFabrication(resumeText, rewritten);
let flagged = false;
let reason = String(b?.change_reason || '').trim();
if (!check.ok) {
const desc = check.violations.map((v) => `${v.type}:${v.value}`).join('、');
rewritten = original;
flagged = true;
reason = `${reason? `${reason}；`: ''}防编造检查拦截（${desc}），已保留原文`.trim();
}
out.push({ original, rewritten, change_reason: reason || (lang === 'en'? 'Rewritten': '已改写'), flagged});
}
return out;
}

// 把改写后的 bullet 拼回全文（按顺序替换原文 bullet 行），用于改后评分
export function applyRewriteToText(originalText, bullets, accepted = null) {
const lines = String(originalText || '').split('\n');
let bi = 0;
const out = lines.map((line) => {
if (!BULLET_RE.test(line)) return line;
const idx = bi;
bi += 1;
const b = bullets[idx];
if (!b) return line;
const accept = accepted === null? true: accepted.includes(idx);
if (!accept) return line;
const marker = line.match(BULLET_RE)[0];
const rewritten = b.flagged? b.original: b.rewritten;
return marker + rewritten;
});
return out.join('\n');
}

export async function runRewrite(env, db, { resumeText, jdText, lang = 'zh', intensity = 'standard', resumeId = null}) {
const rules = (await getRules(db)).rules;
const before = scoreResume(resumeText, jdText, lang);
const sysPrompt = lang === 'en'? rules.rewrite_prompt_en: rules.rewrite_prompt_zh;
const extraRules = [];
if (rules.allow_number_edit!== '1') extraRules.push(lang === 'en'? 'Numbers must be copied exactly from the resume; never change or round them.': '数字一律照搬原文，不许改、不许凑整。');
if (rules.force_star === '1') extraRules.push(lang === 'en'? 'Every bullet must follow STAR structure.': '每条 bullet 必须 STAR 结构。');
const userPrompt = buildUserPrompt({ resumeText, jdText, lang, intensity})
+ (extraRules.length? `\n\n${extraRules.join('\n')}`: '');

let aiResult = null;
let aiError = '';
const ai = await callChatModel(env, db, [
{ role: 'system', content: sysPrompt},
{ role: 'user', content: userPrompt},
], { jsonMode: true, maxTokens: 3000});
if (ai.ok) {
try {
const data = parseAiJson(ai.content);
const bullets = sanitizeBullets(data, resumeText, lang);
if (bullets.length === 0) throw new Error('model returned no usable bullets');
// 总结也要过防编造检查
let summary = String(data.summary || '').trim();
const sCheck = checkFabrication(resumeText, summary);
let summaryFlagged = false;
if (!sCheck.ok) {
summary = deterministicRewrite(resumeText, jdText, lang, intensity).summary;
summaryFlagged = true;
}
aiResult = {
source: 'ai',
model: ai.model,
provider: ai.provider,
summary,
summaryFlagged,
bullets,
missing_keywords: Array.isArray(data.missing_keywords)? data.missing_keywords.slice(0, 10): [],
score_tips: Array.isArray(data.score_tips)? data.score_tips.slice(0, 8): [],
};
} catch (e) {
aiError = `AI 返回解析失败：${e?.message || e}`;
}
} else {
aiError = ai.error || 'AI 调用失败';
}

const result = aiResult || {...deterministicRewrite(resumeText, jdText, lang, intensity), aiError};
const rewrittenText = applyRewriteToText(resumeText, result.bullets, null);
const after = scoreResume(rewrittenText, jdText, lang);
const flaggedCount = result.bullets.filter((b) => b.flagged).length;
return {
...result,
beforeScore: before.total,
afterScore: after.total,
scoreDelta: after.total - before.total,
flaggedCount,
beforeDims: before.dims,
afterDims: after.dims,
gaps: before.gaps,
};
}

// ---------- 求职信 ----------
export async function runCoverLetter(env, db, { resumeText, jdText, company = '', lang = 'zh'}) {
const rules = (await getRules(db)).rules;
const sysPrompt = lang === 'en'? rules.cover_prompt_en: rules.cover_prompt_zh;
const ai = await callChatModel(env, db, [
{ role: 'system', content: sysPrompt},
{ role: 'user', content: lang === 'en'
? `${company}\n\n${jdText}\n\n${resumeText}`
: `${company}\n\n${jdText}\n\n${resumeText}`},
], { jsonMode: true, maxTokens: 2000});
if (!ai.ok) {
return { ok: false, error: ai.error || 'AI 调用失败', source: 'none'};
}
try {
const data = parseAiJson(ai.content);
let letter = String(data.letter || '').trim();
if (!letter) throw new Error('empty letter');
const check = checkCoverLetterFabrication(resumeText, jdText, company, letter);
if (!check.ok) {
return { ok: false, error: `求职信未通过防编造检查（${check.violations.map((v) => `${v.type}:${v.value}`).join('、')}），已拦截`, source: 'ai', violations: check.violations};
}
return { ok: true, source: 'ai', model: ai.model, letter};
} catch (e) {
return { ok: false, error: `AI 返回解析失败：${e?.message || e}`, source: 'ai'};
}
}

// ---------- 互译 ----------
export async function runTranslate(env, db, { text, lang = 'zh'}) {
const rules = (await getRules(db)).rules;
const fromLang = detectTextLang(text);
const toLang = fromLang === 'zh'? 'en': 'zh';
const ai = await callChatModel(env, db, [
{ role: 'system', content: rules.translate_prompt},
{ role: 'user', content: `${fromLang === 'zh'? '中文': '英文'}\n${toLang === 'zh'? '中文': '英文'}\n\n${text}`},
], { jsonMode: true, maxTokens: 3000});
if (!ai.ok) {
return { ok: false, error: ai.error || 'AI 调用失败', source: 'none'};
}
try {
const data = parseAiJson(ai.content);
const translated = String(data.translated || '').trim();
if (!translated) throw new Error('empty translation');
// 互译只校验数字/日期一致（公司名翻译后形态会变，不校验公司）
const origNums = extractFacts(text).numbers;
const rwNums = extractFacts(stripPlaceholders(translated)).numbers;
const missing = [...rwNums].filter((n) =>!origNums.has(n));
if (missing.length > 0) {
return { ok: false, error: `翻译未通过数字一致检查（新增数字：${missing.join('、')}），已拦截`, source: 'ai'};
}
return { ok: true, source: 'ai', model: ai.model, fromLang, toLang, translated};
} catch (e) {
return { ok: false, error: `AI 返回解析失败：${e?.message || e}`, source: 'ai'};
}
}
