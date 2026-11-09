// 简历过筛 ResumePass — Cloudflare Worker 入口（第 1 周：首页 + ATS 评分 + SEO 基础）
// 语言判断优先级：手动选择 Cookie > Accept-Language > CF-IPCountry > 默认中文；
// 只对根路径做 302 跳转；/en/ 页面本身不跳转；爬虫不按 IP 跳。
import { scoreResume } from "./ats.js";
import { homePage } from "./pages.js";
import { pollUsdtPayments, usdtPayInfo } from "./usdt.js";
import { getFeishuConfig } from "./feishu.js";
import {
  sendLoginCode,
  verifyLoginCode,
  getSessionUser,
  logoutSession,
  isAdmin,
  sessionCookie,
  clearSessionCookie,
  getCredits,
  deductCredit,
  grantCredits,
} from "./auth.js";
import {
  AI_PROVIDER_URLS,
  listModels,
  encryptModelKey,
  keyHash,
  maskKey,
  testModel,
  getRules,
  setRule,
  restoreRule,
  listRuleVersions,
} from "./ai.js";
import { deterministicRewrite, applyRewriteToText } from "./rewrite.js";
import {
  submitTask,
  getTask,
  processTask,
  processPendingTasks,
  publicTask,
} from "./tasks.js";
import { adminPage } from "./admin.js";
import { orderPage, memberPage, templatesPage, resumesPage } from "./shop.js";
import { adminOrdersPage } from "./adminOrders.js";
import {
  parseResumeText,
  orderSectionsForTemplate,
  resumeBodyHtml,
  fileBaseName,
  printPageHtml,
  docFileHtml,
  newExportToken,
  isTokenValid,
  EXPORT_TOKEN_TTL_MS,
} from "./export.js";
import { getTemplate, templatesForLang } from "./templates.js";
import {
  createOrder,
  markPaid,
  cancelOrder,
  approveOrder,
  rejectOrder,
  manualUsdtGrant,
  createPaypalOrder,
  handlePaypalWebhook,
  paypalConfigured,
  remindStaleReviewOrders,
  publicOrder,
  loadPlan,
  grantPlanStatements,
  lifetimeRefillStatements,
} from "./orders.js";
import { getPlan, formatCny, formatUsdt, statusLabel } from "./plans.js";
import {
  notifyOwner,
  addNotification,
  usdtArrivedNoticeText,
  listTelegramChats,
  getTelegramOwnerChatId,
} from "./notify.js";

const GUEST_SCORE_PER_DAY = 1;

function baseUrl(req) {
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN",
    // 首版 JS 为内联脚本，CSP 暂放宽 script-src 'unsafe-inline'；JS 外置后再收紧
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'self' https://challenges.cloudflare.com; frame-ancestors 'self'",
  };
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...securityHeaders(),
    },
  });
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...securityHeaders(),
      ...extraHeaders,
    },
  });
}

function detectLang(req) {
  const cookie = req.headers.get("Cookie") || "";
  const m = cookie.match(/(?:^|;\s*)locale=(zh|en)/);
  if (m) return m[1];
  const al = (req.headers.get("Accept-Language") || "").toLowerCase();
  if (al.startsWith("en")) return "en";
  if (al.startsWith("zh")) return "zh";
  const country = req.cf?.country || "";
  if (country && !["CN", "HK", "TW", "MO"].includes(country)) return "en";
  return "zh";
}

function dayString() {
  return new Date().toISOString().slice(0, 10);
}

// IndexNow 密钥（Bing/Yandex 收录验证用）：这是公开的验证串，不是密码，
// 按规范放在 /{key}.txt 公开返回。换 key 要同步改提交时的 key。
const INDEXNOW_KEY = "4d4a912c68e1999a05e29741ba00e981";

// 访问计数（推广落地）：首页/模板页/订单页每次打开记 1 次；
// 只计次数，不记 IP、不记个人信息；一天一页一行，写操作极少。
async function recordPageView(db, page) {
  const day = dayString();
  await db
    .prepare(
      "INSERT INTO page_views (day, page, count) VALUES (?, ?, 1) ON CONFLICT(day, page) DO UPDATE SET count = count + 1",
    )
    .bind(day, page)
    .run()
    .catch(() => {});
}

async function checkGuestLimit(env, ip) {
  const key = `rate:${ip}:${dayString()}`;
  try {
    const row = await env.DB.prepare(
      "SELECT count FROM rate_limits WHERE key = ?",
    )
      .bind(key)
      .first();
    const count = row ? row.count : 0;
    if (count >= GUEST_SCORE_PER_DAY) return { allowed: false, count };
    await env.DB.prepare(
      "INSERT INTO rate_limits (key, count, updated_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1, updated_at = ?",
    )
      .bind(key, Date.now(), Date.now())
      .run();
    return { allowed: true, count: count + 1 };
  } catch (e) {
    // D1 异常时放行（评分本身零 AI 成本，不因限流表故障挡住正常用户）
    console.error("rate limit check failed", e);
    return { allowed: true, count: 0, degraded: true };
  }
}

function robotsTxt(base) {
  return `User-agent: *
Allow: /
Allow: /en/
Disallow: /admin
Disallow: /api/
Disallow: /me
Disallow: /orders/

Sitemap: ${base}/sitemap.xml
`;
}

function sitemapIndex(base) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${base}/sitemap-zh.xml</loc></sitemap>
  <sitemap><loc>${base}/sitemap-en.xml</loc></sitemap>
</sitemapindex>`;
}

function sitemapLang(base, lang) {
  const urls =
    lang === "zh"
      ? [`${base}/`, `${base}/templates`]
      : [`${base}/en/`, `${base}/en/templates`];
  const lastmod = dayString();
  const alt = (u) =>
    u === `${base}/` || u === `${base}/en/`
      ? `<xhtml:link rel="alternate" hreflang="zh-CN" href="${base}/"/><xhtml:link rel="alternate" hreflang="en" href="${base}/en/"/><xhtml:link rel="alternate" hreflang="x-default" href="${base}/"/>`
      : `<xhtml:link rel="alternate" hreflang="zh-CN" href="${base}/templates"/><xhtml:link rel="alternate" hreflang="en" href="${base}/en/templates"/><xhtml:link rel="alternate" hreflang="x-default" href="${base}/templates"/>`;
  const priority = (u) => (u.endsWith("/templates") ? "0.8" : "1.0");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>${priority(u)}</priority>${alt(u)}</url>`).join("\n")}
</urlset>`;
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#1668B4"/><text x="32" y="42" font-size="28" font-weight="700" fill="#fff" text-anchor="middle" font-family="sans-serif">简</text></svg>`;

// R2 图片 key（扁平单段命名，/img/:key 只认单段 key，带斜杠会 404）：
// - 咨询二维码（中文版联系方式，首页展示）：wechat-consult-qr.png / qq-consult-qr.png
// - 商户收款码（订单页展示，第 2 周接支付时用）：wechat-merchant-pay-qr.png / alipay-pay-qr.png
// - USDT 收款地址：已设为 Worker secret USDT_RECEIVE_ADDRESS（订单页从 secret 读，见 src/usdt.js）
// - Telegram 机器人 Token / 飞书配置：见 Worker secrets TELEGRAM_BOT_TOKEN / FEISHU_*，只存服务器侧
const QR_KEYS = {
  wechatConsult: "wechat-consult-qr.png",
  qqConsult: "qq-consult-qr.png",
  wechatPay: "wechat-merchant-pay-qr.png",
  alipayPay: "alipay-pay-qr.png",
};

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;

    // ---------- 登录 / 会话 ----------
    if (path === "/api/auth/send-code" && req.method === "POST") {
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "请求体不是合法 JSON" }, 400);
      }
      const ip = req.headers.get("CF-Connecting-IP") || "unknown";
      const r = await sendLoginCode(env.DB, env, body.email, ip);
      if (!r.ok) return json({ error: r.error }, 400);
      return json({
        ok: true,
        sent: r.sent,
        devMode: !!r.devMode,
        code: r.devMode ? r.code : undefined,
      });
    }
    if (path === "/api/auth/verify-code" && req.method === "POST") {
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "请求体不是合法 JSON" }, 400);
      }
      const r = await verifyLoginCode(env.DB, body.email, body.code);
      if (!r.ok) return json({ error: r.error }, 400);
      return json({ ok: true, user: r.user }, 200, {
        "Set-Cookie": sessionCookie(r.token),
      });
    }
    if (path === "/api/auth/logout" && req.method === "POST") {
      await logoutSession(env.DB, req);
      return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie() });
    }
    if (path === "/api/auth/me" && req.method === "GET") {
      const user = await getSessionUser(env.DB, req);
      if (!user) return json({ ok: true, user: null });
      const credits = await getCredits(env.DB, user.id, "rewrite");
      return json({
        ok: true,
        user: { id: user.id, email: user.email },
        isAdmin: isAdmin(env, user),
        credits,
      });
    }

    // ---------- AI 改写 / 求职信 / 互译（须登录；扣 1 个 rewrite 额度） ----------
    if (
      (path === "/api/rewrite" ||
        path === "/api/cover-letter" ||
        path === "/api/translate") &&
      req.method === "POST"
    ) {
      const user = await getSessionUser(env.DB, req);
      if (!user) return json({ error: "请先登录（邮箱验证码登录）" }, 401);
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "请求体不是合法 JSON" }, 400);
      }
      const lang = body.lang === "en" ? "en" : "zh";
      const type =
        path === "/api/rewrite"
          ? "rewrite"
          : path === "/api/cover-letter"
            ? "cover_letter"
            : "translate";
      if (type === "rewrite") {
        const resumeText = String(body.resumeText || "").trim();
        const jdText = String(body.jdText || "").trim();
        if (!resumeText) return json({ error: "请先粘贴简历文本" }, 400);
        if (resumeText.length > 20000 || jdText.length > 20000)
          return json({ error: "文本过长（最多 20000 字）" }, 400);
        const intensity = ["conservative", "standard", "aggressive"].includes(
          body.intensity,
        )
          ? body.intensity
          : "standard";
        const credits = await getCredits(env.DB, user.id, "rewrite");
        if (credits.balance < 1) {
          // 免费试看：规则改写前 3 条（不扣额度、不建任务）
          const preview = deterministicRewrite(
            resumeText,
            jdText,
            lang,
            intensity,
          );
          return json({
            preview: true,
            message:
              lang === "en"
                ? "Free preview: first 3 bullets. Buy a rewrite (from $1.99) to see the full version."
                : "免费试看：前 3 条改写。购买后（9.9 元/次起）看完整版。",
            summary: preview.summary,
            bullets: preview.bullets.slice(0, 3),
            missing_keywords: preview.missing_keywords,
            score_tips: preview.score_tips,
          });
        }
        const sub = await submitTask(env.DB, user.id, "rewrite", {
          resumeText,
          jdText,
          lang,
          intensity,
          resumeId: body.resumeId || null,
        });
        if (!sub.ok)
          return json(
            { error: sub.error },
            sub.code === "no_credit" ? 402 : 400,
          );
        if (ctx?.waitUntil) ctx.waitUntil(processTask(env, env.DB, sub.taskId));
        else await processTask(env, env.DB, sub.taskId);
        return json({ ok: true, taskId: sub.taskId });
      }
      if (type === "cover_letter") {
        const resumeText = String(body.resumeText || "").trim();
        const jdText = String(body.jdText || "").trim();
        const company = String(body.company || "")
          .trim()
          .slice(0, 100);
        if (!resumeText) return json({ error: "请先粘贴简历文本" }, 400);
        if (resumeText.length > 20000 || jdText.length > 20000)
          return json({ error: "文本过长（最多 20000 字）" }, 400);
        const sub = await submitTask(env.DB, user.id, "cover_letter", {
          resumeText,
          jdText,
          company,
          lang,
        });
        if (!sub.ok)
          return json(
            { error: sub.error },
            sub.code === "no_credit" ? 402 : 400,
          );
        if (ctx?.waitUntil) ctx.waitUntil(processTask(env, env.DB, sub.taskId));
        else await processTask(env, env.DB, sub.taskId);
        return json({ ok: true, taskId: sub.taskId });
      }
      // translate
      const text = String(body.text || "").trim();
      if (!text) return json({ error: "请先粘贴要翻译的文本" }, 400);
      if (text.length > 20000)
        return json({ error: "文本过长（最多 20000 字）" }, 400);
      const sub = await submitTask(env.DB, user.id, "translate", {
        text,
        lang,
      });
      if (!sub.ok)
        return json({ error: sub.error }, sub.code === "no_credit" ? 402 : 400);
      if (ctx?.waitUntil) ctx.waitUntil(processTask(env, env.DB, sub.taskId));
      else await processTask(env, env.DB, sub.taskId);
      return json({ ok: true, taskId: sub.taskId });
    }

    // ---------- 任务状态轮询 ----------
    if (path.startsWith("/api/tasks/") && req.method === "GET") {
      const user = await getSessionUser(env.DB, req);
      if (!user) return json({ error: "请先登录" }, 401);
      const taskId = Number(path.slice("/api/tasks/".length));
      if (!Number.isFinite(taskId)) return json({ error: "任务不存在" }, 404);
      const task = await getTask(env.DB, user.id, taskId);
      if (!task) return json({ error: "任务不存在" }, 404);
      if (task.forbidden) return json({ error: "无权查看该任务" }, 403);
      return json(publicTask(task));
    }

    // ---------- 逐条采纳：把接受的改写拼成新简历版本（parent_id 溯源） ----------
    if (
      path.startsWith("/api/rewrites/") &&
      path.endsWith("/apply") &&
      req.method === "POST"
    ) {
      const user = await getSessionUser(env.DB, req);
      if (!user) return json({ error: "请先登录" }, 401);
      const rewriteId = Number(
        path.slice("/api/rewrites/".length, -"/apply".length),
      );
      if (!Number.isFinite(rewriteId))
        return json({ error: "改写记录不存在" }, 404);
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "请求体不是合法 JSON" }, 400);
      }
      const row = await env.DB.prepare("SELECT * FROM rewrites WHERE id = ?")
        .bind(rewriteId)
        .first()
        .catch(() => null);
      if (!row || row.user_id !== user.id)
        return json({ error: "改写记录不存在" }, 404);
      const task = row.task_id
        ? await env.DB.prepare("SELECT payload FROM tasks WHERE id = ?")
            .bind(row.task_id)
            .first()
            .catch(() => null)
        : null;
      let originalText = "";
      try {
        originalText = JSON.parse(task?.payload || "{}").resumeText || "";
      } catch {
        originalText = "";
      }
      if (!originalText) return json({ error: "原文已丢失，无法采纳" }, 400);
      let result;
      try {
        result = JSON.parse(row.result_json || "{}");
      } catch {
        return json({ error: "改写结果已损坏" }, 400);
      }
      const accepted = Array.isArray(body.accepted)
        ? body.accepted.map(Number).filter((n) => Number.isFinite(n))
        : null;
      const text = applyRewriteToText(
        originalText,
        result.bullets || [],
        accepted,
      );
      const now = Date.now();
      const r = await env.DB.prepare(
        "INSERT INTO resumes (user_id, parent_id, title, raw_text, lang, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          user.id,
          row.resume_id || null,
          `改写版-${new Date(now).toISOString().slice(0, 10)}`,
          text,
          row.lang || "zh",
          now,
          now,
        )
        .run();
      return json({ ok: true, resumeId: r.meta.last_row_id, text });
    }

    // ---------- 我的简历：历史版本列表 / 查看 / 删除（第 4 周） ----------
    if (path === "/api/resumes" && req.method === "GET") {
      const user = await getSessionUser(env.DB, req);
      if (!user) return json({ error: "请先登录" }, 401);
      const rows = await env.DB.prepare(
        "SELECT id, title, lang, parent_id, created_at FROM resumes WHERE user_id = ? ORDER BY id DESC LIMIT 50",
      )
        .bind(user.id)
        .all()
        .catch(() => ({ results: [] }));
      return json({ ok: true, resumes: rows.results || [] });
    }
    if (path.startsWith("/api/resumes/") && req.method === "GET") {
      const user = await getSessionUser(env.DB, req);
      if (!user) return json({ error: "请先登录" }, 401);
      const id = Number(path.slice("/api/resumes/".length));
      if (!Number.isFinite(id)) return json({ error: "简历不存在" }, 404);
      const row = await env.DB.prepare("SELECT * FROM resumes WHERE id = ?")
        .bind(id)
        .first()
        .catch(() => null);
      if (!row || row.user_id !== user.id)
        return json({ error: "简历不存在" }, 404);
      return json({
        ok: true,
        resume: {
          id: row.id,
          title: row.title,
          lang: row.lang,
          parent_id: row.parent_id,
          raw_text: row.raw_text,
          created_at: row.created_at,
        },
      });
    }
    if (path.startsWith("/api/resumes/") && req.method === "DELETE") {
      const user = await getSessionUser(env.DB, req);
      if (!user) return json({ error: "请先登录" }, 401);
      const id = Number(path.slice("/api/resumes/".length));
      if (!Number.isFinite(id)) return json({ error: "简历不存在" }, 404);
      const row = await env.DB.prepare("SELECT * FROM resumes WHERE id = ?")
        .bind(id)
        .first()
        .catch(() => null);
      if (!row || row.user_id !== user.id)
        return json({ error: "简历不存在" }, 404);
      // 删除即真删：简历 + 它的改写存档 + 评分记录一起删
      await env.DB.prepare("DELETE FROM resumes WHERE id = ?")
        .bind(id)
        .run();
      await env.DB.prepare("DELETE FROM rewrites WHERE resume_id = ?")
        .bind(id)
        .run();
      await env.DB.prepare("DELETE FROM analyses WHERE resume_id = ?")
        .bind(id)
        .run();
      return json({ ok: true });
    }

    // ---------- 导出：扣 1 次 export 额度 → 发 30 分钟 token（第 4 周，规划 §9） ----------
    if (path === "/api/export" && req.method === "POST") {
      const user = await getSessionUser(env.DB, req);
      if (!user) return json({ error: "请先登录" }, 401);
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "请求体不是合法 JSON" }, 400);
      }
      const resumeId = Number(body.resumeId);
      const format = body.format === "doc" ? "doc" : "pdf";
      if (!Number.isFinite(resumeId))
        return json({ error: "简历不存在" }, 404);
      const row = await env.DB.prepare("SELECT * FROM resumes WHERE id = ?")
        .bind(resumeId)
        .first()
        .catch(() => null);
      if (!row || row.user_id !== user.id)
        return json({ error: "简历不存在" }, 404);
      const templateId = String(body.templateId || "");
      const template = templateId ? getTemplate(templateId) : null;
      if (templateId && !template)
        return json({ error: "模板不存在" }, 400);
      // 扣额度：-1（包月/终身）不限不扣；余额不足 → 402，提示购买
      const ok = await deductCredit(env.DB, user.id, "export", 1);
      if (!ok)
        return json(
          {
            error: "导出次数已用完，请购买套餐（单次 9.9 元起，含 1 次导出；包月/终身导出不限）",
            code: "no_export_credits",
          },
          402,
        );
      const token = newExportToken();
      const now = Date.now();
      await env.DB.prepare(
        "INSERT INTO export_tokens (token, user_id, resume_id, format, template_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          token,
          user.id,
          resumeId,
          format,
          template ? template.id : null,
          now,
          now + EXPORT_TOKEN_TTL_MS,
        )
        .run();
      return json({ ok: true, token, url: `/export/${token}` });
    }

    // ---------- 导出渲染：PDF 打印页 / Word .doc 下载（token 鉴权，30 分钟有效） ----------
    if (path.startsWith("/export/") && req.method === "GET") {
      const token = path.slice("/export/".length);
      if (!token || token.includes("/") || token.length !== 32) {
        return new Response("Not Found", {
          status: 404,
          headers: securityHeaders(),
        });
      }
      const tok = await env.DB.prepare(
        "SELECT * FROM export_tokens WHERE token = ?",
      )
        .bind(token)
        .first()
        .catch(() => null);
      if (!isTokenValid(tok)) {
        return new Response(
          "导出链接已过期（30 分钟有效），请回到“我的简历”重新导出。",
          { status: 404, headers: securityHeaders() },
        );
      }
      const resume = await env.DB.prepare(
        "SELECT * FROM resumes WHERE id = ? AND user_id = ?",
      )
        .bind(tok.resume_id, tok.user_id)
        .first()
        .catch(() => null);
      if (!resume) {
        return new Response("Not Found", {
          status: 404,
          headers: securityHeaders(),
        });
      }
      const lang = resume.lang === "en" ? "en" : "zh";
      const template = tok.template_id
        ? getTemplate(tok.template_id)
        : getTemplate(lang === "en" ? "en-classic" : "zh-classic");
      const parsed = parseResumeText(resume.raw_text, lang);
      const bodyHtml = resumeBodyHtml(parsed, template, lang);
      const fileBase = fileBaseName(parsed, lang);
      if (tok.format === "doc") {
        const doc = docFileHtml({ title: resume.title, bodyHtml });
        const asciiName = "resume.doc";
        return new Response(doc, {
          headers: {
            "Content-Type": "application/msword; charset=utf-8",
            "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileBase + ".doc")}`,
            ...securityHeaders(),
          },
        });
      }
      return new Response(
        printPageHtml({ title: resume.title, fileBase, bodyHtml, lang }),
        {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            ...securityHeaders(),
          },
        },
      );
    }

    // ---------- 后台：AI 模型配置 ----------
    if (path === "/admin" || path === "/admin/") {
      return new Response(null, {
        status: 302,
        headers: { Location: "/admin/ai", ...securityHeaders() },
      });
    }
    if (path === "/admin/ai" && req.method === "GET") {
      return html(adminPage());
    }
    if (path === "/api/admin/ai/models" && req.method === "GET") {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user))
        return json({ error: "只有站长能进后台" }, 403);
      const models = await listModels(env.DB);
      const today = new Date().toISOString().slice(0, 10);
      for (const m of models) {
        const u = await env.DB.prepare(
          "SELECT count FROM ai_usage WHERE model_id = ? AND day = ?",
        )
          .bind(m.id, today)
          .first()
          .catch(() => null);
        m.used_today = u ? u.count : 0;
      }
      return json({ ok: true, models });
    }
    if (path === "/api/admin/ai/models" && req.method === "POST") {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user))
        return json({ error: "只有站长能进后台" }, 403);
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "请求体不是合法 JSON" }, 400);
      }
      const provider = String(body.provider || "").trim();
      const baseUrl =
        String(body.base_url || "").trim() || AI_PROVIDER_URLS[provider] || "";
      const name = String(body.name || "").trim();
      const model = String(body.model || "").trim();
      const sortOrder = Number(body.sort_order) || 99;
      const dailyLimit = Math.max(
        1,
        Math.min(10000, Number(body.daily_limit) || 50),
      );
      if (!provider || !baseUrl || !name || !model)
        return json({ error: "提供商、API 地址、显示名、模型名都要填" }, 400);
      const now = Date.now();
      // Key：传了才处理；互斥校验（一个 Key 不能绑两个模型）
      let keyPatch = {};
      if (body.key !== undefined && String(body.key || "").trim()) {
        const plain = String(body.key).trim();
        const hash = await keyHash(plain);
        const clash = await env.DB.prepare(
          "SELECT id, name FROM ai_models WHERE key_hash = ? AND id != ?",
        )
          .bind(hash, body.id || 0)
          .first()
          .catch(() => null);
        if (clash)
          return json(
            {
              error: `该 Key 已绑定到「${clash.name}」，一个 Key 不能绑两个模型`,
            },
            400,
          );
        const enc = await encryptModelKey(env, plain);
        if (!enc.ok) return json({ error: enc.error }, 400);
        keyPatch = {
          key_enc: enc.enc,
          key_hash: hash,
          key_last4: maskKey(plain).slice(4),
          key_configured: 1,
          key_ref: null,
        };
      }
      if (body.id) {
        const row = await env.DB.prepare(
          "SELECT id FROM ai_models WHERE id = ?",
        )
          .bind(body.id)
          .first()
          .catch(() => null);
        if (!row) return json({ error: "模型不存在" }, 404);
        const sets = [
          "sort_order = ?",
          "provider = ?",
          "base_url = ?",
          "name = ?",
          "model = ?",
          "price_text = ?",
          "speed_text = ?",
          "limit_text = ?",
          "daily_limit = ?",
          "updated_at = ?",
        ];
        const vals = [
          sortOrder,
          provider,
          baseUrl,
          name,
          model,
          String(body.price_text || ""),
          String(body.speed_text || ""),
          String(body.limit_text || ""),
          dailyLimit,
          now,
        ];
        for (const [k, v] of Object.entries(keyPatch)) {
          sets.push(`${k} = ?`);
          vals.push(v);
        }
        vals.push(body.id);
        await env.DB.prepare(
          `UPDATE ai_models SET ${sets.join(", ")} WHERE id = ?`,
        )
          .bind(...vals)
          .run();
        return json({ ok: true, id: body.id });
      }
      const r = await env.DB.prepare(
        "INSERT INTO ai_models (sort_order, provider, base_url, name, model, key_ref, key_enc, key_hash, key_last4, key_configured, is_active, price_text, speed_text, limit_text, daily_limit, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)",
      )
        .bind(
          sortOrder,
          provider,
          baseUrl,
          name,
          model,
          keyPatch.key_ref ?? null,
          keyPatch.key_enc ?? null,
          keyPatch.key_hash ?? null,
          keyPatch.key_last4 ?? "****",
          keyPatch.key_configured ?? 0,
          String(body.price_text || ""),
          String(body.speed_text || ""),
          String(body.limit_text || ""),
          dailyLimit,
          now,
          now,
        )
        .run();
      return json({ ok: true, id: r.meta.last_row_id });
    }
    if (
      path.startsWith("/api/admin/ai/models/") &&
      path.endsWith("/test") &&
      req.method === "POST"
    ) {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user))
        return json({ error: "只有站长能进后台" }, 403);
      const id = Number(
        path.slice("/api/admin/ai/models/".length, -"/test".length),
      );
      if (!Number.isFinite(id)) return json({ error: "模型不存在" }, 404);
      const r = await testModel(env, env.DB, id);
      return json(r, r.ok ? 200 : 400);
    }
    if (
      path.startsWith("/api/admin/ai/models/") &&
      path.endsWith("/toggle") &&
      req.method === "POST"
    ) {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user))
        return json({ error: "只有站长能进后台" }, 403);
      const id = Number(
        path.slice("/api/admin/ai/models/".length, -"/toggle".length),
      );
      if (!Number.isFinite(id)) return json({ error: "模型不存在" }, 404);
      const row = await env.DB.prepare("SELECT * FROM ai_models WHERE id = ?")
        .bind(id)
        .first()
        .catch(() => null);
      if (!row) return json({ error: "模型不存在" }, 404);
      if (!row.is_active) {
        // 启用：必须配好 Key 且测试通过
        if (!row.key_configured)
          return json({ error: "该模型尚未配 Key，先填 Key 保存" }, 400);
        if (row.last_test_ok !== 1)
          return json({ error: "该模型尚未测试通过，先点“测试”" }, 400);
        await env.DB.prepare(
          "UPDATE ai_models SET is_active = 1, updated_at = ? WHERE id = ?",
        )
          .bind(Date.now(), id)
          .run();
        return json({ ok: true, is_active: 1 });
      }
      await env.DB.prepare(
        "UPDATE ai_models SET is_active = 0, updated_at = ? WHERE id = ?",
      )
        .bind(Date.now(), id)
        .run();
      return json({ ok: true, is_active: 0 });
    }
    if (path === "/api/admin/ai/rules" && req.method === "GET") {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user))
        return json({ error: "只有站长能进后台" }, 403);
      const r = await getRules(env.DB);
      return json({ ok: true, ...r });
    }
    if (path === "/api/admin/ai/rules" && req.method === "POST") {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user))
        return json({ error: "只有站长能进后台" }, 403);
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "请求体不是合法 JSON" }, 400);
      }
      const rules = body.rules || {};
      const saved = {};
      for (const [k, v] of Object.entries(rules)) {
        const r = await setRule(env.DB, k, String(v ?? ""));
        if (!r.ok) return json({ error: r.error }, 400);
        saved[k] = r.version;
      }
      return json({ ok: true, versions: saved });
    }
    if (
      path.startsWith("/api/admin/ai/rules/") &&
      path.endsWith("/restore") &&
      req.method === "POST"
    ) {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user))
        return json({ error: "只有站长能进后台" }, 403);
      const key = path.slice("/api/admin/ai/rules/".length, -"/restore".length);
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "请求体不是合法 JSON" }, 400);
      }
      const r = await restoreRule(env.DB, key, Number(body.version));
      return json(r, r.ok ? 200 : 400);
    }
    if (path === "/api/admin/ai/status" && req.method === "GET") {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user))
        return json({ error: "只有站长能进后台" }, 403);
      const models = await listModels(env.DB);
      const today = new Date().toISOString().slice(0, 10);
      for (const m of models) {
        const u = await env.DB.prepare(
          "SELECT count FROM ai_usage WHERE model_id = ? AND day = ?",
        )
          .bind(m.id, today)
          .first()
          .catch(() => null);
        m.used_today = u ? u.count : 0;
      }
      const pending = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM tasks WHERE status = 'pending'",
      )
        .first()
        .catch(() => ({ n: 0 }));
      const feishu = getFeishuConfig(env);
      return json({
        ok: true,
        models,
        pendingTasks: pending?.n || 0,
        feishuConfigured: feishu.configured,
      });
    }
    // ---------- 访问统计（推广落地）：只计次数，不记 IP、不记个人信息 ----------
    if (path === "/api/admin/stats/views" && req.method === "GET") {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user))
        return json({ error: "只有站长能进后台" }, 403);
      const totalRow = await env.DB.prepare(
        "SELECT COALESCE(SUM(count), 0) AS t FROM page_views",
      )
        .first()
        .catch(() => ({ t: 0 }));
      const rows = await env.DB.prepare(
        "SELECT day, SUM(count) AS count FROM page_views GROUP BY day ORDER BY day DESC LIMIT 7",
      )
        .all()
        .catch(() => ({ results: [] }));
      const byDay = new Map((rows.results || []).map((r) => [r.day, r.count]));
      // 近 7 天（含今天），没访问的日子补 0
      const last7 = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000)
          .toISOString()
          .slice(0, 10);
        last7.push({ day: d, count: byDay.get(d) || 0 });
      }
      const top = await env.DB.prepare(
        "SELECT page, SUM(count) AS count FROM page_views GROUP BY page ORDER BY count DESC LIMIT 5",
      )
        .all()
        .catch(() => ({ results: [] }));
      return json({
        ok: true,
        total: totalRow?.t || 0,
        last7,
        top: top.results || [],
      });
    }
    if (path === "/api/admin/credits/grant" && req.method === "POST") {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user))
        return json({ error: "只有站长能进后台" }, 403);
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "请求体不是合法 JSON" }, 400);
      }
      const email = String(body.email || "")
        .trim()
        .toLowerCase();
      const amount = Math.max(1, Math.min(100, Number(body.amount) || 1));
      const kind = String(body.kind || "rewrite");
      if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email))
        return json({ error: "邮箱格式不对" }, 400);
      let target = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
        .bind(email)
        .first()
        .catch(() => null);
      if (!target) {
        const r = await env.DB.prepare(
          "INSERT INTO users (email, created_at, locale) VALUES (?, ?, ?)",
        )
          .bind(email, Date.now(), "zh")
          .run();
        target = { id: r.meta.last_row_id };
      }
      await grantCredits(env.DB, target.id, kind, amount);
      const bal = await getCredits(env.DB, target.id, kind);
      return json({ ok: true, balance: bal.balance });
    }

    // ---------- 订单页 / 会员中心 / 模板库（第 3 周） ----------
    if (path === "/orders/new" || path === "/en/orders/new") {
      const lang = path.startsWith("/en/") ? "en" : "zh";
      if (ctx?.waitUntil) ctx.waitUntil(recordPageView(env.DB, path));
      return html(
        orderPage(lang, baseUrl(req), {
          paypalConfigured: paypalConfigured(env),
          usdtConfigured: Boolean(
            String(env.USDT_RECEIVE_ADDRESS || "").trim(),
          ),
        }),
      );
    }
    if (path === "/me" || path === "/en/me") {
      const lang = path.startsWith("/en/") ? "en" : "zh";
      return html(memberPage(lang, baseUrl(req)));
    }
    if (path === "/templates" || path === "/en/templates") {
      const lang = path.startsWith("/en/") ? "en" : "zh";
      if (ctx?.waitUntil) ctx.waitUntil(recordPageView(env.DB, path));
      return html(templatesPage(lang, baseUrl(req)));
    }
    if (path === "/resumes" || path === "/en/resumes") {
      const lang = path.startsWith("/en/") ? "en" : "zh";
      return html(resumesPage(lang, baseUrl(req)));
    }
    if (path === "/admin/orders" && req.method === "GET") {
      return html(adminOrdersPage());
    }

    // ---------- 下单 / 订单操作 ----------
    if (path === "/api/orders" && req.method === "POST") {
      const user = await getSessionUser(env.DB, req);
      if (!user) return json({ error: "请先登录（邮箱验证码登录）" }, 401);
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "请求体不是合法 JSON" }, 400);
      }
      const lang = body.lang === "en" ? "en" : "zh";
      const ip = req.headers.get("CF-Connecting-IP") || "unknown";
      const r = await createOrder(env.DB, env, user, {
        plan: body.plan,
        method: body.method,
        lang,
        turnstileToken: body.turnstileToken || "",
        ip,
      });
      if (!r.ok) return json({ error: r.error }, r.code || 400);
      // 支付信息：PayPal 未配时创建失败也不阻塞下单（用户可选其他方式）；USDT 地址从 secret 读
      let pay = {};
      if (r.order.method === "usdt") {
        pay = usdtPayInfo(env);
        pay.amount_usdt_text = r.order.amount_usdt_text;
      } else if (r.order.method === "paypal") {
        const pr = await createPaypalOrder(env.DB, env, r.order);
        if (pr.ok)
          pay = {
            approve_url: pr.approve_url,
            paypal_order_id: pr.paypal_order_id,
          };
        else pay = { error: pr.error };
      } else {
        pay = {
          qr:
            r.order.method === "wechat"
              ? "/img/wechat-merchant-pay-qr.png"
              : "/img/alipay-pay-qr.png",
        };
      }
      return json({ ok: true, order: r.order, pay, existed: !!r.existed });
    }
    if (path.startsWith("/api/orders/") && req.method === "GET") {
      const user = await getSessionUser(env.DB, req);
      if (!user) return json({ error: "请先登录" }, 401);
      const id = Number(path.slice("/api/orders/".length));
      if (!Number.isFinite(id)) return json({ error: "订单不存在" }, 404);
      const row = await env.DB.prepare("SELECT * FROM orders WHERE id = ?")
        .bind(id)
        .first()
        .catch(() => null);
      if (!row || row.user_id !== user.id)
        return json({ error: "订单不存在" }, 404);
      return json({
        ok: true,
        order: publicOrder(row, row.method === "usdt" ? "en" : "zh"),
      });
    }
    if (
      path.startsWith("/api/orders/") &&
      path.endsWith("/paid") &&
      req.method === "POST"
    ) {
      const user = await getSessionUser(env.DB, req);
      if (!user) return json({ error: "请先登录" }, 401);
      const id = Number(path.slice("/api/orders/".length, -"/paid".length));
      if (!Number.isFinite(id)) return json({ error: "订单不存在" }, 404);
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "请求体不是合法 JSON" }, 400);
      }
      const row = await env.DB.prepare("SELECT * FROM orders WHERE id = ?")
        .bind(id)
        .first()
        .catch(() => null);
      const lang = row?.method === "usdt" ? "en" : "zh";
      const r = await markPaid(env.DB, env, user, id, {
        txid: body.txid,
        payerNote: body.payerNote,
        screenshotKey: body.screenshotKey,
        lang,
        baseUrl: baseUrl(req),
      });
      if (!r.ok) return json({ error: r.error }, r.code || 400);
      return json({ ok: true, order: r.order });
    }
    if (
      path.startsWith("/api/orders/") &&
      path.endsWith("/cancel") &&
      req.method === "POST"
    ) {
      const user = await getSessionUser(env.DB, req);
      if (!user) return json({ error: "请先登录" }, 401);
      const id = Number(path.slice("/api/orders/".length, -"/cancel".length));
      if (!Number.isFinite(id)) return json({ error: "订单不存在" }, 404);
      const r = await cancelOrder(env.DB, user, id);
      if (!r.ok) return json({ error: r.error }, r.code || 400);
      return json({ ok: true });
    }

    // ---------- 付款截图上传（R2，扁平 key；仅登录用户；≤2MB；每天每人 ≤10 张） ----------
    if (path === "/api/upload/screenshot" && req.method === "POST") {
      const user = await getSessionUser(env.DB, req);
      if (!user) return json({ error: "请先登录" }, 401);
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "请求体不是合法 JSON" }, 400);
      }
      const b64 = String(body.data || "");
      const type = String(body.type || "");
      if (!/^image\/(png|jpe?g|webp)$/.test(type))
        return json({ error: "只支持 PNG/JPG/WebP 图片" }, 400);
      let bytes;
      try {
        const bin = atob(b64.replace(/\s/g, ""));
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      } catch {
        return json({ error: "图片数据无效" }, 400);
      }
      if (bytes.length > 2 * 1024 * 1024)
        return json({ error: "截图不能超过 2MB" }, 400);
      const dayKey = `shot:${user.id}:${dayString()}`;
      const cnt = await env.DB.prepare(
        "SELECT count FROM rate_limits WHERE key = ?",
      )
        .bind(dayKey)
        .first()
        .catch(() => null);
      if (cnt && cnt.count >= 10)
        return json({ error: "今天上传截图已达上限（10 张）" }, 429);
      const ext =
        type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
      const key = `shot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      await env.FILES.put(key, bytes, { httpMetadata: { contentType: type } });
      await env.DB.prepare(
        "INSERT INTO rate_limits (key, count, updated_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1, updated_at = ?",
      )
        .bind(dayKey, Date.now(), Date.now())
        .run()
        .catch(() => {});
      return json({ ok: true, key, url: `/img/${key}` });
    }

    // ---------- 分享海报上传（R2；PNG ≤500KB；同 IP 每天 ≤5 张） ----------
    if (path === "/api/poster" && req.method === "POST") {
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "请求体不是合法 JSON" }, 400);
      }
      const b64 = String(body.data || "");
      let bytes;
      try {
        const bin = atob(b64.replace(/\s/g, ""));
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      } catch {
        return json({ error: "图片数据无效" }, 400);
      }
      // PNG 魔数校验
      if (
        bytes.length < 8 ||
        bytes[0] !== 0x89 ||
        bytes[1] !== 0x50 ||
        bytes[2] !== 0x4e ||
        bytes[3] !== 0x47
      ) {
        return json({ error: "只支持 PNG 海报" }, 400);
      }
      if (bytes.length > 500 * 1024)
        return json({ error: "海报不能超过 500KB" }, 400);
      const ip = req.headers.get("CF-Connecting-IP") || "unknown";
      const dayKey = `poster:${ip}:${dayString()}`;
      const cnt = await env.DB.prepare(
        "SELECT count FROM rate_limits WHERE key = ?",
      )
        .bind(dayKey)
        .first()
        .catch(() => null);
      if (cnt && cnt.count >= 5)
        return json({ error: "今天生成海报已达上限（5 张）" }, 429);
      const key = `poster-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
      await env.FILES.put(key, bytes, {
        httpMetadata: { contentType: "image/png" },
      });
      await env.DB.prepare(
        "INSERT INTO rate_limits (key, count, updated_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1, updated_at = ?",
      )
        .bind(dayKey, Date.now(), Date.now())
        .run()
        .catch(() => {});
      return json({ ok: true, key, url: `/img/${key}` });
    }

    // ---------- 支付配置（前端据此决定展示哪些支付方式） ----------
    if (path === "/api/pay/config" && req.method === "GET") {
      const lang = detectLang(req);
      return json({
        ok: true,
        lang,
        wechat: true,
        alipay: true,
        usdt: Boolean(String(env.USDT_RECEIVE_ADDRESS || "").trim()),
        paypal: paypalConfigured(env),
      });
    }

    // ---------- PayPal Webhook（骨架；未配凭证只记录不处理） ----------
    if (path === "/api/pay/paypal-webhook" && req.method === "POST") {
      let event;
      try {
        event = await req.json();
      } catch {
        return json({ error: "请求体不是合法 JSON" }, 400);
      }
      const headers = {};
      for (const [k, v] of req.headers.entries()) headers[k.toLowerCase()] = v;
      const r = await handlePaypalWebhook(env.DB, env, event, headers);
      return json(r, r.code || 200);
    }

    // ---------- 会员中心数据 ----------
    if (path === "/api/me/summary" && req.method === "GET") {
      const user = await getSessionUser(env.DB, req);
      if (!user) return json({ error: "请先登录" }, 401);
      const lang = detectLang(req);
      const mem = await env.DB.prepare(
        "SELECT * FROM memberships WHERE user_id = ? AND status = 'active' ORDER BY (expires_at IS NULL) DESC, expires_at DESC LIMIT 1",
      )
        .bind(user.id)
        .first()
        .catch(() => null);
      const rw = await getCredits(env.DB, user.id, "rewrite");
      const ex = await getCredits(env.DB, user.id, "export");
      const plan = mem ? await loadPlan(env.DB, mem.plan) : null;
      const orders = await env.DB.prepare(
        "SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 20",
      )
        .bind(user.id)
        .all()
        .catch(() => ({ results: [] }));
      const notifs = await env.DB.prepare(
        "SELECT * FROM notifications WHERE user_id = ? ORDER BY is_read ASC, created_at DESC LIMIT 20",
      )
        .bind(user.id)
        .all()
        .catch(() => ({ results: [] }));
      return json({
        ok: true,
        user: { email: user.email },
        membership: mem
          ? {
              plan: mem.plan,
              plan_name:
                lang === "en"
                  ? plan?.name_en || mem.plan
                  : plan?.name_zh || mem.plan,
              expires_at: mem.expires_at,
              expires_soon: Boolean(
                mem.expires_at &&
                mem.expires_at - Date.now() < 3 * 24 * 3600 * 1000,
              ),
            }
          : null,
        credits: { rewrite: rw.balance, export: ex.balance },
        orders: (orders.results || []).map((o) => ({
          id: o.id,
          order_no: o.order_no,
          plan_name:
            lang === "en"
              ? getPlan(o.plan)?.name_en || o.plan
              : getPlan(o.plan)?.name_zh || o.plan,
          amount_text:
            o.method === "usdt"
              ? `${formatUsdt(o.amount_usdt_sun)} USDT`
              : formatCny(o.amount),
          method: o.method,
          status: o.status,
          status_label: statusLabel(o.status, lang),
          reject_reason: o.reject_reason || null,
          created_at: o.created_at,
        })),
        notifications: (notifs.results || []).map((n) => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          is_read: n.is_read,
          created_at: n.created_at,
        })),
      });
    }

    // ---------- 站内通知 ----------
    if (path === "/api/notifications" && req.method === "GET") {
      const user = await getSessionUser(env.DB, req);
      if (!user) return json({ error: "请先登录" }, 401);
      const rows = await env.DB.prepare(
        "SELECT * FROM notifications WHERE user_id = ? ORDER BY is_read ASC, created_at DESC LIMIT 50",
      )
        .bind(user.id)
        .all()
        .catch(() => ({ results: [] }));
      return json({ ok: true, notifications: rows.results || [] });
    }
    if (
      path.startsWith("/api/notifications/") &&
      path.endsWith("/read") &&
      req.method === "POST"
    ) {
      const user = await getSessionUser(env.DB, req);
      if (!user) return json({ error: "请先登录" }, 401);
      const id = Number(
        path.slice("/api/notifications/".length, -"/read".length),
      );
      if (!Number.isFinite(id)) return json({ error: "通知不存在" }, 404);
      await env.DB.prepare(
        "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
      )
        .bind(id, user.id)
        .run();
      return json({ ok: true });
    }

    // ---------- 后台：订单管理 ----------
    if (path === "/api/admin/orders" && req.method === "GET") {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user))
        return json({ error: "只有站长能进后台" }, 403);
      const status = url.searchParams.get("status") || "";
      const q = (url.searchParams.get("q") || "").trim().slice(0, 40);
      let rows;
      if (q) {
        rows = await env.DB.prepare(
          "SELECT o.*, u.email FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.order_no LIKE ? ORDER BY o.id DESC LIMIT 50",
        )
          .bind(`%${q}%`)
          .all();
      } else if (status) {
        rows = await env.DB.prepare(
          "SELECT o.*, u.email FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.status = ? ORDER BY o.id DESC LIMIT 50",
        )
          .bind(status)
          .all();
      } else {
        rows = await env.DB.prepare(
          "SELECT o.*, u.email FROM orders o LEFT JOIN users u ON u.id = o.user_id ORDER BY CASE o.status WHEN 'review_pending' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, o.id DESC LIMIT 50",
        )
          .bind()
          .all();
      }
      const lang = "zh";
      return json({
        ok: true,
        orders: (rows.results || []).map((o) => ({
          id: o.id,
          order_no: o.order_no,
          user_id: o.user_id,
          email: o.email || null,
          plan: o.plan,
          plan_name: getPlan(o.plan)?.name_zh || o.plan,
          amount_text:
            o.method === "usdt"
              ? `${formatUsdt(o.amount_usdt_sun)} USDT`
              : formatCny(o.amount),
          method: o.method,
          status: o.status,
          created_at: o.created_at,
        })),
      });
    }
    if (path === "/api/admin/orders/stats" && req.method === "GET") {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user))
        return json({ error: "只有站长能进后台" }, 403);
      const today = new Date().toISOString().slice(0, 10);
      const dayStart = Date.parse(`${today}T00:00:00Z`);
      const rp = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM orders WHERE status = 'review_pending'",
      )
        .first()
        .catch(() => ({ n: 0 }));
      const td = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM orders WHERE created_at >= ?",
      )
        .bind(dayStart)
        .first()
        .catch(() => ({ n: 0 }));
      const tdone = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM orders WHERE status = 'done' AND created_at >= ?",
      )
        .bind(dayStart)
        .first()
        .catch(() => ({ n: 0 }));
      const total = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM orders WHERE status = 'done'",
      )
        .first()
        .catch(() => ({ n: 0 }));
      const tg = await getTelegramOwnerChatId(env).catch(() => "");
      return json({
        ok: true,
        review_pending: rp?.n || 0,
        today: td?.n || 0,
        today_done: tdone?.n || 0,
        total_done: total?.n || 0,
        usdt_auto_release: env.USDT_AUTO_RELEASE === "1",
        paypal_configured: paypalConfigured(env),
        feishu_configured: getFeishuConfig(env).configured,
        telegram_configured: Boolean(tg),
      });
    }
    if (path.startsWith("/api/admin/orders/") && req.method === "GET") {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user))
        return json({ error: "只有站长能进后台" }, 403);
      const id = Number(path.slice("/api/admin/orders/".length));
      if (!Number.isFinite(id)) return json({ error: "订单不存在" }, 404);
      const o = await env.DB.prepare(
        "SELECT o.*, u.email FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?",
      )
        .bind(id)
        .first()
        .catch(() => null);
      if (!o) return json({ error: "订单不存在" }, 404);
      return json({
        ok: true,
        order: {
          id: o.id,
          order_no: o.order_no,
          user_id: o.user_id,
          email: o.email || null,
          plan: o.plan,
          plan_name: getPlan(o.plan)?.name_zh || o.plan,
          amount_text:
            o.method === "usdt"
              ? `${formatUsdt(o.amount_usdt_sun)} USDT`
              : formatCny(o.amount),
          amount_usdt_text: o.amount_usdt_sun
            ? formatUsdt(o.amount_usdt_sun)
            : null,
          method: o.method,
          status: o.status,
          txid: o.txid,
          payer_note: o.payer_note || null,
          screenshot_key: o.screenshot_key || null,
          reject_reason: o.reject_reason || null,
          expires_at: o.expires_at,
          created_at: o.created_at,
          reviewed_at: o.reviewed_at || null,
        },
      });
    }
    if (
      path.startsWith("/api/admin/orders/") &&
      path.endsWith("/approve") &&
      req.method === "POST"
    ) {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user))
        return json({ error: "只有站长能进后台" }, 403);
      const id = Number(
        path.slice("/api/admin/orders/".length, -"/approve".length),
      );
      if (!Number.isFinite(id)) return json({ error: "订单不存在" }, 404);
      const r = await approveOrder(env.DB, env, user, id);
      if (!r.ok) return json({ error: r.error }, r.code || 400);
      return json({ ok: true, order_no: r.order_no, user_email: r.user_email });
    }
    if (
      path.startsWith("/api/admin/orders/") &&
      path.endsWith("/reject") &&
      req.method === "POST"
    ) {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user))
        return json({ error: "只有站长能进后台" }, 403);
      const id = Number(
        path.slice("/api/admin/orders/".length, -"/reject".length),
      );
      if (!Number.isFinite(id)) return json({ error: "订单不存在" }, 404);
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "请求体不是合法 JSON" }, 400);
      }
      const r = await rejectOrder(env.DB, env, user, id, body.reason);
      if (!r.ok) return json({ error: r.error }, r.code || 400);
      return json({ ok: true, order_no: r.order_no });
    }
    if (
      path.startsWith("/api/admin/orders/") &&
      path.endsWith("/manual-grant") &&
      req.method === "POST"
    ) {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user))
        return json({ error: "只有站长能进后台" }, 403);
      const id = Number(
        path.slice("/api/admin/orders/".length, -"/manual-grant".length),
      );
      if (!Number.isFinite(id)) return json({ error: "订单不存在" }, 404);
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "请求体不是合法 JSON" }, 400);
      }
      const r = await manualUsdtGrant(env.DB, env, user, id, body.txid);
      if (!r.ok) return json({ error: r.error }, r.code || 400);
      return json({
        ok: true,
        order_no: r.order_no,
        confirmations: r.confirmations,
      });
    }

    // ---------- 后台：套餐管理 ----------
    if (path === "/api/admin/plans" && req.method === "GET") {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user))
        return json({ error: "只有站长能进后台" }, 403);
      const rows = await env.DB.prepare(
        "SELECT * FROM plans ORDER BY price_cents ASC",
      )
        .bind()
        .all()
        .catch(() => ({ results: [] }));
      return json({ ok: true, plans: rows.results || [] });
    }
    if (path === "/api/admin/plans" && req.method === "POST") {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user))
        return json({ error: "只有站长能进后台" }, 403);
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "请求体不是合法 JSON" }, 400);
      }
      const plans = body.plans || {};
      for (const [slug, v] of Object.entries(plans)) {
        const plan = getPlan(slug);
        if (!plan) continue;
        const priceYuan = Math.max(
          0,
          Number(v.price_yuan ?? plan.price_cents / 100),
        );
        const usdt = Math.max(0, Number(v.usdt ?? plan.usdt_sun / 1e6));
        const rewrite = Math.max(
          0,
          Math.min(
            1000,
            Math.floor(Number(v.rewrite_credits ?? plan.rewrite_credits)),
          ),
        );
        const exp = Math.max(
          -1,
          Math.min(
            1000,
            Math.floor(Number(v.export_credits ?? plan.export_credits)),
          ),
        );
        // 金额按元填、前端 ×100 存分；USDT 按美元数 ×1e6 存 sun
        await env.DB.prepare(
          "UPDATE plans SET price_cents = ?, usdt_sun = ?, rewrite_credits = ?, export_credits = ? WHERE slug = ?",
        )
          .bind(
            Math.round(priceYuan * 100),
            Math.round(usdt * 1e6),
            rewrite,
            exp,
            slug,
          )
          .run();
      }
      return json({ ok: true });
    }

    // ---------- 后台：支付配置状态 ----------
    if (path === "/api/admin/pay-config" && req.method === "GET") {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user))
        return json({ error: "只有站长能进后台" }, 403);
      const tg = await getTelegramOwnerChatId(env).catch(() => "");
      return json({
        ok: true,
        usdt_configured: Boolean(String(env.USDT_RECEIVE_ADDRESS || "").trim()),
        usdt_auto_release: env.USDT_AUTO_RELEASE === "1",
        paypal_configured: paypalConfigured(env),
        paypal_mode: String(env.PAYPAL_MODE || "sandbox"),
        turnstile_configured: Boolean(
          String(env.TURNSTILE_SECRET || "").trim(),
        ),
        resend_configured: Boolean(String(env.RESEND_API_KEY || "").trim()),
        telegram_configured: Boolean(tg),
        feishu_configured: getFeishuConfig(env).configured,
      });
    }

    // ---------- 后台：Telegram 绑定 ----------
    if (path === "/api/admin/telegram/chats" && req.method === "GET") {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user))
        return json({ error: "只有站长能进后台" }, 403);
      const r = await listTelegramChats(env);
      return json(r, r.ok ? 200 : 400);
    }
    if (path === "/api/admin/telegram/owner" && req.method === "POST") {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user))
        return json({ error: "只有站长能进后台" }, 403);
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "请求体不是合法 JSON" }, 400);
      }
      const chatId = String(body.chat_id || "").trim();
      if (!/^-?\d{5,20}$/.test(chatId))
        return json({ error: "chat_id 格式不对" }, 400);
      await env.DB.prepare(
        "INSERT INTO ai_rules (key, value, version, updated_at) VALUES ('telegram_owner_chat_id', ?, 1, ?) ON CONFLICT(key) DO UPDATE SET value = ?, version = version + 1, updated_at = ?",
      )
        .bind(chatId, Date.now(), chatId, Date.now())
        .run();
      return json({ ok: true, chat_id: chatId });
    }

    if (path === "/robots.txt") {
      return new Response(robotsTxt(baseUrl(req)), {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          ...securityHeaders(),
        },
      });
    }
    // IndexNow 密钥文件（Bing/Yandex 收录验证）：/{key}.txt 返回 key 本身。
    if (path === `/${INDEXNOW_KEY}.txt`) {
      return new Response(INDEXNOW_KEY, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          ...securityHeaders(),
        },
      });
    }
    if (path === "/sitemap.xml") {
      return new Response(sitemapIndex(baseUrl(req)), {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          ...securityHeaders(),
        },
      });
    }
    if (path === "/sitemap-zh.xml") {
      return new Response(sitemapLang(baseUrl(req), "zh"), {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          ...securityHeaders(),
        },
      });
    }
    if (path === "/sitemap-en.xml") {
      return new Response(sitemapLang(baseUrl(req), "en"), {
        headers: {
          "Content-Type": "application/xml; charset=utf-8",
          ...securityHeaders(),
        },
      });
    }
    if (path === "/favicon.ico" || path === "/favicon.svg") {
      return new Response(FAVICON, {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=86400",
          ...securityHeaders(),
        },
      });
    }
    // R2 图片代理：/img/:key 只认单段 key（扁平命名，带斜杠 404）；二维码类公开图片不鉴权。
    // 付款截图（shot-）与海报（poster-）含用户付款凭证，不公开：必须登录才可看（key 本身带随机串，猜不到）。
    if (path.startsWith("/img/")) {
      const key = path.slice(5);
      if (!key || key.includes("/") || key.includes("..")) {
        return new Response("Not Found", {
          status: 404,
          headers: securityHeaders(),
        });
      }
      if (key.startsWith("shot-") || key.startsWith("poster-")) {
        const viewer = await getSessionUser(env.DB, req).catch(() => null);
        if (!viewer) {
          return new Response("Not Found", {
            status: 404,
            headers: securityHeaders(),
          });
        }
      }
      const obj = await env.FILES.get(key);
      if (!obj)
        return new Response("Not Found", {
          status: 404,
          headers: securityHeaders(),
        });
      const ext = key.split(".").pop().toLowerCase();
      const type =
        {
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          webp: "image/webp",
          pdf: "application/pdf",
        }[ext] || "application/octet-stream";
      return new Response(obj.body, {
        headers: {
          "Content-Type": type,
          "Cache-Control": "public, max-age=86400",
          ...securityHeaders(),
        },
      });
    }

    if (path === "/api/score" && req.method === "POST") {
      let body;
      try {
        body = await req.json();
      } catch {
        return json({ error: "请求体不是合法 JSON" }, 400);
      }
      const resumeText = String(body.resumeText || "").trim();
      const jdText = String(body.jdText || "").trim();
      const lang = body.lang === "en" ? "en" : "zh";
      if (!resumeText)
        return json(
          {
            error:
              lang === "en"
                ? "Please paste your resume text first"
                : "请先粘贴简历文本",
          },
          400,
        );
      if (resumeText.length > 20000)
        return json({ error: "简历文本过长（最多 20000 字）" }, 400);
      if (jdText.length > 20000)
        return json({ error: "JD 文本过长（最多 20000 字）" }, 400);

      const ip = req.headers.get("CF-Connecting-IP") || "unknown";
      const limit = await checkGuestLimit(env, ip);
      if (!limit.allowed) {
        return json(
          {
            error:
              lang === "en"
                ? "Today’s free scores are used up. Come back tomorrow."
                : "今日免费评分次数已用完，明天再来",
          },
          429,
        );
      }

      const result = scoreResume(resumeText, jdText, lang);
      try {
        await env.DB.prepare(
          "INSERT INTO analyses (resume_id, jd_text, score_json, keywords_json, created_at) VALUES (NULL, ?, ?, ?, ?)",
        )
          .bind(
            jdText.slice(0, 5000),
            JSON.stringify(result),
            JSON.stringify(result.gaps),
            Date.now(),
          )
          .run();
      } catch (e) {
        console.error("analysis insert failed", e);
      }
      return json(result);
    }

    if (path === "/api/pay/usdt-info" && req.method === "GET") {
      // USDT 收款信息（订单页展示位）：地址从 secret 读，不硬编码；
      // 地址本身就是公开的收款地址，付款人必须看到它才能转账。
      return json(usdtPayInfo(env));
    }

    if (path === "/api/admin/feishu-status" && req.method === "GET") {
      // 飞书通知配置状态：仅站长可看（第 3 周起收紧）；只返回是否配好 + 脱敏标识，绝不返回 Secret 与接收方 ID 完整值。
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user))
        return json({ error: "只有站长能进后台" }, 403);
      return json({ ok: true, ...getFeishuConfig(env) });
    }

    if (path === "/" || path === "/index.html") {
      // 根路径：按语言判断做 302 跳转（不用 301，方便改主意）；爬虫不按 IP 跳
      const lang = detectLang(req);
      if (lang === "en") {
        return new Response(null, {
          status: 302,
          headers: { Location: "/en/", ...securityHeaders() },
        });
      }
      if (ctx?.waitUntil) ctx.waitUntil(recordPageView(env.DB, "/"));
      return html(homePage("zh", baseUrl(req)));
    }
    if (path === "/en" || path === "/en/index.html") {
      return new Response(null, {
        status: 302,
        headers: { Location: "/en/", ...securityHeaders() },
      });
    }
    if (path === "/en/") {
      if (ctx?.waitUntil) ctx.waitUntil(recordPageView(env.DB, "/en/"));
      return html(homePage("en", baseUrl(req)));
    }

    return new Response("Not Found", {
      status: 404,
      headers: securityHeaders(),
    });
  },

  // 定时任务：每分钟跑一次 — USDT 到账监听（TronGrid 轮询，见 src/usdt.js）
  // + 异步任务队列兜底（改写/求职信/互译卡住的 pending 任务）
  // + 待审核超 2 小时飞书二次提醒 + 会员到期前 3 天提醒 + 终身会员每月补满。
  // USDT 默认手动模式：只核对并记录，不自动开通；USDT_AUTO_RELEASE 设为 '1' 后才自动放行。
  async scheduled(event, env) {
    console.log("cron tick", new Date(event.scheduledTime).toISOString());
    try {
      const r = await pollUsdtPayments(env, {
        // 手动模式匹配到账：通知站长人工确认（Telegram 主渠道，飞书兜底）
        onMatched: async (order, tx, conf) => {
          const u = await env.DB.prepare("SELECT email FROM users WHERE id = ?")
            .bind(order.user_id)
            .first()
            .catch(() => null);
          const plan = await loadPlan(env.DB, order.plan);
          await notifyOwner(env, env.DB, {
            text: usdtArrivedNoticeText({
              order_no: order.order_no,
              email: u?.email || "-",
              plan_name: plan?.name_en || order.plan,
              amount_text: `${formatUsdt(order.amount_usdt_sun)} USDT`,
              txid: tx.transaction_id,
              confirmations: conf,
            }),
            channels: ["telegram", "feishu"],
          });
        },
        // 自动放行（仅当站长把 USDT_AUTO_RELEASE 设为 '1'）：开通并发额度 + 通知用户
        onPaid: async (order, tx, conf) => {
          const plan = await loadPlan(env.DB, order.plan);
          const now = Date.now();
          await env.DB.batch([
            env.DB.prepare(
              "UPDATE orders SET status = 'done', reviewed_at = ? WHERE id = ? AND status = 'paid'",
            ).bind(now, order.id),
            ...grantPlanStatements(env.DB, order, now, plan),
            env.DB.prepare(
              "INSERT INTO notifications (user_id, type, title, body, is_read, created_at) VALUES (?, ?, ?, ?, 0, ?)",
            ).bind(
              order.user_id,
              "order_activated",
              `订单 ${order.order_no} 已开通（USDT 自动确认）`,
              `你的「${plan?.name_zh || order.plan}」已开通。`,
              now,
            ),
          ]);
        },
      });
      console.log("usdt poll result", JSON.stringify(r));
    } catch (e) {
      console.error("usdt poll error", e);
    }
    try {
      const r = await processPendingTasks(env, env.DB, 3);
      if (r.processed > 0)
        console.log("task queue processed", JSON.stringify(r));
    } catch (e) {
      console.error("task queue error", e);
    }
    try {
      // 游客数据 24h 清理（规划 §5）：游客评分不登录，analyses 里 resume_id 为空；
      // 超过 24 小时的游客评分记录和过期的邮箱验证码一并清掉，登录用户的记录不动。
      // 之前漏了这段，analyses 已积压过期行。
      const cutoff = Date.now() - 24 * 3600 * 1000;
      const a = await env.DB.prepare(
        "DELETE FROM analyses WHERE resume_id IS NULL AND created_at < ?",
      ).bind(cutoff).run().catch(() => null);
      const e = await env.DB.prepare(
        "DELETE FROM email_codes WHERE expires_at < ?",
      ).bind(Date.now()).run().catch(() => null);
      const cleaned = (a?.meta?.changes || 0) + (e?.meta?.changes || 0);
      if (cleaned > 0) console.log("guest cleanup", { analyses: a?.meta?.changes || 0, email_codes: e?.meta?.changes || 0 });
    } catch (e) {
      console.error("guest cleanup error", e);
    }
    try {
      const r = await remindStaleReviewOrders(env.DB, env);
      if (r.reminded > 0)
        console.log("stale review orders reminded", r.reminded);
    } catch (e) {
      console.error("stale review remind error", e);
    }
    try {
      const now = Date.now();
      // 会员到期前 3 天提醒（同一用户同一套餐 7 天内只提醒一次）
      const expiring = await env.DB.prepare(
        "SELECT user_id, plan, expires_at FROM memberships WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at > ? AND expires_at < ?",
      )
        .bind(now, now + 3 * 24 * 3600 * 1000)
        .all()
        .catch(() => ({ results: [] }));
      for (const m of expiring.results || []) {
        const dup = await env.DB.prepare(
          "SELECT id FROM notifications WHERE user_id = ? AND type = 'expiry_reminder' AND created_at > ?",
        )
          .bind(m.user_id, now - 7 * 24 * 3600 * 1000)
          .first()
          .catch(() => null);
        if (dup) continue;
        const plan = await loadPlan(env.DB, m.plan);
        await addNotification(
          env.DB,
          m.user_id,
          "expiry_reminder",
          `你的「${plan?.name_zh || m.plan}」3 天内到期`,
          `到期日 ${new Date(m.expires_at).toISOString().slice(0, 10)}，请及时续费，过期后额度失效。一次性付费，到期不自动续费。`,
        );
      }
      // 终身会员每月补满：改写额度补到 50（不滚存）
      const refillDue = await env.DB.prepare(
        "SELECT user_id FROM memberships WHERE plan = 'lifetime' AND status = 'active' AND (last_refill_at IS NULL OR last_refill_at < ?)",
      )
        .bind(now - 30 * 24 * 3600 * 1000)
        .all()
        .catch(() => ({ results: [] }));
      for (const m of refillDue.results || []) {
        await env.DB.batch(lifetimeRefillStatements(env.DB, m.user_id, now));
        console.log("lifetime refill", m.user_id);
      }
      // 过期会员标记
      await env.DB.prepare(
        "UPDATE memberships SET status = 'expired' WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < ?",
      )
        .bind(now)
        .run()
        .catch(() => {});
    } catch (e) {
      console.error("membership cron error", e);
    }
  },
};
