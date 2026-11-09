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
