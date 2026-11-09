import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkFabrication,
  checkCoverLetterFabrication,
  extractFacts,
  deterministicRewrite,
  applyRewriteToText,
  runRewrite,
  runCoverLetter,
} from '../src/rewrite.js';

const RESUME = `张伟
电话：13812345678 邮箱：zhangwei@example.com
教育背景
2018.09-2022.06 北京大学 计算机科学与技术 本科
工作经历
2022.07-至今 字节跳动 高级产品经理
• 主导用户增长项目，推动 DAU 从 100 万提升到 300 万，增长 200%
• 负责新功能上线，覆盖 500 万用户，转化率提升 15%
• 搭建数据分析体系，输出 20+ 份增长报告，决策效率提升 30%
技能
Python、SQL、数据分析、用户增长、AB测试`;

const JD = `高级产品经理（用户增长方向）
任职要求：
1. 本科及以上学历，3 年以上产品经验；
2. 熟悉用户增长方法论，有 DAU 提升经验者优先；
3. 熟练掌握 SQL、Python，能独立完成数据分析；
4. 具备 AB测试经验，熟悉转化率优化。`;

// 假 D1：规则表空（走默认值）、模型表空（无可用 AI，走确定性兜底）
function fakeDb() {
  const stmt = {
    bind: () => stmt,
    all: async () => ({ results: [] }),
    first: async () => null,
    run: async () => ({ meta: { changes: 0, last_row_id: 1 } }),
  };
  return { prepare: () => stmt };
}

test('fabrication check catches an invented number', () => {
  const r = checkFabrication(RESUME, '主导项目，DAU 从 100 万提升到 900 万，增长 800%');
  console.log('number violations:', r.violations);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.type === 'number' && v.value === '900'));
});

test('fabrication check catches an invented company', () => {
  const r = checkFabrication(RESUME, '在腾讯科技有限公司担任产品经理，主导增长项目');
  console.log('company violations:', r.violations);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.type === 'company'));
});

test('fabrication check catches an invented date', () => {
  const r = checkFabrication(RESUME, '2020.01-2021.12 在字节跳动工作');
  console.log('date violations:', r.violations);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.type === 'date'));
});

test('fabrication check passes a faithful rewrite', () => {
  const r = checkFabrication(RESUME, '主导用户增长项目，推动 DAU 从 100 万提升到 300 万，增长 200%');
  assert.equal(r.ok, true);
  assert.equal(r.violations.length, 0);
});

test('fabrication check ignores [待补充] placeholders', () => {
  const r = checkFabrication(RESUME, '主导用户增长项目，DAU 提升 [待补充：___]%');
  assert.equal(r.ok, true);
});

test('deterministic rewrite never fabricates', () => {
  const out = deterministicRewrite(RESUME, JD, 'zh', 'standard');
  assert.equal(out.source, 'rules');
  assert.ok(out.bullets.length >= 3, 'expected bullets');
  assert.ok(out.summary.length > 0);
  for (const b of out.bullets) {
    const c = checkFabrication(RESUME, b.rewritten);
    assert.equal(c.ok, true, `bullet fabricated: ${b.rewritten} -> ${JSON.stringify(c.violations)}`);
  }
  console.log('deterministic bullets:', out.bullets.map((b) => b.rewritten).join(' | '));
});

test('deterministic rewrite lists missing JD keywords', () => {
  const out = deterministicRewrite(RESUME, JD, 'zh', 'standard');
  assert.ok(Array.isArray(out.missing_keywords));
  console.log('missing keywords:', out.missing_keywords);
});

test('applyRewriteToText replaces bullet lines in order', () => {
  const bullets = [
    { original: '负责新功能上线，覆盖 500 万用户', rewritten: '主导新功能上线，覆盖 500 万用户', flagged: false },
  ];
  const text = '工作经历\n• 负责新功能上线，覆盖 500 万用户\n• 搭建数据分析体系';
  const out = applyRewriteToText(text, bullets, [0]);
  assert.match(out, /主导新功能上线/);
  assert.match(out, /搭建数据分析体系/);
  const kept = applyRewriteToText(text, bullets, []);
  assert.match(kept, /负责新功能上线/);
});

test('runRewrite without any AI model falls back to rules and scores both sides', async () => {
  const env = {};
  const db = fakeDb();
  const r = await runRewrite(env, db, { resumeText: RESUME, jdText: JD, lang: 'zh', intensity: 'standard' });
  console.log(JSON.stringify({ source: r.source, before: r.beforeScore, after: r.afterScore, delta: r.scoreDelta, flagged: r.flaggedCount, aiError: r.aiError }, null, 2));
  assert.equal(r.source, 'rules');
  assert.ok(Number.isFinite(r.beforeScore));
  assert.ok(Number.isFinite(r.afterScore));
  assert.ok(r.bullets.length >= 3);
  assert.equal(r.flaggedCount, 0);
  // 改写后的每条 bullet 都必须通过防编造检查
  for (const b of r.bullets) {
    const c = checkFabrication(RESUME, b.rewritten);
    assert.equal(c.ok, true, `rewritten bullet fabricated: ${b.rewritten}`);
  }
});

test('extractFacts finds numbers, companies and dates', () => {
  const f = extractFacts(RESUME);
  assert.ok(f.numbers.has('100'), 'expected number 100');
  assert.ok(f.numbers.has('300'), 'expected number 300');
  assert.ok([...f.companies].some((c) => c.includes('字节跳动')), 'expected company 字节跳动');
  assert.ok(f.dates.has('201809'), 'expected date 2018.09');
  assert.ok(f.dates.has('202207'), 'expected date 2022.07');
});

// ---------- 求职信防编造检查（第 2 周 bug 修复回归） ----------
const COVER_COMPANY = '字节跳动';
const COVER_LETTER_OK = `尊敬的招聘负责人：
我关注到贵公司正在招聘高级产品经理（用户增长方向）。2022年7月，我加入字节跳动担任高级产品经理，主导用户增长项目，推动 DAU 从 100 万提升到 300 万，增长 200%。我有 3 年以上产品经验，熟练掌握 SQL 与 Python。期待与贵公司进一步沟通，谢谢！`;

test('extractFacts: 日期不拆成数字（2023.07 不是数字 2023.07/2023/7）', () => {
  const f = extractFacts('2023.07-至今 字节跳动 高级产品经理\n2022-2025 年，销售额 500 万');
  assert.equal(f.numbers.has('2023.07'), false);
  assert.equal(f.numbers.has('2023'), false);
  assert.equal(f.numbers.has('7'), false);
  assert.equal(f.numbers.has('2022'), false);
  assert.equal(f.numbers.has('2025'), false);
  assert.ok(f.numbers.has('500'), 'expected number 500');
  assert.ok(f.dates.has('202307'), 'expected date 202307');
  assert.ok(f.dates.has('2023'), 'expected year 2023');
  assert.ok(f.dates.has('2022'), 'expected year 2022');
  assert.ok(f.dates.has('2025'), 'expected year 2025');
  // 真小数仍是数字
  assert.ok(extractFacts('转化率提升 3.5 倍').numbers.has('3.5'));
});

test('cover letter: “贵公司”敬称不判违规', () => {
  const r = checkCoverLetterFabrication(RESUME, JD, COVER_COMPANY, '我关注到贵公司正在招聘，我渴望将我的运营经验与贵公司结合。');
  assert.equal(r.ok, true, JSON.stringify(r.violations));
});

test('cover letter: JD 里的数字可用（3 年以上）', () => {
  const r = checkCoverLetterFabrication(RESUME, JD, COVER_COMPANY, '我有 3 年以上产品经验，符合贵岗位要求。');
  assert.equal(r.ok, true, JSON.stringify(r.violations));
});

test('cover letter: 日期换写法通过（简历 2022.07，信里 2022年7月）', () => {
  const r = checkCoverLetterFabrication(RESUME, JD, COVER_COMPANY, '2022年7月，我加入字节跳动担任高级产品经理。');
  assert.equal(r.ok, true, JSON.stringify(r.violations));
});

test('cover letter: 公司名加组织后缀通过（字节跳动 → 字节跳动有限公司）', () => {
  const r = checkCoverLetterFabrication(RESUME, JD, COVER_COMPANY, '我希望加入字节跳动有限公司，继续做用户增长。');
  assert.equal(r.ok, true, JSON.stringify(r.violations));
});

test('cover letter: 完整求职信通过（贵公司 + JD 数字 + 换写日期）', () => {
  const r = checkCoverLetterFabrication(RESUME, JD, COVER_COMPANY, COVER_LETTER_OK);
  assert.equal(r.ok, true, JSON.stringify(r.violations));
});

test('cover letter: 真编造仍拦截（数字/公司/日期）', () => {
  const num = checkCoverLetterFabrication(RESUME, JD, COVER_COMPANY, '主导项目推动 DAU 从 100 万提升到 900 万。');
  assert.equal(num.ok, false);
  assert.ok(num.violations.some((v) => v.type === 'number' && v.value === '900'));
  const co = checkCoverLetterFabrication(RESUME, JD, COVER_COMPANY, '我曾在腾讯科技有限公司担任产品经理。');
  assert.equal(co.ok, false);
  assert.ok(co.violations.some((v) => v.type === 'company'));
  const dt = checkCoverLetterFabrication(RESUME, JD, COVER_COMPANY, '2020年1月，我加入字节跳动。');
  assert.equal(dt.ok, false);
  assert.ok(dt.violations.some((v) => v.type === 'date'));
});

// runCoverLetter 全链路（stub fetch 模拟模型返回合法 JSON）
function coverDb() {
  const modelRow = {
    id: 1, sort_order: 1, provider: 'deepseek', base_url: 'https://api.deepseek.com/v1',
    name: 'DeepSeek Chat', model: 'deepseek-chat', key_ref: 'TEST_MODEL_KEY',
    key_last4: '****', key_configured: 1, is_active: 1, daily_limit: 50, fail_count: 0,
  };
  const rules = [
    { key: 'cover_prompt_zh', value: '按 JD 和简历写求职信，只用简历、JD 和目标公司名提供的事实。输出 JSON：{letter}', version: 1 },
    { key: 'cover_prompt_en', value: 'Write a cover letter from the resume and JD. Only use facts from the resume, the JD and the target company name. Output JSON: {letter}', version: 1 },
  ];
  const stmt = {
    _sql: '',
    bind: () => stmt,
    all: async () => {
      if (stmt._sql.includes('ai_rules')) return { results: rules };
      if (stmt._sql.includes('ai_models')) return { results: [modelRow] };
      return { results: [] };
    },
    first: async () => {
      if (stmt._sql.includes('ai_models')) return modelRow;
      return null;
    },
    run: async () => ({ meta: { changes: 0, last_row_id: 1 } }),
  };
  return { prepare: (sql) => { stmt._sql = String(sql || ''); return stmt; } };
}

test('runCoverLetter: 正常求职信走 AI 成功出信（stub 模型）', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({ letter: COVER_LETTER_OK }) } }] }),
  });
  try {
    const r = await runCoverLetter({ TEST_MODEL_KEY: 'sk-test-fake-key' }, coverDb(), {
      resumeText: RESUME, jdText: JD, company: COVER_COMPANY, lang: 'zh',
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.source, 'ai');
    assert.match(r.letter, /贵公司/);
    assert.match(r.letter, /字节跳动/);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('runCoverLetter: 带编造数字的信照样拦截（stub 模型）', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify({ letter: '主导项目推动 DAU 从 100 万提升到 900 万，期待加入贵公司。' }) } }] }),
  });
  try {
    const r = await runCoverLetter({ TEST_MODEL_KEY: 'sk-test-fake-key' }, coverDb(), {
      resumeText: RESUME, jdText: JD, company: COVER_COMPANY, lang: 'zh',
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /防编造检查/);
    assert.ok((r.violations || []).some((v) => v.type === 'number' && v.value === '900'));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('extractFacts: “我关注到贵公司”整段不算公司名，但真实公司名仍识别', () => {
  const f = extractFacts('我关注到贵公司正在招聘，我渴望将我的经验与贵公司结合。贵州茅台集团欢迎你。');
  assert.equal([...f.companies].some((c) => c.includes('贵公司')), false);
  assert.ok([...f.companies].some((c) => c.includes('贵州茅台')), 'expected 贵州茅台集团');
});
