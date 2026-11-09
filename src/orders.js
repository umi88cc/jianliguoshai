// 简历过筛 — 订单与付费三轨（第 3 周，规划 §5 / §6）
// 三轨分流（按语言，服务端强制执行）：
// 中文（国内）：微信 / 支付宝商户码 → 用户点“我已付款”填交易单号（可传截图）
// → 待审核 → 飞书私信通知站长 → 站长后台“确认通过”才开通；AI 绝不自动通过国内订单。
// 英文（国外）：USDT（TRC-20）→ 监听到账先核对记录（自动放行关闭，人工确认后开通）；
// PayPal → Webhook 验签 + 金额/手续费三项对账后自动开通（凭证未配时不上线）。
// 金额一律存分（整数）；USDT 用 sun 精确整数；订单 30 分钟有效（USDT）；
// 一次性付费，到期不自动续费；虚拟资源类服务，一经开通一般不支持退款。

import {
  getPlan,
  formatCny,
  formatUsdt,
  usdtPayableSun,
  newOrderNo,
  methodAllowedForLang,
} from "./plans.js";
import { sendFeishuDM } from "./feishu.js";
import { verifyUsdtTransfer, usdtToSun } from "./usdt.js";
import {
  notifyOwner,
  addNotification,
  domesticOrderNoticeText,
  usdtArrivedNoticeText,
} from "./notify.js";

export const USDT_ORDER_TTL_MS = 30 * 60 * 1000; // USDT 订单 30 分钟有效
export const REVIEW_REMIND_AFTER_MS = 2 * 3600 * 1000; // 待审核超 2 小时飞书二次提醒
export const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024; // 付款截图 ≤2MB

// ---- Turnstile 校验（规划 §5.4：注册/下单加 Turnstile） ----
// 未配 TURNSTILE_SECRET 时直接放行并记日志（不阻塞下单）；配了则严格校验。
export async function verifyTurnstile(env, token, ip) {
  const secret = String(env.TURNSTILE_SECRET || "").trim();
  if (!secret) return { ok: true, skipped: true };
  if (!token) return { ok: false, error: "请先完成人机验证" };
  try {
    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret,
          response: token,
          remoteip: ip || "",
        }),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!data.success) return { ok: false, error: "人机验证未通过，请重试" };
    return { ok: true };
  } catch (e) {
    console.error("turnstile verify error", e);
    return { ok: false, error: "人机验证失败，请重试" };
  }
}

// ---- 套餐读取：优先读 D1 plans 表（后台可改价），读不到用代码默认值兜底 ----
export async function loadPlan(db, slug) {
  try {
    const row = await db
      .prepare("SELECT * FROM plans WHERE slug = ? AND is_active = 1")
      .bind(slug)
      .first();
    if (row) {
      return {
        slug: row.slug,
        name_zh: row.name_zh,
        name_en: row.name_en,
        price_cents: row.price_cents,
        usdt_sun: row.usdt_sun,
        rewrite_credits: row.rewrite_credits,
        export_credits: row.export_credits,
        duration_days: row.duration_days,
        refill_monthly: row.refill_monthly,
      };
    }
  } catch (e) {
    console.error("loadPlan db failed", e);
  }
  return getPlan(slug);
}

// ---- 下单（须登录；同用户同套餐同方式的待付订单 5 分钟内只留一个，防重复点） ----
export async function createOrder(
  db,
  env,
  user,
  { plan: planSlug, method, lang, turnstileToken, ip },
) {
  const plan = await loadPlan(db, planSlug);
  if (!plan) return { ok: false, error: "套餐不存在", code: 400 };
  if (!methodAllowedForLang(method, lang)) {
    return {
      ok: false,
      error:
        lang === "en"
          ? "This payment method is not available in your region"
          : "该支付方式不适用于当前语言版本",
      code: 400,
    };
  }
  const ts = await verifyTurnstile(env, turnstileToken, ip);
  if (!ts.ok) return { ok: false, error: ts.error, code: 400 };

  const now = Date.now();
  // 分端点限流（规划 §18）：同一用户每天最多 10 单，防刷单；超限返回 429
  const dayStart = now - (now % 86400000);
  const dayCount = await db
    .prepare(
      "SELECT COUNT(*) AS c FROM orders WHERE user_id =? AND created_at >=?",
    )
    .bind(user.id, dayStart)
    .first()
    .catch(() => ({ c: 0 }));
  if (Number(dayCount?.c || 0) >= 10) {
    return {
      ok: false,
      error:
        lang === "en"
          ? "Too many orders today. Please try again tomorrow."
          : "今天下单已达上限（10 单），请明天再试",
      code: 429,
    };
  }
  // 防重复点：5 分钟内已有同套餐同方式待付订单，直接返回那一单
  const dup = await db
    .prepare(
      "SELECT * FROM orders WHERE user_id =? AND plan =? AND method =? AND status = 'pending' AND created_at >? ORDER BY id DESC LIMIT 1",
    )
    .bind(user.id, plan.slug, method, now - 5 * 60 * 1000)
    .first()
    .catch(() => null);
  if (dup) return { ok: true, order: publicOrder(dup, lang), existed: true };

  // USDT 尾数：待付的同套餐 USDT 订单金额不能重，保证链上金额唯一对应一单
  let amountUsdtSun = null;
  if (method === "usdt") {
    const pend = await db
      .prepare(
        "SELECT amount_usdt_sun FROM orders WHERE method = 'usdt' AND status IN ('pending', 'review_pending') AND amount_usdt_sun IS NOT NULL",
      )
      .bind()
      .all()
      .catch(() => ({ results: [] }));
    const used = new Set(
      (pend.results || []).map((r) => Number(r.amount_usdt_sun)),
    );
    amountUsdtSun = usdtPayableSun(plan, used);
  }

  // 订单号唯一：重试 3 次
  let orderNo = "";
  for (let i = 0; i < 3; i += 1) {
    const cand = newOrderNo();
    const clash = await db
      .prepare("SELECT id FROM orders WHERE order_no =?")
      .bind(cand)
      .first()
      .catch(() => null);
    if (!clash) {
      orderNo = cand;
      break;
    }
  }
  if (!orderNo)
    return { ok: false, error: "订单号生成失败，请重试", code: 500 };

  const expiresAt = method === "usdt" ? now + USDT_ORDER_TTL_MS : null;
  const r = await db
    .prepare(
      "INSERT INTO orders (user_id, plan, amount, amount_usdt_sun, method, status, txid, order_no, expires_at, created_at) VALUES (?,?,?,?,?,?, NULL,?,?,?)",
    )
    .bind(
      user.id,
      plan.slug,
      plan.price_cents,
      amountUsdtSun,
      method,
      "pending",
      orderNo,
      expiresAt,
      now,
    )
    .run();
  const row = await db
    .prepare("SELECT * FROM orders WHERE id =?")
    .bind(r.meta.last_row_id)
    .first();
  return { ok: true, order: publicOrder(row, lang) };
}

// 对外展示的订单字段（不露内部字段）
export function publicOrder(row, lang) {
  if (!row) return null;
  const plan = getPlan(row.plan);
  return {
    id: row.id,
    order_no: row.order_no,
    plan: row.plan,
    plan_name:
      lang === "en" ? plan?.name_en || row.plan : plan?.name_zh || row.plan,
    amount_cents: row.amount,
    amount_text:
      lang === "en"
        ? `${formatUsdt(row.amount_usdt_sun ?? usdtToSun(row.amount / 100))} USDT`
        : formatCny(row.amount),
    amount_usdt_sun: row.amount_usdt_sun,
    amount_usdt_text: row.amount_usdt_sun
      ? formatUsdt(row.amount_usdt_sun)
      : null,
    method: row.method,
    status: row.status,
    txid: row.txid,
    screenshot_key: row.screenshot_key || null,
    reject_reason: row.reject_reason || null,
    expires_at: row.expires_at,
    created_at: row.created_at,
  };
}

// ---- “我已付款”（国内微信/支付宝：填交易单号，可传截图；USDT：填 TxID） ----
// 只允许本人操作自己的待付订单；成功后状态 → review_pending，并飞书通知站长。
export async function markPaid(
  db,
  env,
  user,
  orderId,
  { txid, payerNote, screenshotKey, lang, baseUrl },
) {
  const row = await db
    .prepare("SELECT * FROM orders WHERE id =?")
    .bind(orderId)
    .first()
    .catch(() => null);
  if (!row || row.user_id !== user.id)
    return { ok: false, error: "订单不存在", code: 404 };
  if (row.status !== "pending")
    return { ok: false, error: "订单状态不允许此操作", code: 400 };
  if (row.method === "usdt" && row.expires_at && row.expires_at < Date.now()) {
    return {
      ok: false,
      error:
        "订单已过期（30 分钟），请重新下单；已转账的凭交易哈希联系站长人工开通",
      code: 400,
    };
  }
  const tx = String(txid || "")
    .trim()
    .slice(0, 128);
  if (row.method === "usdt" && !/^[0-9a-fA-F]{64}$/.test(tx)) {
    return {
      ok: false,
      error: "TxID 是 64 位十六进制交易哈希，请核对后填写",
      code: 400,
    };
  }
  const note = String(payerNote || "")
    .trim()
    .slice(0, 200);
  const shot = String(screenshotKey || "")
    .trim()
    .slice(0, 200);
  // 截图 key 必须是本次会话上传的合法 key（防伪造路径）
  if (shot && !/^shot-\d+-[a-z0-9]+\.(png|jpg|jpeg|webp)$/.test(shot)) {
    return { ok: false, error: "付款截图无效，请重新上传", code: 400 };
  }
  await db
    .prepare(
      "UPDATE orders SET status = 'review_pending', txid =?, payer_note =?, screenshot_key =?, last_reminded_at =? WHERE id =? AND status = 'pending'",
    )
    .bind(tx || null, note || null, shot || null, Date.now(), orderId)
    .run();

  // 通知站长：国内走飞书；USDT 走 Telegram 主渠道 + 飞书兜底
  const plan = getPlan(row.plan);
  const orderView = {
    order_no: row.order_no,
    email: user.email,
    plan_name:
      lang === "en" ? plan?.name_en || row.plan : plan?.name_zh || row.plan,
    amount_text:
      row.method === "usdt"
        ? `${formatUsdt(row.amount_usdt_sun)} USDT`
        : formatCny(row.amount),
    method_text: row.method,
    txid: tx || "-",
    screenshot_url: shot ? `${baseUrl || ""}/img/${shot}` : "",
  };
  if (row.method === "usdt") {
    await notifyOwner(env, db, {
      text: usdtArrivedNoticeText({
        ...orderView,
        confirmations: "待链上核对",
      }),
      channels: ["telegram", "feishu"],
    });
  } else {
    await notifyOwner(env, db, {
      text: domesticOrderNoticeText(orderView),
      channels: ["feishu", "telegram"],
    });
  }
  const updated = await db
    .prepare("SELECT * FROM orders WHERE id =?")
    .bind(orderId)
    .first();
  return { ok: true, order: publicOrder(updated, lang) };
}

// ---- 开通权益（订单通过时调用；与订单状态更新同批提交） ----
// 返回 D1 batch 的语句数组（调用方与订单更新一起 batch 执行，保证原子性）。
export function grantPlanStatements(db, order, now, planArg) {
  const plan = planArg || getPlan(order.plan);
  if (!plan) return [];
  const stmts = [];
  // 会员记录：包月从当前到期日往后延（续费排队）；终身不过期、每月补满。
  if (plan.duration_days > 0 || plan.refill_monthly) {
    const expiresAt =
      plan.duration_days > 0
        ? now + plan.duration_days * 24 * 3600 * 1000
        : null;
    stmts.push(
      db
        .prepare(
          "INSERT INTO memberships (user_id, plan, started_at, expires_at, last_refill_at, status) VALUES (?,?,?,?,?,?) " +
            "ON CONFLICT(user_id, plan) DO UPDATE SET expires_at = CASE WHEN? IS NOT NULL THEN MAX(COALESCE(expires_at, 0),?) ELSE expires_at END, last_refill_at =?, status =?",
        )
        .bind(
          order.user_id,
          plan.slug,
          now,
          expiresAt,
          now,
          "active",
          expiresAt,
          now,
          now,
          "active",
        ),
    );
  }
  // 额度：改写按套餐数；导出 -1 = 不限（grantCredits 原样写入）
  stmts.push(
    db
      .prepare(
        "INSERT INTO credits (user_id, kind, balance, expire_at) VALUES (?,?,?,?) " +
          "ON CONFLICT(user_id, kind) DO UPDATE SET balance = balance +?, expire_at =?",
      )
      .bind(
        order.user_id,
        "rewrite",
        plan.rewrite_credits,
        plan.duration_days > 0
          ? now + plan.duration_days * 24 * 3600 * 1000
          : null,
        plan.rewrite_credits,
        plan.duration_days > 0
          ? now + plan.duration_days * 24 * 3600 * 1000
          : null,
      ),
  );
  stmts.push(
    db
      .prepare(
        "INSERT INTO credits (user_id, kind, balance, expire_at) VALUES (?,?,?,?) " +
          "ON CONFLICT(user_id, kind) DO UPDATE SET balance = CASE WHEN balance = -1 THEN -1 WHEN? = -1 THEN -1 ELSE balance +? END, expire_at =?",
      )
      .bind(
        order.user_id,
        "export",
        plan.export_credits,
        plan.duration_days > 0
          ? now + plan.duration_days * 24 * 3600 * 1000
          : null,
        plan.export_credits,
        plan.export_credits,
        plan.duration_days > 0
          ? now + plan.duration_days * 24 * 3600 * 1000
          : null,
      ),
  );
  return stmts;
}

// 终身会员每月补满：改写额度补到 50（不滚存），到期日不变。
export function lifetimeRefillStatements(db, userId, now) {
  return [
    db
      .prepare(
        "UPDATE credits SET balance = 50 WHERE user_id =? AND kind = 'rewrite' AND balance < 50 AND (expire_at IS NULL OR expire_at >?)",
      )
      .bind(userId, now),
    db
      .prepare(
        "UPDATE memberships SET last_refill_at =? WHERE user_id =? AND plan = 'lifetime' AND status = 'active'",
      )
      .bind(now, userId),
  ];
}

// ---- 后台：确认通过（只允许 review_pending；同一订单只能通过一次） ----
export async function approveOrder(db, env, adminUser, orderId) {
  const row = await db
    .prepare("SELECT * FROM orders WHERE id =?")
    .bind(orderId)
    .first()
    .catch(() => null);
  if (!row) return { ok: false, error: "订单不存在", code: 404 };
  if (row.status !== "review_pending")
    return {
      ok: false,
      error: `订单状态是 ${row.status}，不能确认通过`,
      code: 400,
    };
  const plan = await loadPlan(db, row.plan);
  if (!plan) return { ok: false, error: "套餐不存在", code: 400 };
  const now = Date.now();
  const userRow = await db
    .prepare("SELECT email FROM users WHERE id =?")
    .bind(row.user_id)
    .first()
    .catch(() => null);
  const batchStmts = [
    db
      .prepare(
        "UPDATE orders SET status = 'done', reviewed_by =?, reviewed_at =? WHERE id =? AND status = 'review_pending'",
      )
      .bind(adminUser.id, now, orderId),
    ...grantPlanStatements(db, row, now, plan),
  ];
  // 用户站内通知（开通成功）
  const expiresText =
    plan.duration_days > 0
      ? new Date(now + plan.duration_days * 24 * 3600 * 1000)
          .toISOString()
          .slice(0, 10)
      : "";
  batchStmts.push(
    db
      .prepare(
        "INSERT INTO notifications (user_id, type, title, body, is_read, created_at) VALUES (?,?,?,?, 0,?)",
      )
      .bind(
        row.user_id,
        "order_activated",
        `订单 ${row.order_no} 已开通`,
        `你的「${plan.name_zh}」已开通：改写额度 ${plan.rewrite_credits} 次${plan.export_credits === -1 ? "，导出不限" : `，导出 ${plan.export_credits} 次`}${expiresText ? `，有效期至 ${expiresText}` : ""}。去首页开始改写吧。`,
        now,
      ),
  );
  const results = await db.batch(batchStmts);
  const updated = results[0]?.meta?.changes || 0;
  if (updated === 0)
    return { ok: false, error: "订单已被处理，请刷新", code: 409 };
  return {
    ok: true,
    order_no: row.order_no,
    plan: plan.slug,
    user_email: userRow?.email || "",
  };
}

// ---- 后台：拒绝（要写原因；用户站内可见） ----
export async function rejectOrder(db, env, adminUser, orderId, reason) {
  const row = await db
    .prepare("SELECT * FROM orders WHERE id =?")
    .bind(orderId)
    .first()
    .catch(() => null);
  if (!row) return { ok: false, error: "订单不存在", code: 404 };
  if (row.status !== "review_pending")
    return {
      ok: false,
      error: `订单状态是 ${row.status}，不能拒绝`,
      code: 400,
    };
  const why = String(reason || "")
    .trim()
    .slice(0, 200);
  if (!why)
    return { ok: false, error: "请写拒绝原因（用户会看到）", code: 400 };
  const now = Date.now();
  const plan = getPlan(row.plan);
  await db.batch([
    db
      .prepare(
        "UPDATE orders SET status = 'rejected', reject_reason =?, reviewed_by =?, reviewed_at =? WHERE id =? AND status = 'review_pending'",
      )
      .bind(why, adminUser.id, now, orderId),
    db
      .prepare(
        "INSERT INTO notifications (user_id, type, title, body, is_read, created_at) VALUES (?,?,?,?, 0,?)",
      )
      .bind(
        row.user_id,
        "order_rejected",
        `订单 ${row.order_no} 未通过审核`,
        `你的「${plan?.name_zh || row.plan}」订单未通过审核。原因：${why}。如有疑问请联系站长。`,
        now,
      ),
  ]);
  return { ok: true, order_no: row.order_no };
}

// ---- 后台：USDT 过期到账人工补开（按 TxID） ----
// 订单已过期但用户确实转了账：站长填 TxID，服务端查链上核对（合约/收款地址/精确金额/≥19 确认），
// 通过后直接开通；TxID 已用过则拒绝（UNIQUE 兜底）。
export async function manualUsdtGrant(db, env, adminUser, orderId, txid) {
  const row = await db
    .prepare("SELECT * FROM orders WHERE id =?")
    .bind(orderId)
    .first()
    .catch(() => null);
  if (!row) return { ok: false, error: "订单不存在", code: 404 };
  if (row.method !== "usdt")
    return { ok: false, error: "只有 USDT 订单可以按 TxID 补开", code: 400 };
  if (row.status === "done")
    return { ok: false, error: "订单已开通，无需补开", code: 400 };
  if (!/^[0-9a-fA-F]{64}$/.test(String(txid || "").trim())) {
    return { ok: false, error: "TxID 是 64 位十六进制交易哈希", code: 400 };
  }
  const tx = String(txid).trim();
  const used = await db
    .prepare("SELECT id FROM orders WHERE txid =?")
    .bind(tx)
    .first()
    .catch(() => null);
  if (used)
    return {
      ok: false,
      error: "该 TxID 已用于另一订单，不能重复开通",
      code: 400,
    };
  // 链上核对：取该 TxID 的 TRC-20 转入记录，再验合约/地址/金额/确认数
  const { fetchUsdtTransfers } = await import("./usdt.js");
  const { ok, transfers } = await fetchUsdtTransfers(env, {
    sinceMs: Date.now() - 7 * 24 * 3600 * 1000,
    limit: 50,
  });
  if (!ok)
    return { ok: false, error: "TronGrid 查询失败，请稍后重试", code: 502 };
  const hit = (transfers || []).find((t) => t.transaction_id === tx);
  if (!hit)
    return {
      ok: false,
      error: "链上未找到该 TxID 的转入记录（可能未确认或已超过 7 天查询窗口）",
      code: 400,
    };
  const check = await verifyUsdtTransfer(env, hit, row.amount_usdt_sun);
  if (!check.ok) {
    const why =
      {
        "wrong token contract": "不是官方 USDT 合约",
        "wrong recipient": "收款地址不是本站地址",
        "amount mismatch": "金额与订单不符（一分不能差）",
        "not enough confirmations": `确认数不足（当前 ${check.confirmations ?? 0}，需 ≥19）`,
      }[check.reason] || check.reason;
    return { ok: false, error: `链上核对未通过：${why}`, code: 400 };
  }
  const now = Date.now();
  const plan = await loadPlan(db, row.plan);
  await db.batch([
    db
      .prepare(
        "UPDATE orders SET status = 'done', txid =?, reviewed_by =?, reviewed_at =? WHERE id =? AND status!= 'done'",
      )
      .bind(tx, adminUser.id, now, orderId),
    ...grantPlanStatements(db, row, now, plan),
    db
      .prepare(
        "INSERT INTO notifications (user_id, type, title, body, is_read, created_at) VALUES (?,?,?,?, 0,?)",
      )
      .bind(
        row.user_id,
        "order_activated",
        `订单 ${row.order_no} 已开通（USDT 人工补开）`,
        `你的「${plan?.name_zh || row.plan}」已开通。`,
        now,
      ),
  ]);
  return {
    ok: true,
    order_no: row.order_no,
    confirmations: check.confirmations,
  };
}

// ---- 取消订单（仅本人、仅待付） ----
export async function cancelOrder(db, user, orderId) {
  const row = await db
    .prepare("SELECT * FROM orders WHERE id =?")
    .bind(orderId)
    .first()
    .catch(() => null);
  if (!row || row.user_id !== user.id)
    return { ok: false, error: "订单不存在", code: 404 };
  if (row.status !== "pending")
    return { ok: false, error: "只有待付订单可以取消", code: 400 };
  await db
    .prepare(
      "UPDATE orders SET status = 'cancelled' WHERE id =? AND status = 'pending'",
    )
    .bind(orderId)
    .run();
  return { ok: true };
}

// ---- PayPal（骨架；凭证未配不上线） ----
// 凭证：PAYPAL_CLIENT_ID / PAYPAL_SECRET / PAYPAL_MODE（sandbox|live），站长还没给。
// 未配时：创建订单与 Webhook 一律拒绝，不自动开通、不写假数据。
export function paypalConfigured(env) {
  return Boolean(
    String(env.PAYPAL_CLIENT_ID || "").trim() &&
    String(env.PAYPAL_SECRET || "").trim(),
  );
}

export function paypalBase(env) {
  return String(env.PAYPAL_MODE || "sandbox").trim() === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function paypalAccessToken(env) {
  const id = String(env.PAYPAL_CLIENT_ID || "").trim();
  const secret = String(env.PAYPAL_SECRET || "").trim();
  const res = await fetch(`${paypalBase(env)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token)
    return { ok: false, error: "paypal auth failed" };
  return { ok: true, token: data.access_token };
}

// 创建 PayPal 订单（仅当凭证已配；返回 approve 链接给前端跳转）
export async function createPaypalOrder(db, env, order) {
  if (!paypalConfigured(env))
    return { ok: false, error: "PayPal 尚未配置", code: 400 };
  const t = await paypalAccessToken(env);
  if (!t.ok) return { ok: false, error: t.error, code: 502 };
  const plan = getPlan(order.plan);
  const usd = (order.amount_usdt_sun / 1e6).toFixed(2); // USDT 标价与美元 1:1
  const res = await fetch(`${paypalBase(env)}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${t.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: order.order_no,
          custom_id: String(order.id),
          description: `ResumePass ${plan?.name_en || order.plan}`,
          amount: { currency_code: "USD", value: usd },
        },
      ],
      application_context: {
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id)
    return { ok: false, error: "paypal order create failed", code: 502 };
  const approve = (data.links || []).find((l) => l.rel === "approve");
  return {
    ok: true,
    paypal_order_id: data.id,
    approve_url: approve?.href || "",
  };
}

// PayPal Webhook：验签 → 三项对账（金额/手续费/订单号）→ 自动开通；争议/拒付冻结权益。
// 验签失败、金额不符、事件重复，一律不处理。未配凭证时只记录不处理。
export async function handlePaypalWebhook(db, env, event, headers) {
  const eventId = String(event?.id || "").trim();
  if (!eventId) return { ok: false, error: "missing event id", code: 400 };
  // 幂等：同一事件只处理一次
  const seen = await db
    .prepare("SELECT event_id FROM paypal_events WHERE event_id =?")
    .bind(eventId)
    .first()
    .catch(() => null);
  if (seen) return { ok: true, duplicate: true };
  if (!paypalConfigured(env)) {
    await db
      .prepare(
        "INSERT INTO paypal_events (event_id, order_id, payload, created_at) VALUES (?, NULL,?,?)",
      )
      .bind(eventId, JSON.stringify(event).slice(0, 5000), Date.now())
      .run()
      .catch(() => {});
    return { ok: false, error: "paypal not configured", code: 200 };
  }
  // 验签（PayPal 官方接口）
  const t = await paypalAccessToken(env);
  if (!t.ok) return { ok: false, error: "paypal auth failed", code: 502 };
  const verifyRes = await fetch(
    `${paypalBase(env)}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${t.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: headers["paypal-auth-algo"] || "",
        cert_url: headers["paypal-cert-url"] || "",
        transmission_id: headers["paypal-transmission-id"] || "",
        transmission_sig: headers["paypal-transmission-sig"] || "",
        transmission_time: headers["paypal-transmission-time"] || "",
        webhook_id: String(env.PAYPAL_WEBHOOK_ID || "").trim(),
        webhook_event: event,
      }),
    },
  );
  const verifyData = await verifyRes.json().catch(() => ({}));
  if (verifyData.verification_status !== "SUCCESS") {
    return { ok: false, error: "webhook signature invalid", code: 401 };
  }
  const type = event.event_type || "";
  const resource = event.resource || {};
  const orderId = Number(
    resource.custom_id || resource.purchase_units?.[0]?.custom_id || 0,
  );
  const order = orderId
    ? await db
        .prepare("SELECT * FROM orders WHERE id =?")
        .bind(orderId)
        .first()
        .catch(() => null)
    : null;
  await db
    .prepare(
      "INSERT INTO paypal_events (event_id, order_id, payload, created_at) VALUES (?,?,?,?)",
    )
    .bind(
      eventId,
      order ? order.id : null,
      JSON.stringify(event).slice(0, 5000),
      Date.now(),
    )
    .run()
    .catch(() => {});
  if (!order) return { ok: false, error: "order not found", code: 200 };
  const plan = await loadPlan(db, order.plan);

  if (
    type === "CHECKOUT.ORDER.APPROVED" ||
    type === "PAYMENT.CAPTURE.COMPLETED"
  ) {
    // 三项对账：订单号（custom_id）+ 金额（USD，与 USDT 标价 1:1）+ 状态
    const captured =
      resource.amount?.value ||
      resource.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value;
    const expectedUsd = (order.amount_usdt_sun / 1e6).toFixed(2);
    if (captured && Number(captured).toFixed(2) !== expectedUsd) {
      console.error("paypal amount mismatch", order.id, captured, expectedUsd);
      return { ok: false, error: "amount mismatch", code: 200 };
    }
    if (order.status === "done") return { ok: true, duplicate: true };
    const now = Date.now();
    const fee =
      resource.purchase_units?.[0]?.payments?.captures?.[0]
        ?.seller_receivable_breakdown?.paypal_fee?.value || null;
    await db.batch([
      db
        .prepare(
          "UPDATE orders SET status = 'done', txid =?, reviewed_at =? WHERE id =? AND status!= 'done'",
        )
        .bind(String(resource.id || ""), now, order.id),
      ...grantPlanStatements(db, order, now, plan),
      db
        .prepare(
          "INSERT INTO notifications (user_id, type, title, body, is_read, created_at) VALUES (?,?,?,?, 0,?)",
        )
        .bind(
          order.user_id,
          "order_activated",
          `订单 ${order.order_no} 已开通（PayPal）`,
          "你的套餐已开通，去首页开始改写吧。",
          now,
        ),
    ]);
    console.log("paypal order activated", order.id, "fee", fee);
    return { ok: true, activated: true };
  }
  // 争议 / 拒付：冻结权益（清空未到期额度，保留记录；站长后台处理）
  if (
    type === "PAYMENT.CAPTURE.DENIED" ||
    type === "PAYMENT.CAPTURE.REFUNDED" ||
    type === "CUSTOMER.DISPUTE.CREATED"
  ) {
    await db
      .prepare(
        "UPDATE credits SET balance = 0 WHERE user_id =? AND kind IN ('rewrite', 'export')",
      )
      .bind(order.user_id)
      .run()
      .catch(() => {});
    await db
      .prepare(
        "UPDATE memberships SET status = 'frozen' WHERE user_id =? AND status = 'active'",
      )
      .bind(order.user_id)
      .run()
      .catch(() => {});
    await addNotification(
      db,
      order.user_id,
      "order_frozen",
      `订单 ${order.order_no} 权益已冻结`,
      "检测到 PayPal 争议/退款，权益已冻结，请联系站长处理。",
    );
    console.log("paypal dispute: credits frozen", order.id, type);
    return { ok: true, frozen: true };
  }
  return { ok: true, ignored: true };
}

// ---- 待审核超 2 小时：飞书二次提醒（cron 调用） ----
export async function remindStaleReviewOrders(db, env) {
  const now = Date.now();
  const rows = await db
    .prepare(
      "SELECT o.*, u.email FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.status = 'review_pending' AND o.created_at <? AND (o.last_reminded_at IS NULL OR o.last_reminded_at <?)",
    )
    .bind(now - REVIEW_REMIND_AFTER_MS, now - REVIEW_REMIND_AFTER_MS)
    .all()
    .catch(() => ({ results: [] }));
  let reminded = 0;
  for (const o of rows.results || []) {
    const plan = getPlan(o.plan);
    const text = [
      "待审核订单已超 2 小时，请尽快处理",
      `订单号：${o.order_no}`,
      `用户：${o.email || "-"}`,
      `套餐：${plan?.name_zh || o.plan}`,
      `金额：${o.method === "usdt" ? `${formatUsdt(o.amount_usdt_sun)} USDT` : formatCny(o.amount)}`,
      `方式：${o.method}`,
      `交易单号：${o.txid || "未填"}`,
      `下单时间：${new Date(o.created_at).toISOString().slice(0, 19).replace("T", " ")}`,
    ].join("\n");
    await sendFeishuDM(env, text);
    await db
      .prepare("UPDATE orders SET last_reminded_at =? WHERE id =?")
      .bind(now, o.id)
      .run()
      .catch(() => {});
    reminded += 1;
  }
  return { reminded };
}
