import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreResume, extractKeywords, parseResume } from '../src/ats.js';

const RESUME = `张伟
电话：13812345678 邮箱：zhangwei@example.com
教育背景
2018.09-2022.06 北京大学 计算机科学与技术 本科
工作经历
2022.07-至今 字节跳动 高级产品经理
• 主导用户增长项目，推动 DAU 从 100 万提升到 300 万，增长 200%
• 负责新功能上线，覆盖 500 万用户，转化率提升 15%
• 搭建数据分析体系，输出 20+ 份增长报告，决策效率提升 30%
• 优化推荐算法，CTR 提升 8%，人均使用时长增加 12 分钟
项目经历
2021.03-2021.09 校园招聘系统
• 开发简历筛选模块，处理 10000+ 份简历，效率提升 50%
技能
Python、SQL、数据分析、用户增长、AB测试、产品设计`;

const JD = `高级产品经理（用户增长方向）
任职要求：
1. 本科及以上学历，3 年以上产品经验；
2. 熟悉用户增长方法论，有 DAU 提升经验者优先；
3. 熟练掌握 SQL、Python，能独立完成数据分析；
4. 具备 AB测试经验，熟悉转化率优化。
优先条件：有推荐算法、增长黑客经验者优先。`;

test('full resume + JD scores in a sane range', () => {
  const r = scoreResume(RESUME, JD, 'zh');
  console.log(JSON.stringify({ total: r.total, band: r.band, dims: r.dims, q: r.qDeduction, kw: r.keywordCount }, null, 2));
  assert.ok(r.total >= 60 && r.total <= 100, `total ${r.total} out of range`);
  assert.equal(r.hasJD, true);
  assert.ok(r.dims.d2 > 50, `d2 ${r.dims.d2} too low for a matching resume`);
  assert.ok(r.gaps.matched.length > 5, 'expected several matched keywords');
  assert.ok(r.lineReview.length > 0);
});

test('no-JD generic score renormalizes', () => {
  const r = scoreResume(RESUME, '', 'zh');
  console.log(JSON.stringify({ total: r.total, dims: r.dims }, null, 2));
  assert.equal(r.hasJD, false);
  assert.equal(r.dims.d2, null);
  assert.ok(r.total >= 0 && r.total <= 100);
});

test('weak resume scores low', () => {
  const r = scoreResume('我叫小明，想找工作。', JD, 'zh');
  console.log(JSON.stringify({ total: r.total, band: r.band, dims: r.dims }, null, 2));
  assert.ok(r.total < 70, `weak resume scored ${r.total}`);
  assert.equal(r.band, 'weak');
});

test('keyword extraction tiers', () => {
  const kws = extractKeywords(JD);
  const t1 = kws.filter((k) => k.tier === 1);
  console.log('keywords:', kws.slice(0, 12).map((k) => `${k.term}(T${k.tier})`).join(', '));
  assert.ok(kws.length > 5);
  assert.ok(t1.length > 0, 'expected tier-1 keywords');
});

test('parseResume finds fields', () => {
  const p = parseResume(RESUME);
  assert.equal(p.name, '张伟');
  assert.equal(p.phone, '13812345678');
  assert.equal(p.email, 'zhangwei@example.com');
  assert.equal(p.degree, '本科');
  assert.ok(p.bullets.length >= 5);
});
