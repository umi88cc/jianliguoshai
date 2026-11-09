// 任务队列超时必须覆盖整条模型 failover 链，否则 cron 会把还在跑的任务当成卡住重复执行。
import test from 'node:test';
import assert from 'node:assert/strict';
import { TASK_TIMEOUT_MS } from '../src/tasks.js';
import { AI_CALL_TIMEOUT_MS } from '../src/ai.js';

test('task timeout covers a full 4-model failover chain', () => {
  // 单模型调用超时 45 秒；4 个模型全试一遍最坏 180 秒，任务超时必须大于它
  assert.ok(
    TASK_TIMEOUT_MS > 4 * AI_CALL_TIMEOUT_MS,
    `TASK_TIMEOUT_MS (${TASK_TIMEOUT_MS}ms) must exceed 4 x AI_CALL_TIMEOUT_MS (${4 * AI_CALL_TIMEOUT_MS}ms)`,
  );
});

import { processTask } from '../src/tasks.js';

// 求职信任务失败（无可用模型）必须退 1 个 rewrite 额度，且只退一次
test('failed cover-letter task refunds 1 rewrite credit', async () => {
  const runs = [];
  const taskRow = {
    id: 1, user_id: 9, type: 'cover_letter', status: 'pending',
    payload: JSON.stringify({ resumeText: '张伟\n2022.07-至今 字节跳动 产品经理', jdText: '产品经理', company: '', lang: 'zh' }),
    credit_refunded: 0, updated_at: Date.now(),
  };
  const stmt = {
    _sql: '', _params: [],
    bind(...args) { this._params = args; return this; },
    all: async () => ({ results: [] }),
    first: async () => {
      if (stmt._sql.includes('FROM tasks')) return taskRow;
      return null;
    },
    run: async () => {
      runs.push({ sql: stmt._sql, params: [...stmt._params] });
      return { meta: { changes: 1, last_row_id: 1 } };
    },
  };
  const db = { prepare: (sql) => { stmt._sql = String(sql || ''); return stmt; } };
  const r = await processTask({}, db, 1);
  assert.equal(r.ok, false, 'task without any model must fail');
  // 任务标 failed
  assert.ok(runs.some((x) => x.sql.includes("status = 'failed'")), 'task should be marked failed');
  // 退额度：INSERT INTO credits ... balance +1
  const refund = runs.find((x) => x.sql.includes('INSERT INTO credits'));
  assert.ok(refund, 'refund INSERT should run');
  assert.equal(refund.params[1], 'rewrite');
  assert.equal(refund.params[2], 1);
  assert.equal(refund.params[3], 1);
  // 只退一次标记
  assert.ok(runs.some((x) => x.sql.includes('credit_refunded = 1')), 'credit_refunded flag should be set');
});
