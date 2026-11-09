import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkFabrication,
  extractFacts,
  deterministicRewrite,
  applyRewriteToText,
  runRewrite,
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
