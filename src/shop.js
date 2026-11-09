// 简历过筛 — 订单页 / 会员中心 / 模板库（第 3 周，规划 §5 / §6 / §8）
// 设计与首页同一套：钢蓝 #1668B4、近白底 #F7F8F9、圆角 10px、最大宽 1060px；
// 移动优先：按钮 ≥44px、输入框 ≥16px；每个按钮操作都有加载反馈（100ms 内变状态、防重复点）。
// 合规：USDT 只在英文版展示；国内订单绝不自动开通；一次性付费、到期不自动续费；不支持退款。

import { CSS } from "./pages.js";
import { I18N } from "./i18n.js";
import {
  PLANS,
  PLAN_SLUGS,
  formatCny,
  formatUsdt,
  methodsForLang,
  statusLabel,
  methodLabel,
} from "./plans.js";
import { TEMPLATES, templatesForLang } from "./templates.js";

function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

const EXTRA_CSS = `
.plan-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:16px}
.plan{border:2px solid var(--line);border-radius:10px;padding:20px;cursor:pointer;background:#fff}
.plan.sel{border-color:var(--blue);box-shadow:0 0 0 2px rgba(22,104,180,.15)}
.plan h3{font-size:17px}
.plan .price{font-size:24px;font-weight:700;color:var(--blue);margin:8px 0}
.plan .price small{font-size:13px;color:var(--muted);font-weight:400}
.plan p{font-size:14px;color:var(--muted)}
.method-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:12px}
.method{border:2px solid var(--line);border-radius:10px;padding:16px;cursor:pointer;background:#fff;font-size:15px;font-weight:600}
.method.sel{border-color:var(--blue);box-shadow:0 0 0 2px rgba(22,104,180,.15)}
.method small{display:block;font-weight:400;color:var(--muted);font-size:13px;margin-top:4px}
.qr-big{text-align:center;margin-top:16px}
.qr-big img{width:220px;height:220px;border:1px solid var(--line);border-radius:10px;background:#fff}
.warn{background:#fdf6e7;border:1px solid #f0d9a0;border-radius:10px;padding:12px 16px;font-size:14px;margin-top:12px}
.warn.red{background:#fdeeee;border-color:#f3b8b8}
.kv{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--line);font-size:15px}
.kv:last-child{border-bottom:0}
.kv b{font-weight:600}
.order-row{border:1px solid var(--line);border-radius:10px;padding:14px 16px;margin-top:12px;background:#fff}
.order-row .top{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:15px}
.tpl-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:16px}
.tpl{border:1px solid var(--line);border-radius:10px;padding:0;overflow:hidden;background:#fff}
.tpl .prev{padding:20px;border-bottom:1px solid var(--line);background:#fff;min-height:260px}
.tpl .prev h4{font-size:17px}
.tpl .prev .meta{font-size:13px;color:var(--muted);margin-top:2px}
.tpl .prev h5{font-size:13px;margin-top:12px;text-transform:uppercase;letter-spacing:.04em}
.tpl .prev p{font-size:13px;color:var(--text);white-space:pre-wrap;line-height:1.6}
.tpl .body{padding:16px}
.tpl .body h3{font-size:16px}
.tpl .body p{font-size:14px;color:var(--muted);margin-top:4px}
.guide{border:2px solid var(--blue);border-radius:10px;padding:20px;margin-top:24px;background:#f0f6fc}
.guide .steps{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px}
.guide .gstep{flex:1;min-width:140px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px}
@media (max-width:640px){
  .plan-grid,.tpl-grid{grid-template-columns:1fr}
  .method-grid{grid-template-columns:1fr}
}
`;

function shell(lang, base, title, body, extraCss = "") {
  const t = I18N[lang];
  const other = lang === "zh" ? "en" : "zh";
  const otherLabel = lang === "zh" ? "EN" : "中文";
  const home = lang === "zh" ? "/" : "/en/";
  const prefix = lang === "zh" ? "" : "/en";
  return `<!DOCTYPE html>
<html lang="${t.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} - ${lang === "zh" ? "简历过筛" : "ResumePass"}</title>
<meta name="description" content="${esc(title)}">
<link rel="canonical" href="${base}${prefix}/">
<style>${CSS}${EXTRA_CSS}${extraCss}</style>
</head>
<body>
<script>
const $ = (id) => document.getElementById(id);
const escH = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function setBtn(btn, busy, busyText) {
  if (!btn) return;
  if (busy) { btn.dataset.orig = btn.textContent; btn.disabled = true; btn.textContent = busyText || '正在处理中…'; }
  else { btn.disabled = false; if (btn.dataset.orig) btn.textContent = btn.dataset.orig; }
}
async function api(path, method, body) {
  const r = await fetch(path, { method: method || 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || ('请求失败 ' + r.status));
  return data;
}
</script>
<header class="site"><nav class="nav" aria-label="main">
<a class="brand" href="${home}">${lang === "zh" ? "简历过筛" : "ResumePass"}<small>${lang === "zh" ? "ATS 评分" : "ATS Score"}</small></a>
<a class="item" href="${home}">${esc(t.navHome)}</a>
<a class="item" href="${prefix}/templates">${esc(t.navTemplates)}</a>
<a class="item" href="${prefix}/me">${esc(t.navMember)}</a>
<a class="lang" href="${other === "zh" ? "/" : "/en/"}">${otherLabel}</a>
</nav></header>
<main class="wrap">${body}</main>
<footer class="site"><p>${esc(t.footer)}</p></footer>
</body>
</html>`;
}

// ================= 订单页 =================
export function orderPage(lang, base, { paypalConfigured, usdtConfigured }) {
  const t = I18N[lang];
  const plans = PLAN_SLUGS.map((s) => PLANS[s]);
  const methods = methodsForLang(lang).filter((m) => {
    if (m === "paypal") return paypalConfigured;
    if (m === "usdt") return usdtConfigured;
    return true;
  });
  const planCards = plans
    .map(
      (p, i) => `
    <div class="plan${i === 0 ? " sel" : ""}" data-plan="${p.slug}" role="button" tabindex="0">
      <h3>${lang === "en" ? esc(p.name_en) : esc(p.name_zh)}</h3>
      <div class="price">${lang === "en" ? "$" + (p.usdt_sun / 1e6).toFixed(2) + " <small>USDT</small>" : "¥" + p.price_cents / 100 + " <small>一次性</small>"}</div>
      <p>${lang === "en" ? esc(p.desc_en) : esc(p.desc_zh)}</p>
    </div>`,
    )
    .join("");
  const methodCards = methods
    .map((m, i) => {
      const label = methodLabel(m, lang);
      const sub =
        m === "wechat"
          ? lang === "en"
            ? ""
            : "扫商户码付款，站长人工确认"
          : m === "alipay"
            ? lang === "en"
              ? ""
              : "扫商户码付款，站长人工确认"
            : m === "usdt"
              ? "TRC-20 · 30 min expiry"
              : "PayPal checkout";
      return `<div class="method${i === 0 ? " sel" : ""}" data-method="${m}" role="button" tabindex="0">${esc(label)}<small>${esc(sub)}</small></div>`;
    })
    .join("");
  const body = `
<section class="card" style="margin-top:24px">
<h2>${lang === "en" ? "Buy a plan" : "购买套餐"}</h2>
<p class="hint">${lang === "en" ? "One-time payment. No auto-renewal. Virtual service — once activated, orders are generally non-refundable." : "一次性付费，到期不自动续费。本站是虚拟资源类服务，一经开通一般不支持退款，下单前请看清档位和权益。"}</p>
<div id="loginBox">
<p class="hint">${lang === "en" ? "Log in with an email code to buy." : "请先用邮箱验证码登录后再下单。"}</p>
<div class="tool-actions">
<input id="loginEmail" type="email" placeholder="${esc(t.emailPh)}" style="flex:1;min-width:200px;padding:12px;border:1px solid var(--line);border-radius:10px;font-size:16px" autocomplete="email">
<button class="btn ghost" id="sendCodeBtn" type="button">${esc(t.sendCodeBtn)}</button>
</div>
<div class="tool-actions">
<input id="loginCode" type="text" inputmode="numeric" maxlength="6" placeholder="${esc(t.codePh)}" style="flex:1;min-width:140px;padding:12px;border:1px solid var(--line);border-radius:10px;font-size:16px">
<button class="btn" id="loginBtn" type="button">${esc(t.loginBtn)}</button>
</div>
<p class="status" id="loginStatus"></p>
</div>
<div id="orderBox" style="display:none">
<h3 style="font-size:16px;margin-top:8px">${lang === "en" ? "1. Choose a plan" : "1. 选套餐"}</h3>
<div class="plan-grid">${planCards}</div>
<h3 style="font-size:16px;margin-top:20px">${lang === "en" ? "2. Choose how to pay" : "2. 选支付方式"}</h3>
<div class="method-grid">${methodCards}</div>
<div class="tool-actions"><button class="btn" id="createOrderBtn" type="button">${lang === "en" ? "Create order" : "生成订单"}</button></div>
<p class="status" id="orderStatus"></p>
</div>
</section>

<section class="card" id="payCard" style="display:none">
<h2>${lang === "en" ? "Pay for your order" : "付款"}</h2>
<div id="payInfo"></div>
<div id="paidForm" style="margin-top:16px">
<label for="txid" id="txidLabel">${lang === "en" ? "Transaction ID (payment ref)" : "交易单号"}</label>
<input id="txid" type="text" placeholder="${lang === "en" ? "Paste the transaction ID" : "粘贴交易单号"}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;font-size:16px">
<label for="payerNote">${lang === "en" ? "Note (optional)" : "备注（可选：付款人昵称等）"}</label>
<input id="payerNote" type="text" placeholder="${lang === "en" ? "Your payment nickname (optional)" : "付款人昵称（可选）"}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;font-size:16px">
<label>${lang === "en" ? "Payment screenshot (optional, ≤2MB)" : "付款截图（可选，≤2MB）"}</label>
<div class="tool-actions"><input type="file" id="shotInput" accept="image/*"><button class="btn ghost" id="uploadShotBtn" type="button">${lang === "en" ? "Upload" : "上传截图"}</button><span id="shotName" style="font-size:14px;color:var(--muted)"></span></div>
<div class="tool-actions" style="margin-top:16px"><button class="btn" id="paidBtn" type="button">${lang === "en" ? "I have paid" : "我已付款"}</button></div>
<p class="status" id="paidStatus"></p>
</div>
<div id="paidDone" style="display:none;margin-top:16px">
<p class="warn">${lang === "en" ? "Submitted. The owner will verify and activate your plan. You can check the status in Membership." : "已提交，站长正在核对账单，确认后自动开通。你可以在「会员中心」查看订单状态。"}</p>
<p style="margin-top:12px"><a class="btn ghost" href="${lang === "zh" ? "/me" : "/en/me"}">${lang === "en" ? "Go to Membership" : "去会员中心查看"}</a></p>
</div>
</section>
<script>
const LANG = ${JSON.stringify(lang)};
let ME = null;
let SEL_PLAN = ${JSON.stringify(plans[0].slug)};
let SEL_METHOD = ${JSON.stringify(methods[0] || "")};
let CUR_ORDER = null;
let SHOT_KEY = '';
document.querySelectorAll('.plan').forEach((el) => el.addEventListener('click', () => {
  document.querySelectorAll('.plan').forEach((x) => x.classList.remove('sel'));
  el.classList.add('sel'); SEL_PLAN = el.dataset.plan;
}));
document.querySelectorAll('.method').forEach((el) => el.addEventListener('click', () => {
  document.querySelectorAll('.method').forEach((x) => x.classList.remove('sel'));
  el.classList.add('sel'); SEL_METHOD = el.dataset.method;
}));
async function refreshMe() {
  try {
    const d = await api('/api/auth/me');
    ME = d.user || null;
    $('loginBox').style.display = ME ? 'none' : '';
    $('orderBox').style.display = ME ? '' : 'none';
  } catch (e) { $('loginBox').style.display = ''; $('orderBox').style.display = 'none'; }
}
$('sendCodeBtn').addEventListener('click', async () => {
  const email = $('loginEmail').value.trim();
  if (!email) { $('loginStatus').textContent = LANG === 'en' ? 'Enter your email' : '请先填邮箱'; return; }
  const btn = $('sendCodeBtn'); setBtn(btn, true, LANG === 'en' ? 'Sending…' : '发送中…');
  try {
    const d = await api('/api/auth/send-code', 'POST', { email });
    $('loginStatus').textContent = d.devMode ? ('开发模式验证码：' + d.code) : (LANG === 'en' ? 'Code sent to your email' : '验证码已发到邮箱，请查收');
  } catch (e) { $('loginStatus').textContent = e.message; }
  finally { setBtn(btn, false); }
});
$('loginBtn').addEventListener('click', async () => {
  const email = $('loginEmail').value.trim();
  const code = $('loginCode').value.trim();
  if (!email || !code) { $('loginStatus').textContent = LANG === 'en' ? 'Enter email and code' : '请填邮箱和验证码'; return; }
  const btn = $('loginBtn'); setBtn(btn, true, LANG === 'en' ? 'Logging in…' : '登录中…');
  try { await api('/api/auth/verify-code', 'POST', { email, code }); await refreshMe(); }
  catch (e) { $('loginStatus').textContent = e.message; }
  finally { setBtn(btn, false); }
});
$('createOrderBtn').addEventListener('click', async () => {
  const btn = $('createOrderBtn'); setBtn(btn, true, LANG === 'en' ? 'Creating order…' : '正在生成订单…');
  $('orderStatus').textContent = LANG === 'en' ? 'Creating your order…' : '正在生成订单…';
  try {
    const d = await api('/api/orders', 'POST', { plan: SEL_PLAN, method: SEL_METHOD, lang: LANG });
    CUR_ORDER = d.order;
    $('orderStatus').textContent = '';
    renderPay(d.order, d.pay);
    $('payCard').style.display = '';
    $('payCard').scrollIntoView({ behavior: 'smooth' });
  } catch (e) { $('orderStatus').textContent = e.message; }
  finally { setBtn(btn, false); }
});
function renderPay(o, pay) {
  let h = '<div class="kv"><span>' + (LANG === 'en' ? 'Order No.' : '订单号') + '</span><b>' + escH(o.order_no) + '</b></div>'
    + '<div class="kv"><span>' + (LANG === 'en' ? 'Plan' : '套餐') + '</span><b>' + escH(o.plan_name) + '</b></div>'
    + '<div class="kv"><span>' + (LANG === 'en' ? 'Amount due' : '应付金额') + '</span><b style="font-size:20px;color:var(--blue)">' + escH(o.amount_text) + '</b></div>'
    + '<div class="kv"><span>' + (LANG === 'en' ? 'Method' : '支付方式') + '</span><b>' + escH(o.method) + '</b></div>';
  if (o.method === 'wechat' || o.method === 'alipay') {
    h += '<div class="qr-big"><img src="' + (o.method === 'wechat' ? '/img/wechat-merchant-pay-qr.png' : '/img/alipay-pay-qr.png') + '" alt="pay QR" width="220" height="220">'
      + '<p style="margin-top:8px;font-size:14px;color:var(--muted)">' + (LANG === 'en' ? 'Scan to pay the exact amount, then click “I have paid” below.' : '扫码付款（请按上方金额一分不差地付），付完点下方“我已付款”。') + '</p></div>'
      + '<p class="warn">' + (LANG === 'en' ? 'Add the last 4 digits of your order number in the payment note if possible. The owner verifies against the bank bill — a screenshot alone is not proof.' : '付款时请尽量在备注里写订单号后 4 位。站长以微信/支付宝账单为准核对（金额 + 时间），截图只作辅助。') + '</p>';
  } else if (o.method === 'usdt') {
    h += '<p class="warn red">⚠️ ' + (LANG === 'en' ? 'TRC-20 network only. Pay the exact amount — a single cent off will fail to match. Wrong chain or underpayment may be lost permanently; no refund.' : '只走 TRC-20 网络，金额一分不能差；转错链或少付可能永久丢失，不承诺找回。') + '</p>'
      + '<div class="kv"><span>TRC-20 address</span><b style="word-break:break-all">' + escH(pay.address) + '</b></div>'
      + '<div class="tool-actions"><button class="btn ghost" id="copyAddrBtn" type="button">' + (LANG === 'en' ? 'Copy address' : '复制地址') + '</button></div>'
      + '<p class="note">' + (LANG === 'en' ? 'Order expires in 30 minutes. Arrival takes ~1 minute + 19 confirmations. If you pay after expiry, contact the owner with the TxID for manual activation — no refund.' : '订单 30 分钟内有效；到账约需 1 分钟 + 19 个确认。过期后转账的，凭交易哈希联系站长人工开通，不自动到账、不退款。') + '</p>';
  } else if (o.method === 'paypal') {
    h += '<p class="note">' + (LANG === 'en' ? 'You will be redirected to PayPal to complete the payment.' : '点击下方按钮跳转到 PayPal 完成付款。') + '</p>'
      + '<div class="tool-actions"><a class="btn" href="' + escH(pay.approve_url || '#') + '" target="_blank" rel="noopener">' + (LANG === 'en' ? 'Pay with PayPal' : '用 PayPal 付款') + '</a></div>';
  }
  $('payInfo').innerHTML = h;
  // 交易单号标签按支付方式区分：国内用户永远看不到 USDT / TxID 字样
  const txLabel = document.getElementById('txidLabel');
  const txInput = document.getElementById('txid');
  if (txLabel && txInput) {
    if (o.method === 'usdt') {
      txLabel.textContent = LANG === 'en' ? 'Transaction hash (TxID, 64 hex chars)' : '交易哈希（TxID，64 位十六进制）';
      txInput.placeholder = LANG === 'en' ? 'Paste the 64-hex transaction hash' : '粘贴 64 位交易哈希';
    } else if (o.method === 'paypal') {
      txLabel.textContent = LANG === 'en' ? 'PayPal transaction ID' : 'PayPal 交易单号';
      txInput.placeholder = LANG === 'en' ? 'Paste the PayPal transaction ID' : '粘贴 PayPal 交易单号';
    } else {
      txLabel.textContent = LANG === 'en' ? 'Transaction ID (WeChat/Alipay payment ref)' : '交易单号（微信/支付宝交易单号）';
      txInput.placeholder = LANG === 'en' ? 'Paste the payment transaction ID' : '粘贴交易单号';
    }
  }
  const copyBtn = document.getElementById('copyAddrBtn');
  if (copyBtn) copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(pay.address); copyBtn.textContent = LANG === 'en' ? 'Copied' : '已复制'; }
    catch (e) { copyBtn.textContent = pay.address; }
  });
}
$('uploadShotBtn').addEventListener('click', async () => {
  const f = $('shotInput').files[0];
  if (!f) { $('paidStatus').textContent = LANG === 'en' ? 'Choose a screenshot first' : '请先选一张付款截图'; return; }
  if (f.size > 2 * 1024 * 1024) { $('paidStatus').textContent = LANG === 'en' ? 'Screenshot must be ≤2MB' : '截图不能超过 2MB'; return; }
  const btn = $('uploadShotBtn'); setBtn(btn, true, LANG === 'en' ? 'Uploading…' : '上传中…');
  try {
    const buf = await f.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    const d = await api('/api/upload/screenshot', 'POST', { name: f.name, type: f.type, data: b64 });
    SHOT_KEY = d.key;
    $('shotName').textContent = LANG === 'en' ? 'Uploaded' : '已上传';
    $('paidStatus').textContent = '';
  } catch (e) { $('paidStatus').textContent = e.message; }
  finally { setBtn(btn, false); }
});
$('paidBtn').addEventListener('click', async () => {
  if (!CUR_ORDER) return;
  const txid = $('txid').value.trim();
  if (CUR_ORDER.method === 'usdt' && !/^[0-9a-fA-F]{64}$/.test(txid)) { $('paidStatus').textContent = LANG === 'en' ? 'TxID is a 64-hex transaction hash' : 'TxID 是 64 位十六进制交易哈希，请核对后填写'; return; }
  const btn = $('paidBtn'); setBtn(btn, true, LANG === 'en' ? 'Submitting…' : '正在提交…');
  $('paidStatus').textContent = LANG === 'en' ? 'Submitting your payment info…' : '正在提交付款信息…';
  try {
    const d = await api('/api/orders/' + CUR_ORDER.id + '/paid', 'POST', { txid, payerNote: $('payerNote').value.trim(), screenshotKey: SHOT_KEY });
    $('paidStatus').textContent = '';
    $('paidForm').style.display = 'none';
    $('paidDone').style.display = '';
  } catch (e) { $('paidStatus').textContent = e.message; }
  finally { setBtn(btn, false); }
});
refreshMe();
</script>`;
  return shell(lang, base, lang === "en" ? "Buy a plan" : "购买套餐", body);
}

// ================= 会员中心 =================
export function memberPage(lang, base) {
  const t = I18N[lang];
  const body = `
<section class="card" style="margin-top:24px">
<h2>${esc(t.navMember)}</h2>
<p class="hint">${lang === "en" ? "Your plan, remaining credits, expiry and order history." : "当前套餐、剩余次数、到期日和购买记录。"}</p>
<div id="loginBox">
<p class="hint">${lang === "en" ? "Log in with an email code to see your membership." : "请先用邮箱验证码登录。"}</p>
<div class="tool-actions">
<input id="loginEmail" type="email" placeholder="${esc(t.emailPh)}" style="flex:1;min-width:200px;padding:12px;border:1px solid var(--line);border-radius:10px;font-size:16px" autocomplete="email">
<button class="btn ghost" id="sendCodeBtn" type="button">${esc(t.sendCodeBtn)}</button>
</div>
<div class="tool-actions">
<input id="loginCode" type="text" inputmode="numeric" maxlength="6" placeholder="${esc(t.codePh)}" style="flex:1;min-width:140px;padding:12px;border:1px solid var(--line);border-radius:10px;font-size:16px">
<button class="btn" id="loginBtn" type="button">${esc(t.loginBtn)}</button>
</div>
<p class="status" id="loginStatus"></p>
</div>
<div id="memberBox" style="display:none">
<div id="planBox"></div>
<h3 style="font-size:16px;margin-top:20px">${lang === "en" ? "Notifications" : "站内通知"}</h3>
<div id="notifBox"></div>
<h3 style="font-size:16px;margin-top:20px">${lang === "en" ? "Order history" : "购买记录"}</h3>
<div id="ordersBox"></div>
<div class="tool-actions" style="margin-top:16px"><a class="btn" href="${lang === "zh" ? "/orders/new" : "/en/orders/new"}">${lang === "en" ? "Buy / renew a plan" : "购买 / 续费"}</a></div>
</div>
</section>
<script>
const LANG = ${JSON.stringify(lang)};
async function refreshMe() {
  try {
    const d = await api('/api/auth/me');
    if (!d.user) { $('loginBox').style.display = ''; $('memberBox').style.display = 'none'; return; }
    $('loginBox').style.display = 'none';
    $('memberBox').style.display = '';
    loadSummary();
  } catch (e) { $('loginBox').style.display = ''; $('memberBox').style.display = 'none'; }
}
$('sendCodeBtn').addEventListener('click', async () => {
  const email = $('loginEmail').value.trim();
  if (!email) { $('loginStatus').textContent = LANG === 'en' ? 'Enter your email' : '请先填邮箱'; return; }
  const btn = $('sendCodeBtn'); setBtn(btn, true, LANG === 'en' ? 'Sending…' : '发送中…');
  try {
    const d = await api('/api/auth/send-code', 'POST', { email });
    $('loginStatus').textContent = d.devMode ? ('开发模式验证码：' + d.code) : (LANG === 'en' ? 'Code sent to your email' : '验证码已发到邮箱，请查收');
  } catch (e) { $('loginStatus').textContent = e.message; }
  finally { setBtn(btn, false); }
});
$('loginBtn').addEventListener('click', async () => {
  const email = $('loginEmail').value.trim();
  const code = $('loginCode').value.trim();
  if (!email || !code) { $('loginStatus').textContent = LANG === 'en' ? 'Enter email and code' : '请填邮箱和验证码'; return; }
  const btn = $('loginBtn'); setBtn(btn, true, LANG === 'en' ? 'Logging in…' : '登录中…');
  try { await api('/api/auth/verify-code', 'POST', { email, code }); await refreshMe(); }
  catch (e) { $('loginStatus').textContent = e.message; }
  finally { setBtn(btn, false); }
});
function fmtDate(ts) { if (!ts) return '—'; return new Date(ts).toISOString().slice(0, 10); }
function fmtCredits(b) { return b === -1 ? (LANG === 'en' ? 'Unlimited' : '不限') : String(b); }
async function loadSummary() {
  try {
    const d = await api('/api/me/summary');
    const m = d.membership || {};
    const c = d.credits || {};
    $('planBox').innerHTML =
      '<div class="kv"><span>' + (LANG === 'en' ? 'Current plan' : '当前套餐') + '</span><b>' + escH(m.plan_name || (LANG === 'en' ? 'Free' : '免费版')) + '</b></div>'
      + '<div class="kv"><span>' + (LANG === 'en' ? 'Rewrite credits left' : '改写剩余额度') + '</span><b>' + escH(fmtCredits(c.rewrite)) + '</b></div>'
      + '<div class="kv"><span>' + (LANG === 'en' ? 'Export credits left' : '导出剩余额度') + '</span><b>' + escH(fmtCredits(c.export)) + '</b></div>'
      + '<div class="kv"><span>' + (LANG === 'en' ? 'Expires on' : '到期日') + '</span><b>' + escH(m.expires_at ? fmtDate(m.expires_at) : (LANG === 'en' ? 'Never (lifetime / pay-per-use)' : '不过期（终身 / 按次）')) + '</b></div>'
      + (m.expires_soon ? '<p class="warn">' + (LANG === 'en' ? 'Your plan expires in 3 days or less. Renew in time to keep your credits.' : '你的套餐 3 天内到期，请及时续费，过期后额度失效。') + '</p>' : '');
    $('notifBox').innerHTML = (d.notifications || []).length
      ? d.notifications.map((n) => '<div class="order-row" style="' + (n.is_read ? 'opacity:.65' : '') + '"><div class="top"><b>' + escH(n.title) + '</b><span style="color:var(--muted);font-size:13px">' + escH(fmtDate(n.created_at)) + '</span></div><p style="font-size:14px;color:var(--muted);margin-top:4px">' + escH(n.body) + '</p>'
        + (n.is_read ? '' : '<button class="btn ghost" style="min-height:36px;padding:6px 14px;font-size:14px;margin-top:8px" data-read="' + n.id + '">' + (LANG === 'en' ? 'Mark as read' : '标为已读') + '</button>') + '</div>').join('')
      : '<p class="note">' + (LANG === 'en' ? 'No notifications yet.' : '暂无通知。') + '</p>';
    document.querySelectorAll('[data-read]').forEach((b) => b.addEventListener('click', async () => {
      try { await api('/api/notifications/' + b.dataset.read + '/read', 'POST'); loadSummary(); } catch (e) {}
    }));
    $('ordersBox').innerHTML = (d.orders || []).length
      ? d.orders.map((o) => '<div class="order-row"><div class="top"><span><b>' + escH(o.order_no) + '</b> · ' + escH(o.plan_name) + '</span><span>' + escH(o.amount_text) + '</span></div>'
        + '<p style="font-size:14px;color:var(--muted);margin-top:4px">' + escH(o.status_label) + ' · ' + escH(o.method) + ' · ' + escH(fmtDate(o.created_at))
        + (o.reject_reason ? '<br>' + (LANG === 'en' ? 'Reason: ' : '原因：') + escH(o.reject_reason) : '') + '</p></div>').join('')
      : '<p class="note">' + (LANG === 'en' ? 'No orders yet.' : '还没有购买记录。') + '</p>';
  } catch (e) {
    $('planBox').innerHTML = '<p class="note">' + escH(e.message) + '</p>';
  }
}
refreshMe();
</script>`;
  return shell(lang, base, t.navMember, body);
}

// ================= 模板库 =================
export function templatesPage(lang, base) {
  const t = I18N[lang];
  const list = templatesForLang(lang);
  const cards = list
    .map((tpl) => {
      const s = tpl.sample;
      const secs = s.sections
        .map(
          (sec) =>
            (sec.h
              ? `<h5 style="color:${tpl.accent}">${esc(sec.h)}</h5>`
              : "") + `<p>${esc(sec.body)}</p>`,
        )
        .join("");
      return `<div class="tpl">
      <div class="prev">
        <h4 style="color:${tpl.accent}">${esc(s.name)}</h4>
        <p class="meta">${esc(s.meta)}</p>
        ${s.target ? `<p class="meta">${esc(s.target)}</p>` : ""}
        ${secs}
      </div>
      <div class="body">
        <h3>${lang === "en" ? esc(tpl.name_en) : esc(tpl.name)}${lang === "en" ? "" : "模板"}</h3>
        <p>${esc(tpl.desc)}</p>
        <div class="tool-actions"><button class="btn" data-apply="${tpl.id}" type="button">${lang === "en" ? "Use this template (free)" : "免费套用此模板"}</button></div>
      </div>
    </div>`;
    })
    .join("");
  const body = `
<section style="margin-top:24px">
<h2 style="font-size:22px">${esc(t.navTemplates)}</h2>
<p class="hint" style="font-size:14px;color:var(--muted);margin-top:6px">${lang === "en" ? "All templates are free to view and use. They are single-column with standard headings, so ATS parsers can read them. Apply one to fill the resume box on the home page, then score and rewrite as usual." : "模板全部免费看、免费套用。全部单栏、标准标题，ATS 能正常解析。套用后会把模板骨架填进首页的简历框，再按正常流程评分、改写。"}</p>
<p class="note">${lang === "en" ? "Preview resumes use a fictional person for layout demo only." : "预览里的简历是虚构人物，仅作版式演示。"}</p>
<div class="tpl-grid">${cards}</div>
</section>
<script>
document.querySelectorAll('[data-apply]').forEach((b) => b.addEventListener('click', () => {
  const id = b.dataset.apply;
  const tpl = ${JSON.stringify(TEMPLATES)}.find((x) => x.id === id);
  if (!tpl) return;
  try { localStorage.setItem('rp_template_skeleton', tpl.skeleton); localStorage.setItem('rp_template_name', tpl.id); } catch (e) {}
  b.disabled = true;
  b.textContent = ${JSON.stringify(lang === "en" ? "Applied — go score it" : "已套用，去测分")};
  setTimeout(() => { window.location.href = ${JSON.stringify(lang === "zh" ? "/#tool" : "/en/#tool")}; }, 400);
}));
</script>`;
  return shell(lang, base, t.navTemplates, body);
}
