// 简历过筛 — 异步任务队列（第 2 周，规划 §5）
// 改写/求职信/互译都是耗时任务：提交后建 task（pending），Worker 用 waitUntil 在后台跑，
// 前端轮询 GET /api/tasks/:id；cron 每分钟跑队列兜底（处理卡住的 pending/running 任务）。
// 额度：提交时扣 1 个 rewrite 额度；任务最终失败时退回（退次兜底）。
import { deductCredit, refundCredit } from './auth.js';
import { runRewrite, runCoverLetter, runTranslate } from './rewrite.js';

export const TASK_TYPES = ['rewrite', 'cover_letter', 'translate'];
// 任务超时：一次任务可能按 failover 顺序连试多个模型，单模型调用超时 45 秒，
// 最坏 4 个模型 × 45 秒 = 180 秒；cron 只有超过这个时间才算任务卡住。
// 之前是 45 秒（和单次 AI 调用超时一致），导致一次正常改写还没跑完就被 cron
// 当成“卡住”重复执行：重复调模型、重复计失败（曾因此把主模型误自动停用）。
export const TASK_TIMEOUT_MS = 240 * 1000; // 240 秒，覆盖整条 failover 链

export async function createTask(db, userId, type, payload) {
  const now = Date.now();
  const r = await db.prepare(
    'INSERT INTO tasks (user_id, type, status, payload, retry, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
  ).bind(userId, type, 'pending', JSON.stringify(payload), now, now).run();
  return { id: r.meta.last_row_id };
}

export async function getTask(db, userId, taskId) {
  const row = await db.prepare('SELECT * FROM tasks WHERE id = ?').bind(taskId).first().catch(() => null);
  if (!row) return null;
  if (row.user_id !== userId) return { forbidden: true };
  return row;
}

function publicTask(row) {
  if (!row) return null;
  let result = null;
  try { result = row.result_ref ? JSON.parse(row.result_ref) : null; } catch { result = null; }
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    error: row.error || null,
    result,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// 提交入口（共用）：扣额度 → 建任务 → 返回任务 id；额度不足返回 { ok:false, code:'no_credit' }
export async function submitTask(db, userId, type, payload) {
  if (!TASK_TYPES.includes(type)) return { ok: false, error: '未知的任务类型' };
  const paid = await deductCredit(db, userId, 'rewrite', 1);
  if (!paid) return { ok: false, code: 'no_credit', error: 'rewrite 额度不足，请先购买（9.9 元/次起）' };
  const task = await createTask(db, userId, type, payload);
  return { ok: true, taskId: task.id };
}

// 执行单个任务（幂等：只有 pending/running 且未超时的才跑；失败退额度）
export async function processTask(env, db, taskId) {
  const task = await db.prepare('SELECT * FROM tasks WHERE id = ?').bind(taskId).first().catch(() => null);
  if (!task) return { ok: false, error: 'task not found' };
  if (task.status === 'done') return { ok: true, already: true };
  if (task.status === 'running' && Date.now() - task.updated_at < TASK_TIMEOUT_MS) {
    return { ok: false, error: 'task already running' };
  }
  const now = Date.now();
  await db.prepare("UPDATE tasks SET status = 'running', updated_at = ? WHERE id = ?").bind(now, taskId).run().catch(() => {});
  let payload = {};
  try { payload = JSON.parse(task.payload || '{}'); } catch { payload = {}; }

  try {
    let result;
    if (task.type === 'rewrite') {
      const r = await runRewrite(env, db, payload);
      result = { ...r, taskId };
      // 改写结果存档（rewrites 表），供“我的简历”一岗一版用
      const ins = await db.prepare(
        'INSERT INTO rewrites (user_id, resume_id, task_id, type, lang, intensity, before_score, after_score, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).bind(task.user_id, payload.resumeId || null, taskId, 'rewrite', payload.lang || 'zh', payload.intensity || 'standard', r.beforeScore ?? null, r.afterScore ?? null, JSON.stringify(result), now).run().catch((e) => { console.error('rewrite archive failed', e); return null; });
      if (ins?.meta?.last_row_id) result.rewriteId = ins.meta.last_row_id;
    } else if (task.type === 'cover_letter') {
      const r = await runCoverLetter(env, db, payload);
      if (!r.ok) throw new Error(r.error || 'cover letter failed');
      result = { ...r, taskId };
    } else if (task.type === 'translate') {
      const r = await runTranslate(env, db, payload);
      if (!r.ok) throw new Error(r.error || 'translate failed');
      result = { ...r, taskId };
    } else {
      throw new Error(`unknown task type ${task.type}`);
    }
    await db.prepare("UPDATE tasks SET status = 'done', result_ref = ?, updated_at = ? WHERE id = ?")
      .bind(JSON.stringify(result), Date.now(), taskId).run();
    return { ok: true, taskId, result };
  } catch (e) {
    const msg = e?.message || String(e);
    console.error('task failed', taskId, msg);
    await db.prepare("UPDATE tasks SET status = 'failed', error = ?, updated_at = ? WHERE id = ?")
      .bind(String(msg).slice(0, 500), Date.now(), taskId).run().catch(() => {});
    // 退次兜底：任务失败退 1 个 rewrite 额度（只退一次）
    if (!task.credit_refunded) {
      await refundCredit(db, task.user_id, 'rewrite', 1);
      await db.prepare('UPDATE tasks SET credit_refunded = 1 WHERE id = ?').bind(taskId).run().catch(() => {});
    }
    return { ok: false, error: msg };
  }
}

// cron 兜底：每分钟最多处理 3 个 pending/超时的 running 任务
export async function processPendingTasks(env, db, limit = 3) {
  const stale = Date.now() - TASK_TIMEOUT_MS;
  const { results } = await db.prepare(
    "SELECT id FROM tasks WHERE status = 'pending' OR (status = 'running' AND updated_at < ?) ORDER BY created_at ASC LIMIT ?",
  ).bind(stale, limit).all().catch(() => ({ results: [] }));
  const out = [];
  for (const t of results || []) {
    out.push(await processTask(env, db, t.id));
  }
  return { processed: out.length, results: out };
}

export { publicTask };
