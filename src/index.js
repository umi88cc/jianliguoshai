// 简历过筛 ResumePass — Cloudflare Worker 入口（第 1 周：首页 + ATS 评分 + SEO 基础）
// 语言判断优先级：手动选择 Cookie > Accept-Language > CF-IPCountry > 默认中文；
// 只对根路径做 302 跳转；/en/ 页面本身不跳转；爬虫不按 IP 跳。
import { scoreResume } from './ats.js';
import { homePage } from './pages.js';
import { pollUsdtPayments, usdtPayInfo } from './usdt.js';
import { getFeishuConfig } from './feishu.js';
import {
  sendLoginCode, verifyLoginCode, getSessionUser, logoutSession, isAdmin,
  sessionCookie, clearSessionCookie, getCredits, grantCredits,
} from './auth.js';
import {
  AI_PROVIDER_URLS, listModels, encryptModelKey, keyHash, maskKey,
  testModel, getRules, setRule, restoreRule, listRuleVersions,
} from './ai.js';
import { deterministicRewrite, applyRewriteToText } from './rewrite.js';
import { submitTask, getTask, processTask, processPendingTasks, publicTask } from './tasks.js';
import { adminPage } from './admin.js';

const GUEST_SCORE_PER_DAY = 1;

function baseUrl(req) {
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    // 首版 JS 为内联脚本，CSP 暂放宽 script-src 'unsafe-inline'；JS 外置后再收紧
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'self'",
  };
}

function html(body, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...securityHeaders() } });
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...securityHeaders(), ...extraHeaders } });
}

function detectLang(req) {
  const cookie = req.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)locale=(zh|en)/);
  if (m) return m[1];
  const al = (req.headers.get('Accept-Language') || '').toLowerCase();
  if (al.startsWith('en')) return 'en';
  if (al.startsWith('zh')) return 'zh';
  const country = req.cf?.country || '';
  if (country && !['CN', 'HK', 'TW', 'MO'].includes(country)) return 'en';
  return 'zh';
}

function dayString() {
  return new Date().toISOString().slice(0, 10);
}

async function checkGuestLimit(env, ip) {
  const key = `rate:${ip}:${dayString()}`;
  try {
    const row = await env.DB.prepare('SELECT count FROM rate_limits WHERE key = ?').bind(key).first();
    const count = row ? row.count : 0;
    if (count >= GUEST_SCORE_PER_DAY) return { allowed: false, count };
    await env.DB.prepare(
      'INSERT INTO rate_limits (key, count, updated_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1, updated_at = ?',
    ).bind(key, Date.now(), Date.now()).run();
    return { allowed: true, count: count + 1 };
  } catch (e) {
    // D1 异常时放行（评分本身零 AI 成本，不因限流表故障挡住正常用户）
    console.error('rate limit check failed', e);
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
  const urls = lang === 'zh' ? [`${base}/`] : [`${base}/en/`];
  const lastmod = dayString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority><xhtml:link rel="alternate" hreflang="zh-CN" href="${base}/"/><xhtml:link rel="alternate" hreflang="en" href="${base}/en/"/><xhtml:link rel="alternate" hreflang="x-default" href="${base}/"/></url>`).join('\n')}
</urlset>`;
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#1668B4"/><text x="32" y="42" font-size="28" font-weight="700" fill="#fff" text-anchor="middle" font-family="sans-serif">简</text></svg>`;

// R2 图片 key（扁平单段命名，/img/:key 只认单段 key，带斜杠会 404）：
// - 咨询二维码（中文版联系方式，首页展示）：wechat-consult-qr.png / qq-consult-qr.png
// - 商户收款码（订单页展示，第 2 周接支付时用）：wechat-merchant-pay-qr.png / alipay-pay-qr.png
// - USDT 收款地址：已设为 Worker secret USDT_RECEIVE_ADDRESS（订单页从 secret 读，见 src/usdt.js）
// - Telegram 机器人 Token / 飞书配置：见 Worker secrets TELEGRAM_BOT_TOKEN / FEISHU_*，只存服务器侧
const QR_KEYS = {
  wechatConsult: 'wechat-consult-qr.png',
  qqConsult: 'qq-consult-qr.png',
  wechatPay: 'wechat-merchant-pay-qr.png',
  alipayPay: 'alipay-pay-qr.png',
};

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;

    // ---------- 登录 / 会话 ----------
    if (path === '/api/auth/send-code' && req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch { return json({ error: '请求体不是合法 JSON' }, 400); }
      const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
      const r = await sendLoginCode(env.DB, env, body.email, ip);
      if (!r.ok) return json({ error: r.error }, 400);
      return json({ ok: true, sent: r.sent, devMode: !!r.devMode, code: r.devMode ? r.code : undefined });
    }
    if (path === '/api/auth/verify-code' && req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch { return json({ error: '请求体不是合法 JSON' }, 400); }
      const r = await verifyLoginCode(env.DB, body.email, body.code);
      if (!r.ok) return json({ error: r.error }, 400);
      return json({ ok: true, user: r.user }, 200, { 'Set-Cookie': sessionCookie(r.token) });
    }
    if (path === '/api/auth/logout' && req.method === 'POST') {
      await logoutSession(env.DB, req);
      return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
    }
    if (path === '/api/auth/me' && req.method === 'GET') {
      const user = await getSessionUser(env.DB, req);
      if (!user) return json({ ok: true, user: null });
      const credits = await getCredits(env.DB, user.id, 'rewrite');
      return json({ ok: true, user: { id: user.id, email: user.email }, isAdmin: isAdmin(env, user), credits });
    }

    // ---------- AI 改写 / 求职信 / 互译（须登录；扣 1 个 rewrite 额度） ----------
    if ((path === '/api/rewrite' || path === '/api/cover-letter' || path === '/api/translate') && req.method === 'POST') {
      const user = await getSessionUser(env.DB, req);
      if (!user) return json({ error: '请先登录（邮箱验证码登录）' }, 401);
      let body;
      try { body = await req.json(); } catch { return json({ error: '请求体不是合法 JSON' }, 400); }
      const lang = body.lang === 'en' ? 'en' : 'zh';
      const type = path === '/api/rewrite' ? 'rewrite' : path === '/api/cover-letter' ? 'cover_letter' : 'translate';
      if (type === 'rewrite') {
        const resumeText = String(body.resumeText || '').trim();
        const jdText = String(body.jdText || '').trim();
        if (!resumeText) return json({ error: '请先粘贴简历文本' }, 400);
        if (resumeText.length > 20000 || jdText.length > 20000) return json({ error: '文本过长（最多 20000 字）' }, 400);
        const intensity = ['conservative', 'standard', 'aggressive'].includes(body.intensity) ? body.intensity : 'standard';
        const credits = await getCredits(env.DB, user.id, 'rewrite');
        if (credits.balance < 1) {
          // 免费试看：规则改写前 3 条（不扣额度、不建任务）
          const preview = deterministicRewrite(resumeText, jdText, lang, intensity);
          return json({
            preview: true,
            message: lang === 'en' ? 'Free preview: first 3 bullets. Buy a rewrite (from $1.99) to see the full version.' : '免费试看：前 3 条改写。购买后（9.9 元/次起）看完整版。',
            summary: preview.summary,
            bullets: preview.bullets.slice(0, 3),
            missing_keywords: preview.missing_keywords,
            score_tips: preview.score_tips,
          });
        }
        const sub = await submitTask(env.DB, user.id, 'rewrite', { resumeText, jdText, lang, intensity, resumeId: body.resumeId || null });
        if (!sub.ok) return json({ error: sub.error }, sub.code === 'no_credit' ? 402 : 400);
        if (ctx?.waitUntil) ctx.waitUntil(processTask(env, env.DB, sub.taskId));
        else await processTask(env, env.DB, sub.taskId);
        return json({ ok: true, taskId: sub.taskId });
      }
      if (type === 'cover_letter') {
        const resumeText = String(body.resumeText || '').trim();
        const jdText = String(body.jdText || '').trim();
        const company = String(body.company || '').trim().slice(0, 100);
        if (!resumeText) return json({ error: '请先粘贴简历文本' }, 400);
        if (resumeText.length > 20000 || jdText.length > 20000) return json({ error: '文本过长（最多 20000 字）' }, 400);
        const sub = await submitTask(env.DB, user.id, 'cover_letter', { resumeText, jdText, company, lang });
        if (!sub.ok) return json({ error: sub.error }, sub.code === 'no_credit' ? 402 : 400);
        if (ctx?.waitUntil) ctx.waitUntil(processTask(env, env.DB, sub.taskId));
        else await processTask(env, env.DB, sub.taskId);
        return json({ ok: true, taskId: sub.taskId });
      }
      // translate
      const text = String(body.text || '').trim();
      if (!text) return json({ error: '请先粘贴要翻译的文本' }, 400);
      if (text.length > 20000) return json({ error: '文本过长（最多 20000 字）' }, 400);
      const sub = await submitTask(env.DB, user.id, 'translate', { text, lang });
      if (!sub.ok) return json({ error: sub.error }, sub.code === 'no_credit' ? 402 : 400);
      if (ctx?.waitUntil) ctx.waitUntil(processTask(env, env.DB, sub.taskId));
      else await processTask(env, env.DB, sub.taskId);
      return json({ ok: true, taskId: sub.taskId });
    }

    // ---------- 任务状态轮询 ----------
    if (path.startsWith('/api/tasks/') && req.method === 'GET') {
      const user = await getSessionUser(env.DB, req);
      if (!user) return json({ error: '请先登录' }, 401);
      const taskId = Number(path.slice('/api/tasks/'.length));
      if (!Number.isFinite(taskId)) return json({ error: '任务不存在' }, 404);
      const task = await getTask(env.DB, user.id, taskId);
      if (!task) return json({ error: '任务不存在' }, 404);
      if (task.forbidden) return json({ error: '无权查看该任务' }, 403);
      return json(publicTask(task));
    }

    // ---------- 逐条采纳：把接受的改写拼成新简历版本（parent_id 溯源） ----------
    if (path.startsWith('/api/rewrites/') && path.endsWith('/apply') && req.method === 'POST') {
      const user = await getSessionUser(env.DB, req);
      if (!user) return json({ error: '请先登录' }, 401);
      const rewriteId = Number(path.slice('/api/rewrites/'.length, -'/apply'.length));
      if (!Number.isFinite(rewriteId)) return json({ error: '改写记录不存在' }, 404);
      let body;
      try { body = await req.json(); } catch { return json({ error: '请求体不是合法 JSON' }, 400); }
      const row = await env.DB.prepare('SELECT * FROM rewrites WHERE id = ?').bind(rewriteId).first().catch(() => null);
      if (!row || row.user_id !== user.id) return json({ error: '改写记录不存在' }, 404);
      const task = row.task_id ? await env.DB.prepare('SELECT payload FROM tasks WHERE id = ?').bind(row.task_id).first().catch(() => null) : null;
      let originalText = '';
      try { originalText = JSON.parse(task?.payload || '{}').resumeText || ''; } catch { originalText = ''; }
      if (!originalText) return json({ error: '原文已丢失，无法采纳' }, 400);
      let result;
      try { result = JSON.parse(row.result_json || '{}'); } catch { return json({ error: '改写结果已损坏' }, 400); }
      const accepted = Array.isArray(body.accepted) ? body.accepted.map(Number).filter((n) => Number.isFinite(n)) : null;
      const text = applyRewriteToText(originalText, result.bullets || [], accepted);
      const now = Date.now();
      const r = await env.DB.prepare(
        'INSERT INTO resumes (user_id, parent_id, title, raw_text, lang, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).bind(user.id, row.resume_id || null, `改写版-${new Date(now).toISOString().slice(0, 10)}`, text, row.lang || 'zh', now, now).run();
      return json({ ok: true, resumeId: r.meta.last_row_id, text });
    }

    // ---------- 后台：AI 模型配置 ----------
    if (path === '/admin' || path === '/admin/') {
      return new Response(null, { status: 302, headers: { Location: '/admin/ai', ...securityHeaders() } });
    }
    if (path === '/admin/ai' && req.method === 'GET') {
      return html(adminPage());
    }
    if (path === '/api/admin/ai/models' && req.method === 'GET') {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user)) return json({ error: '只有站长能进后台' }, 403);
      const models = await listModels(env.DB);
      const today = new Date().toISOString().slice(0, 10);
      for (const m of models) {
        const u = await env.DB.prepare('SELECT count FROM ai_usage WHERE model_id = ? AND day = ?').bind(m.id, today).first().catch(() => null);
        m.used_today = u ? u.count : 0;
      }
      return json({ ok: true, models });
    }
    if (path === '/api/admin/ai/models' && req.method === 'POST') {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user)) return json({ error: '只有站长能进后台' }, 403);
      let body;
      try { body = await req.json(); } catch { return json({ error: '请求体不是合法 JSON' }, 400); }
      const provider = String(body.provider || '').trim();
      const baseUrl = String(body.base_url || '').trim() || AI_PROVIDER_URLS[provider] || '';
      const name = String(body.name || '').trim();
      const model = String(body.model || '').trim();
      const sortOrder = Number(body.sort_order) || 99;
      const dailyLimit = Math.max(1, Math.min(10000, Number(body.daily_limit) || 50));
      if (!provider || !baseUrl || !name || !model) return json({ error: '提供商、API 地址、显示名、模型名都要填' }, 400);
      const now = Date.now();
      // Key：传了才处理；互斥校验（一个 Key 不能绑两个模型）
      let keyPatch = {};
      if (body.key !== undefined && String(body.key || '').trim()) {
        const plain = String(body.key).trim();
        const hash = await keyHash(plain);
        const clash = await env.DB.prepare(
          'SELECT id, name FROM ai_models WHERE key_hash = ? AND id != ?',
        ).bind(hash, body.id || 0).first().catch(() => null);
        if (clash) return json({ error: `该 Key 已绑定到「${clash.name}」，一个 Key 不能绑两个模型` }, 400);
        const enc = await encryptModelKey(env, plain);
        if (!enc.ok) return json({ error: enc.error }, 400);
        keyPatch = {
          key_enc: enc.enc, key_hash: hash, key_last4: maskKey(plain).slice(4), key_configured: 1, key_ref: null,
        };
      }
      if (body.id) {
        const row = await env.DB.prepare('SELECT id FROM ai_models WHERE id = ?').bind(body.id).first().catch(() => null);
        if (!row) return json({ error: '模型不存在' }, 404);
        const sets = ['sort_order = ?', 'provider = ?', 'base_url = ?', 'name = ?', 'model = ?', 'price_text = ?', 'speed_text = ?', 'limit_text = ?', 'daily_limit = ?', 'updated_at = ?'];
        const vals = [sortOrder, provider, baseUrl, name, model, String(body.price_text || ''), String(body.speed_text || ''), String(body.limit_text || ''), dailyLimit, now];
        for (const [k, v] of Object.entries(keyPatch)) { sets.push(`${k} = ?`); vals.push(v); }
        vals.push(body.id);
        await env.DB.prepare(`UPDATE ai_models SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
        return json({ ok: true, id: body.id });
      }
      const r = await env.DB.prepare(
        'INSERT INTO ai_models (sort_order, provider, base_url, name, model, key_ref, key_enc, key_hash, key_last4, key_configured, is_active, price_text, speed_text, limit_text, daily_limit, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)',
      ).bind(sortOrder, provider, baseUrl, name, model, keyPatch.key_ref ?? null, keyPatch.key_enc ?? null, keyPatch.key_hash ?? null, keyPatch.key_last4 ?? '****', keyPatch.key_configured ?? 0, String(body.price_text || ''), String(body.speed_text || ''), String(body.limit_text || ''), dailyLimit, now, now).run();
      return json({ ok: true, id: r.meta.last_row_id });
    }
    if (path.startsWith('/api/admin/ai/models/') && path.endsWith('/test') && req.method === 'POST') {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user)) return json({ error: '只有站长能进后台' }, 403);
      const id = Number(path.slice('/api/admin/ai/models/'.length, -'/test'.length));
      if (!Number.isFinite(id)) return json({ error: '模型不存在' }, 404);
      const r = await testModel(env, env.DB, id);
      return json(r, r.ok ? 200 : 400);
    }
    if (path.startsWith('/api/admin/ai/models/') && path.endsWith('/toggle') && req.method === 'POST') {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user)) return json({ error: '只有站长能进后台' }, 403);
      const id = Number(path.slice('/api/admin/ai/models/'.length, -'/toggle'.length));
      if (!Number.isFinite(id)) return json({ error: '模型不存在' }, 404);
      const row = await env.DB.prepare('SELECT * FROM ai_models WHERE id = ?').bind(id).first().catch(() => null);
      if (!row) return json({ error: '模型不存在' }, 404);
      if (!row.is_active) {
        // 启用：必须配好 Key 且测试通过
        if (!row.key_configured) return json({ error: '该模型尚未配 Key，先填 Key 保存' }, 400);
        if (row.last_test_ok !== 1) return json({ error: '该模型尚未测试通过，先点“测试”' }, 400);
        await env.DB.prepare('UPDATE ai_models SET is_active = 1, updated_at = ? WHERE id = ?').bind(Date.now(), id).run();
        return json({ ok: true, is_active: 1 });
      }
      await env.DB.prepare('UPDATE ai_models SET is_active = 0, updated_at = ? WHERE id = ?').bind(Date.now(), id).run();
      return json({ ok: true, is_active: 0 });
    }
    if (path === '/api/admin/ai/rules' && req.method === 'GET') {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user)) return json({ error: '只有站长能进后台' }, 403);
      const r = await getRules(env.DB);
      return json({ ok: true, ...r });
    }
    if (path === '/api/admin/ai/rules' && req.method === 'POST') {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user)) return json({ error: '只有站长能进后台' }, 403);
      let body;
      try { body = await req.json(); } catch { return json({ error: '请求体不是合法 JSON' }, 400); }
      const rules = body.rules || {};
      const saved = {};
      for (const [k, v] of Object.entries(rules)) {
        const r = await setRule(env.DB, k, String(v ?? ''));
        if (!r.ok) return json({ error: r.error }, 400);
        saved[k] = r.version;
      }
      return json({ ok: true, versions: saved });
    }
    if (path.startsWith('/api/admin/ai/rules/') && path.endsWith('/restore') && req.method === 'POST') {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user)) return json({ error: '只有站长能进后台' }, 403);
      const key = path.slice('/api/admin/ai/rules/'.length, -'/restore'.length);
      let body;
      try { body = await req.json(); } catch { return json({ error: '请求体不是合法 JSON' }, 400); }
      const r = await restoreRule(env.DB, key, Number(body.version));
      return json(r, r.ok ? 200 : 400);
    }
    if (path === '/api/admin/ai/status' && req.method === 'GET') {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user)) return json({ error: '只有站长能进后台' }, 403);
      const models = await listModels(env.DB);
      const today = new Date().toISOString().slice(0, 10);
      for (const m of models) {
        const u = await env.DB.prepare('SELECT count FROM ai_usage WHERE model_id = ? AND day = ?').bind(m.id, today).first().catch(() => null);
        m.used_today = u ? u.count : 0;
      }
      const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM tasks WHERE status = 'pending'").first().catch(() => ({ n: 0 }));
      const feishu = getFeishuConfig(env);
      return json({ ok: true, models, pendingTasks: pending?.n || 0, feishuConfigured: feishu.configured });
    }
    if (path === '/api/admin/credits/grant' && req.method === 'POST') {
      const user = await getSessionUser(env.DB, req);
      if (!user || !isAdmin(env, user)) return json({ error: '只有站长能进后台' }, 403);
      let body;
      try { body = await req.json(); } catch { return json({ error: '请求体不是合法 JSON' }, 400); }
      const email = String(body.email || '').trim().toLowerCase();
      const amount = Math.max(1, Math.min(100, Number(body.amount) || 1));
      const kind = String(body.kind || 'rewrite');
      if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) return json({ error: '邮箱格式不对' }, 400);
      let target = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first().catch(() => null);
      if (!target) {
        const r = await env.DB.prepare('INSERT INTO users (email, created_at, locale) VALUES (?, ?, ?)').bind(email, Date.now(), 'zh').run();
        target = { id: r.meta.last_row_id };
      }
      await grantCredits(env.DB, target.id, kind, amount);
      const bal = await getCredits(env.DB, target.id, kind);
      return json({ ok: true, balance: bal.balance });
    }

    if (path === '/robots.txt') {
      return new Response(robotsTxt(baseUrl(req)), { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...securityHeaders() } });
    }
    if (path === '/sitemap.xml') {
      return new Response(sitemapIndex(baseUrl(req)), { headers: { 'Content-Type': 'application/xml; charset=utf-8', ...securityHeaders() } });
    }
    if (path === '/sitemap-zh.xml') {
      return new Response(sitemapLang(baseUrl(req), 'zh'), { headers: { 'Content-Type': 'application/xml; charset=utf-8', ...securityHeaders() } });
    }
    if (path === '/sitemap-en.xml') {
      return new Response(sitemapLang(baseUrl(req), 'en'), { headers: { 'Content-Type': 'application/xml; charset=utf-8', ...securityHeaders() } });
    }
    if (path === '/favicon.ico' || path === '/favicon.svg') {
      return new Response(FAVICON, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400', ...securityHeaders() } });
    }
    // R2 图片代理：/img/:key 只认单段 key（扁平命名，带斜杠 404）；二维码类公开图片不鉴权
    if (path.startsWith('/img/')) {
      const key = path.slice(5);
      if (!key || key.includes('/') || key.includes('..')) {
        return new Response('Not Found', { status: 404, headers: securityHeaders() });
      }
      const obj = await env.FILES.get(key);
      if (!obj) return new Response('Not Found', { status: 404, headers: securityHeaders() });
      const ext = key.split('.').pop().toLowerCase();
      const type = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', pdf: 'application/pdf' }[ext] || 'application/octet-stream';
      return new Response(obj.body, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400', ...securityHeaders() } });
    }

    if (path === '/api/score' && req.method === 'POST') {
      let body;
      try { body = await req.json(); } catch { return json({ error: '请求体不是合法 JSON' }, 400); }
      const resumeText = String(body.resumeText || '').trim();
      const jdText = String(body.jdText || '').trim();
      const lang = body.lang === 'en' ? 'en' : 'zh';
      if (!resumeText) return json({ error: lang === 'en' ? 'Please paste your resume text first' : '请先粘贴简历文本' }, 400);
      if (resumeText.length > 20000) return json({ error: '简历文本过长（最多 20000 字）' }, 400);
      if (jdText.length > 20000) return json({ error: 'JD 文本过长（最多 20000 字）' }, 400);

      const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
      const limit = await checkGuestLimit(env, ip);
      if (!limit.allowed) {
        return json({ error: lang === 'en' ? 'Today’s free scores are used up. Come back tomorrow.' : '今日免费评分次数已用完，明天再来' }, 429);
      }

      const result = scoreResume(resumeText, jdText, lang);
      try {
        await env.DB.prepare(
          'INSERT INTO analyses (resume_id, jd_text, score_json, keywords_json, created_at) VALUES (NULL, ?, ?, ?, ?)',
        ).bind(jdText.slice(0, 5000), JSON.stringify(result), JSON.stringify(result.gaps), Date.now()).run();
      } catch (e) { console.error('analysis insert failed', e); }
      return json(result);
    }

    if (path === '/api/pay/usdt-info' && req.method === 'GET') {
      // USDT 收款信息（订单页展示位）：地址从 secret 读，不硬编码；
      // 地址本身就是公开的收款地址，付款人必须看到它才能转账。
      return json(usdtPayInfo(env));
    }

    if (path === '/api/admin/feishu-status' && req.method === 'GET') {
      // 飞书通知配置状态（供后台「基本设置 → 通知设置」显示是否配好）：
      // 只返回是否配好 + 脱敏标识，绝不返回 Secret 与接收方 ID 完整值。
      // 第 2 周后台鉴权接好后，此接口改为仅站长可调。
      return json({ ok: true, ...getFeishuConfig(env) });
    }

    if (path === '/' || path === '/index.html') {
      // 根路径：按语言判断做 302 跳转（不用 301，方便改主意）；爬虫不按 IP 跳
      const lang = detectLang(req);
      if (lang === 'en') {
        return new Response(null, { status: 302, headers: { Location: '/en/', ...securityHeaders() } });
      }
      return html(homePage('zh', baseUrl(req)));
    }
    if (path === '/en' || path === '/en/index.html') {
      return new Response(null, { status: 302, headers: { Location: '/en/', ...securityHeaders() } });
    }
    if (path === '/en/') {
      return html(homePage('en', baseUrl(req)));
    }

    return new Response('Not Found', { status: 404, headers: securityHeaders() });
  },

  // 定时任务：每分钟跑一次 — USDT 到账监听（TronGrid 轮询，见 src/usdt.js）
  // + 异步任务队列兜底（改写/求职信/互译卡住的 pending 任务）。
  // 默认手动模式：只核对并记录，不自动开通；USDT_AUTO_RELEASE 设为 '1' 后才自动放行。
  async scheduled(event, env) {
    console.log('cron tick', new Date(event.scheduledTime).toISOString());
    try {
      const r = await pollUsdtPayments(env);
      console.log('usdt poll result', JSON.stringify(r));
    } catch (e) {
      console.error('usdt poll error', e);
    }
    try {
      const r = await processPendingTasks(env, env.DB, 3);
      if (r.processed > 0) console.log('task queue processed', JSON.stringify(r));
    } catch (e) {
      console.error('task queue error', e);
    }
  },
};
