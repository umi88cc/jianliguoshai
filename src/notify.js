// 简历过筛 — 通知中心（第 3 周，规划 §6 / §7）
// 渠道优先级与升级规则：
// - 国内订单“我已付款”：飞书私信通知站长（主渠道）；飞书失败 → Telegram + 站内强提醒。
// - 国外 USDT 到账：Telegram 通知站长（主渠道）；Telegram 未配 → 飞书兜底。
// - 站内通知（notifications 表）：所有开通/拒绝/到期提醒都写一条，用户在会员中心可见。
// 密钥与 Token 只存 Worker secret；Telegram 接收方 chat_id 存 ai_rules（不是密钥，放 D1 无妨）。

import { sendFeishuDM } from "./feishu.js";

// ---- Telegram（Bot API 直调，不引第三方库） ----
export async function sendTelegramDM(env, text) {
  const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token) return { ok: false, error: "telegram bot token not configured" };
  const chatId = await getTelegramOwnerChatId(env);
  if (!chatId)
    return { ok: false, error: "telegram owner chat not configured" };
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: String(text || "").slice(0, 4000),
        }),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok)
      return {
        ok: false,
        error: `telegram send failed (${data.error_code || res.status}): ${data.description || ""}`,
      };
    return { ok: true, messageId: data.result?.message_id || "" };
  } catch (e) {
    return { ok: false, error: `telegram send failed: ${e?.message || e}` };
  }
}

// Telegram 接收方 chat_id：优先 Worker secret，其次 D1 ai_rules（后台绑定入口写入）。
export async function getTelegramOwnerChatId(env) {
  const fromSecret = String(env.TELEGRAM_OWNER_CHAT_ID || "").trim();
  if (fromSecret) return fromSecret;
  try {
    const row = await env.DB.prepare(
      "SELECT value FROM ai_rules WHERE key = 'telegram_owner_chat_id'",
    )
      .bind()
      .first();
    return row ? String(row.value || "").trim() : "";
  } catch {
    return "";
  }
}

// 拉取机器人最近收到的对话（站长先给机器人发 /start，再点“拉取”绑定）。
// 返回去重后的 [{ chat_id, title}]，title 取 username / first_name。
export async function listTelegramChats(env) {
  const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!token)
    return { ok: false, error: "telegram bot token not configured", chats: [] };
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates?limit=50&timeout=0`,
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok)
      return {
        ok: false,
        error: `telegram getUpdates failed (${data.error_code || res.status})`,
        chats: [],
      };
    const seen = new Map();
    for (const u of data.result || []) {
      const chat =
        u.message?.chat || u.my_chat_member?.chat || u.channel_post?.chat;
      if (!chat || !chat.id) continue;
      const title = chat.username
        ? `@${chat.username}`
        : [chat.first_name, chat.last_name].filter(Boolean).join(" ") ||
          chat.title ||
          String(chat.id);
      if (!seen.has(chat.id))
        seen.set(chat.id, {
          chat_id: String(chat.id),
          title,
          type: chat.type || "",
        });
    }
    return { ok: true, chats: [...seen.values()] };
  } catch (e) {
    return {
      ok: false,
      error: `telegram getUpdates failed: ${e?.message || e}`,
      chats: [],
    };
  }
}

// ---- 站内通知（notifications 表） ----
export async function addNotification(db, userId, type, title, body) {
  if (!userId) return false;
  try {
    await db
      .prepare(
        "INSERT INTO notifications (user_id, type, title, body, is_read, created_at) VALUES (?,?,?,?, 0,?)",
      )
      .bind(
        userId,
        type,
        String(title || "").slice(0, 200),
        String(body || "").slice(0, 2000),
        Date.now(),
      )
      .run();
    return true;
  } catch (e) {
    console.error("notification insert failed", e);
    return false;
  }
}

// 按邮箱找站长用户 id（用于站内强提醒）；找不到返回 null（不阻塞主流程）。
export async function findAdminUserId(db, env) {
  const adminEmail = String(env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
  if (!adminEmail) return null;
  try {
    const row = await db
      .prepare("SELECT id FROM users WHERE email =?")
      .bind(adminEmail)
      .first();
    return row ? row.id : null;
  } catch {
    return null;
  }
}

// ---- 站长通知（带升级）：按 channels 顺序尝试，全部失败则写站内强提醒 ----
// channels: ['feishu'] | ['telegram'] | ['telegram','feishu'] | ['feishu','telegram']
// 返回 { ok, channel, errors}；ok=false 时已写站内通知兜底（若能找到站长用户）。
export async function notifyOwner(env, db, { text, channels }) {
  const list =
    Array.isArray(channels) && channels.length ? channels : ["feishu"];
  const errors = [];
  for (const ch of list) {
    let r;
    if (ch === "feishu") r = await sendFeishuDM(env, text);
    else if (ch === "telegram") r = await sendTelegramDM(env, text);
    else continue;
    if (r.ok) return { ok: true, channel: ch, errors };
    errors.push(`${ch}: ${r.error}`);
    console.error("owner notify failed via", ch, r.error);
  }
  // 全部渠道失败：写站内强提醒（站长下次进后台即见）
  const adminId = await findAdminUserId(db, env);
  if (adminId)
    await addNotification(
      db,
      adminId,
      "owner_alert",
      "通知渠道全部失败，请检查",
      `以下通知未能发出（${errors.join("；")}）：\n${String(text || "").slice(0, 500)}`,
    );
  return { ok: false, channel: null, errors };
}

// ---- 业务通知文案 ----

// 国内订单“我已付款”→ 站长（飞书主渠道）
export function domesticOrderNoticeText(o) {
  return [
    "新订单待确认",
    `订单号：${o.order_no}`,
    `用户：${o.email || "-"}`,
    `套餐：${o.plan_name}`,
    `金额：${o.amount_text}`,
    `方式：${o.method_text}`,
    `交易单号：${o.txid || "未填"}`,
    o.screenshot_url ? `付款截图：${o.screenshot_url}` : "付款截图：未上传",
    "请在后台核对账单后点「确认通过」。AI 绝不自动开通国内订单。",
  ].join("\n");
}

// 国外 USDT 到账待确认 → 站长（Telegram 主渠道，飞书兜底）
export function usdtArrivedNoticeText(o) {
  return [
    "USDT payment received — needs review",
    `Order: ${o.order_no}`,
    `User: ${o.email || "-"}`,
    `Plan: ${o.plan_name}`,
    `Amount: ${o.amount_text} (exact match on-chain)`,
    `TxID: ${o.txid || "-"}`,
    `Confirmations: ${o.confirmations ?? "-"}`,
    "Please review in admin and click Approve to activate. Auto-release is OFF.",
  ].join("\n");
}

// 订单开通 → 用户（站内通知）
export function orderActivatedUserText(o) {
  return {
    title: `订单 ${o.order_no} 已开通`,
    body: `你的「${o.plan_name}」已开通：改写额度 ${o.rewrite_credits} 次${o.export_unlimited ? "，导出不限" : `，导出 ${o.export_credits} 次`}${o.expires_text ? `，有效期至 ${o.expires_text}` : ""}。去首页开始改写吧。`,
  };
}

// 订单拒绝 → 用户（站内通知，带原因）
export function orderRejectedUserText(o) {
  return {
    title: `订单 ${o.order_no} 未通过审核`,
    body: `你的「${o.plan_name}」订单未通过审核。原因：${o.reject_reason || "未注明"}。如有疑问请联系站长（微信/QQ 在首页）。付款金额如有问题请凭交易单号联系站长核对。`,
  };
}
