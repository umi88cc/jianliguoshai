// 简历过筛 ResumePass — Cloudflare Worker 入口（第 1 周：首页 + ATS 评分 + SEO 基础）
// 语言判断优先级：手动选择 Cookie > Accept-Language > CF-IPCountry > 默认中文；
// 只对根路径做 302 跳转；/en/ 页面本身不跳转；爬虫不按 IP 跳。
import { scoreResume } from './ats.js';
import { homePage } from './pages.js';
import { pollUsdtPayments, usdtPayInfo } from './usdt.js';
import { getFeishuConfig } from './feishu.js';

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

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...securityHeaders() } });
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
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

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

  // 定时任务：每分钟跑一次 — USDT 到账监听（TronGrid 轮询，见 src/usdt.js）。
  // 默认手动模式：只核对并记录，不自动开通；USDT_AUTO_RELEASE 设为 '1' 后才自动放行。
  async scheduled(event, env) {
    console.log('cron tick', new Date(event.scheduledTime).toISOString());
    try {
      const r = await pollUsdtPayments(env);
      console.log('usdt poll result', JSON.stringify(r));
    } catch (e) {
      console.error('usdt poll error', e);
    }
  },
};
